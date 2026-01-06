import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import copyImageMiddleware from '../../middleware/copyMiddleware.mjs';
import getImage from '../../middleware/getImageIfExist.mjs';
import dotenv from 'dotenv';
import { Addition, checkIsNumber, getDaysBetween, isEqualNumber, ISOString, isValidDate, LocalDate, Multiplication, toArray, toNumber } from '../../helper_functions.mjs';
import SPCall from '../../middleware/SPcall.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import fetch from 'node-fetch';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const findRecentDate = (dateArray) => {
    return new Date(Math.max(...dateArray.map(d => new Date(d))))
}


const RetailerControll = () => {
    const domain = process.env.domain;

    const getSFCustomers = async (req, res) => {
        const {
            isRetailer = 1,
            isVendor = 0,
            Retailer_Id,
            PhoneNumber,
            ContactPerson_Name,
            Route_Id,
            Area_Id,
            City,


        } = req.query;

        try {
            let query = `
                SELECT 
                    rm.*,
                    COALESCE(rom.Route_Name, '') AS RouteGet,
                    COALESCE(am.Area_Name, '') AS AreaGet,
                    COALESCE(sm.State_Name, '') AS StateGet,
                    COALESCE(cm.Company_Name, '') AS Company_Name,
                    COALESCE(modify.Name, '') AS lastModifiedBy,
                    COALESCE(created.Name, '') AS createdBy,
                    COALESCE((
                        SELECT TOP (1) *
                        FROM tbl_Retailers_Locations
                        WHERE Retailer_Id = rm.Retailer_Id AND isActiveLocation = 1
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    ), '{}') AS VERIFIED_LOCATION,
                    COALESCE((
                        SELECT TOP (5) ml.*,
                            COALESCE((SELECT NAME FROM tbl_Users WHERE UserId = ml.EntryBy), 'unknown') AS EntryByGet
                        FROM tbl_Retailers_Locations AS ml
                        WHERE rm.Retailer_Id = ml.Retailer_Id
                        ORDER BY CONVERT(DATETIME, EntryAt) DESC
                        FOR JSON PATH
                    ), '[]') AS AllLocations
                FROM tbl_Retailers_Master AS rm
                LEFT JOIN tbl_Route_Master AS rom ON rom.Route_Id = rm.Route_Id
                LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
                LEFT JOIN tbl_State_Master AS sm ON sm.State_Id = rm.State_Id
                LEFT JOIN tbl_Company_Master AS cm ON cm.Company_id = rm.Company_Id
                LEFT JOIN tbl_Users AS modify ON modify.UserId = rm.Updated_By
                LEFT JOIN tbl_Users AS created ON created.UserId = rm.Created_By
                WHERE rm.isVendor = @isVendor AND rm.isRetailer = @isRetailer
            `;

            const request = new sql.Request();
            request.input('isRetailer', isRetailer);
            request.input('isVendor', isVendor);

            if (Retailer_Id) {
                query += ` AND rm.Retailer_Id = @Retailer_Id`;
                request.input('Retailer_Id', Retailer_Id);
            }

            if (PhoneNumber) {
                query += ` AND rm.Mobile_No LIKE '%' + @PhoneNumber + '%'`;
                request.input('PhoneNumber', PhoneNumber);
            }

            if (ContactPerson_Name) {
                query += ` AND rm.Contact_Person LIKE '%' + @ContactPerson_Name + '%'`;
                request.input('ContactPerson_Name', ContactPerson_Name);
            }

            if (Route_Id && Route_Id !== 'ALL') {
                query += ` AND rm.Route_Id = @Route_Id`;
                request.input('Route_Id', Route_Id);
            }

            if (Area_Id && Area_Id !== 'ALL') {
                query += ` AND rm.Area_Id = @Area_Id`;
                request.input('Area_Id', Area_Id);
            }

            if (City && City !== 'ALL') {
                query += ` AND rm.Reatailer_City LIKE '%' + @City + '%'`;
                request.input('City', City);
            }


            query += ` ORDER BY rm.Retailer_Id DESC`;

            const result = await request.query(query);

            if (result.recordset.length) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    VERIFIED_LOCATION: JSON.parse(o.VERIFIED_LOCATION || '{}'),
                    AllLocations: JSON.parse(o.AllLocations || '[]'),
                    imageUrl: getImage('retailers', o?.ImageName)
                }));
                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const getRetailerDropDown = async (req, res) => {
        const { isRetailer = 1, isVendor = 0 } = req.query;

        try {
            const request = new sql.Request()
                .input('isRetailer', isRetailer)
                .input('isVendor', isVendor)
                .query(`
                    DECLARE @retailerIds TABLE (Retailer_Id INT);
                    INSERT INTO @retailerIds (Retailer_Id)
                    SELECT Retailer_Id 
                    FROM tbl_Retailers_Master
                    WHERE isRetailer = @isRetailer AND isVendor = @isVendor;  
                    -- getting retailers
                    SELECT 
                        Retailer_Id,
                        Retailer_Name,
                        Reatailer_Address,
                        COALESCE(Gstno, '') AS Gstno
                    FROM tbl_Retailers_Master
                    WHERE Retailer_Id IN (SELECT DISTINCT Retailer_Id FROM @retailerIds);
                    -- getting retailer gen info
                    SELECT 
                        id,
                        retailerId,
                        deliveryName,
                        phoneNumber,
                        cityName,
                        deliveryAddress,
                        gstNumber,
                        stateName
                    FROM tbl_Sales_Delivery_Address 
                    WHERE retailerId IN (SELECT DISTINCT Retailer_Id FROM @retailerIds);`
                );

            const result = await request;

            const [retailers, deliveryAddresses] = result.recordsets;

            const withAddresses = retailers.map(retailer => ({
                ...retailer,
                deliveryAddresses: deliveryAddresses.filter(
                    address => isEqualNumber(address.retailerId, retailer.Retailer_Id)
                )
            }));

            if (result.recordset.length > 0) {
                dataFound(res, withAddresses)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getAreaRetailers = async (req, res) => {
        const { isRetailer = 1, isVendor = 0 } = req.query;

        try {
            const query = `
            SELECT
            	a.Area_Id,
            	a.Area_Name,
            	COALESCE((
            		SELECT 
                        rm.*,
                        COALESCE(rom.Route_Name, '') AS RouteGet,
                        COALESCE(am.Area_Name, '') AS AreaGet,
                        COALESCE(sm.State_Name, '') AS StateGet,
                        COALESCE(cm.Company_Name, '') AS Company_Name,
                        COALESCE(modify.Name, '') AS lastModifiedBy,
                        COALESCE(created.Name, '') AS createdBy,

                        COALESCE(
                            (
                                SELECT 
                                    TOP (1) *
                                FROM 
                                    tbl_Retailers_Locations
                                WHERE
                                    Retailer_Id = rm.Retailer_Id
                                    AND
                                    isActiveLocation = 1
                                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                            ), '{}'
                        ) AS VERIFIED_LOCATION
                    
                    FROM
                        tbl_Retailers_Master AS rm
                        LEFT JOIN
                            tbl_Route_Master AS rom
                            ON rom.Route_Id = rm.Route_Id
                        LEFT JOIN
                            tbl_Area_Master AS am
                            ON am.Area_Id = rm.Area_Id
                        LEFT JOIN
                            tbl_State_Master AS sm
                            ON sm.State_Id = rm.State_Id
                        LEFT JOIN
                            tbl_Company_Master AS cm
                            ON cm.Company_id = rm.Company_Id
                        LEFT JOIN
                            tbl_Users AS modify
                            ON modify.UserId = rm.Updated_By
                        LEFT JOIN
                            tbl_Users AS created
                            ON created.UserId = rm.Created_By
            		WHERE
            			rm.Area_Id = a.Area_Id
            		FOR JSON PATH
            	), '[]') AS Area_Retailers
            FROM
            	tbl_Area_Master AS a`;
            // AND
            // rm.Company_Id = @comp

            const request = new sql.Request()
                .input('isRetailer', isRetailer)
                .input('isVendor', isVendor)
                .query(query);

            const result = await request;

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Area_Retailers: JSON.parse(o?.Area_Retailers)
                }))

                const withImage = parsed.map(o => ({
                    ...o,
                    Area_Retailers: o?.Area_Retailers?.map(oo => ({
                        ...oo,
                        imageUrl: getImage('retailers', oo?.ImageName)
                    }))
                }))
                dataFound(res, withImage);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postLocationForCustomer = async (req, res) => {
        const { Latitude, Longitude, Retailer_Id, EntryBy } = req.body;

        if (!Latitude || !Longitude || !Retailer_Id || !EntryBy) {
            return invalidInput(res, 'Latitude, Longitude, Retailer_Id, EntryBy is required');
        }

        try {
            const query = `
            INSERT INTO 
                tbl_Retailers_Locations 
                (Retailer_Id, latitude, longitude, isActiveLocation, EntryBy, EntryAt)
            VALUES 
                (@id, @lati, @long, @active, @entry, @at)`;

            const request = new sql.Request();
            request.input('id', Retailer_Id);
            request.input('lati', Latitude);
            request.input('long', Longitude);
            request.input('active', 0);
            request.input('entry', EntryBy);
            request.input('at', new Date());

            const result = await request.query(query);

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Location Saved');
            } else {
                failed(res, 'Failed to Saved');
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const verifyLocation = async (req, res) => {
        const { Id } = req.body;

        if (!checkIsNumber(Id)) {
            return invalidInput(res, 'location Id is required')
        }

        try {
            const getRetailer = await new sql.Request()
                .input('Id', Id)
                .query(`
                    SELECT 
                        Retailer_Id 
                    FROM 
                        tbl_Retailers_Locations 
                    WHERE Id = @Id`);

            if (getRetailer.recordset[0]?.Retailer_Id) {
                await new sql.Request()
                    .input('Retailer_Id', getRetailer.recordset[0]?.Retailer_Id)
                    .query(`
                    UPDATE 
                        tbl_Retailers_Locations
                    SET 
                        isActiveLocation = 0
                    WHERE 
                        Retailer_Id = @Retailer_Id
                    `)
            }

            const result = await new sql.Request()
                .input('Id', Id)
                .query(`
                    UPDATE 
                        tbl_Retailers_Locations
                    SET 
                        isActiveLocation = 1
                    WHERE 
                        Id = @Id
                `)

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Location Verified');
            } else {
                failed(res, 'Failed Verify Location')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const addRetailers = async (req, res) => {
        try {

            await uploadFile(req, res, 1, 'Profile_Pic');
            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;
            const filetype = req?.file?.mimetype;
            const filesize = req?.file?.size;


            const {
                Retailer_Name, Contact_Person, Mobile_No, Retailer_Channel_Id, PinCode,
                Retailer_Class, Route_Id, Area_Id, Reatailer_Address, Reatailer_City,
                State_Id, Branch_Id, Gstno, Latitude, Longitude,
                Created_By, Company_Id, isRetailer = 1, isVendor = 0
            } = req.body;


            const getMaxId = await getNextId({ table: 'tbl_Retailers_Master', column: 'Retailer_Id' });


            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Id');
            }

            const MaxRetailerId = getMaxId.MaxId;

            const request = new sql.Request()
                .input('MaxRetailerId', sql.Int, MaxRetailerId)
                .input('Retailer_Id', MaxRetailerId)
                .input('code', 0)
                .input('rname', Retailer_Name)
                .input('cperson', Contact_Person)
                .input('mobile', Mobile_No)
                .input('channel', Retailer_Channel_Id)
                .input('rclass', Retailer_Class)
                .input('route', Route_Id)
                .input('area', Area_Id)
                .input('address', Reatailer_Address)
                .input('city', Reatailer_City)
                .input('pincode', PinCode)
                .input('state', State_Id)
                .input('salesforce', '')
                .input('branch', Branch_Id)
                .input('gst', Gstno)
                .input('erp', 0)
                .input('lati', Latitude ? Latitude : null)
                .input('long', Longitude ? Longitude : null)
                .input('profile', fileName ? domain + '/imageURL/retailers/' + fileName : null)
                .input('created', new Date())
                .input('createdby', Created_By)
                .input('update', new Date())
                .input('updateby', 0)
                .input('dflag', 0)
                .input('filename', fileName ? fileName : null)
                .input('filepath', filePath ? filePath : null)
                .input('filetype', filetype ? filetype : null)
                .input('filesize', filesize ? filesize : null)
                .input('other5', null)
                .input('company', Company_Id)
                .input('isRetailer', isRetailer)
                .input('isVendor', isVendor)
                .query(`
                    INSERT INTO tbl_Retailers_Master (
                        Retailer_Id, Retailer_Code, Retailer_Name, Contact_Person, Mobile_No, Retailer_Channel_Id, 
                        Retailer_Class, Route_Id, Area_Id, Reatailer_Address, Reatailer_City,
                        PinCode, State_Id, Sales_Force_Id, Branch_Id, Gstno,
                        ERP_Id, Latitude, Longitude, Profile_Pic, Created_Date,
                        Created_By, Updated_Date, Updated_By, Del_Flag, ImageName,
                        ImagePath, ImageType, ImageSize, Others_5, Company_Id,
                        isRetailer, isVendor 
                    ) VALUES (
                        @MaxRetailerId, @code, @rname, @cperson, @mobile, @channel, 
                        @rclass, @route, @area, @address, @city, 
                        @pincode, @state, @salesforce, @branch, @gst, 
                        @erp, @lati, @long, @profile, @created, 
                        @createdby, @update, @updateby, @dflag, @filename, 
                        @filepath, @filetype, @filesize, @other5, @company,
                        @isRetailer, @isVendor 
                    );
                    SELECT SCOPE_IDENTITY() AS Retailer_Id
                `);


            const result = await request;
            const Retailer_Id = MaxRetailerId

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0 && checkIsNumber(Retailer_Id)) {

                if (Latitude && Longitude) {
                    await new sql.Request()
                        .input('id', Retailer_Id)
                        .input('lati', Latitude)
                        .input('long', Longitude)
                        .input('active', 1)
                        .input('entry', Created_By)
                        .input('at', new Date())
                        .query(`
                        INSERT INTO tbl_Retailers_Locations (
                            Retailer_Id, latitude, longitude, isActiveLocation, EntryBy, EntryAt
                        ) VALUES (
                            @id, @lati, @long, @active, @entry, @at
                        );`
                        );
                }




                return success(res, 'New Customer Added');
            } else {

                return failed(res, 'Failed to create customer');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putRetailers = async (req, res) => {
        try {
            await uploadFile(req, res, 1, 'Profile_Pic');
            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;
            const filetype = req?.file?.mimetype;
            const filesize = req?.file?.size;

            // if (!fileName) {
            //     return invalidInput(res, 'Retailer Photo is required');
            // }

            const {
                Retailer_Id, Retailer_Name, Contact_Person, Mobile_No, Retailer_Channel_Id,
                Retailer_Class, Route_Id, Area_Id, Reatailer_Address, Reatailer_City, PinCode,
                State_Id, Gstno, Updated_By, isRetailer = 1, isVendor = 0
            } = req.body;

            const updateQuery = `
                UPDATE 
                    tbl_Retailers_Master
                SET
                    Retailer_Name = @rname,
                    Contact_Person = @cperson,
                    Mobile_No = @mobile,
                    Retailer_Channel_Id = @channel,
                    Retailer_Class = @rclass,

                    Route_Id = @route,
                    Area_Id = @area,
                    Reatailer_Address = @address,
                    Reatailer_City = @city,
                    PinCode = @pincode,

                    State_Id = @state,
                    Gstno = @gst,
                    Updated_By = @updatedby,
                    Updated_Date = @updated,

                    isRetailer = @isRetailer,
                    isVendor = @isVendor


                    ${fileName ? ', Profile_Pic = @profile, ImageName = @imagename, ImagePath = @imagepath, ImageType = @imagetype, ImageSize = @imagesize' : ''}
                    
                WHERE Retailer_Id = @id;
            `;

            const request = new sql.Request()
                .input('id', Retailer_Id)
                .input('rname', Retailer_Name)
                .input('cperson', Contact_Person)
                .input('mobile', Mobile_No)
                .input('channel', Retailer_Channel_Id)

                .input('rclass', Retailer_Class)
                .input('route', Route_Id)
                .input('area', Area_Id)
                .input('address', Reatailer_Address)
                .input('city', Reatailer_City)

                .input('pincode', PinCode)
                .input('state', State_Id)
                .input('gst', Gstno)
                .input('updatedby', Updated_By)
                .input('updated', new Date())

                .input('profile', fileName ? domain + '/imageURL/retailers/' + fileName : null)
                .input('imagename', fileName ? fileName : null)
                .input('imagepath', filePath ? filePath : null)
                .input('imagetype', filetype ? filetype : null)
                .input('imagesize', filesize ? filesize : null)
                .input('isRetailer', isRetailer)
                .input('isVendor', isVendor)
                .query(updateQuery)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {

                return success(res, 'Retailer information updated successfully');
            } else {
                return failed(res, 'Failed to update retailer information');
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailerInfo = async (req, res) => {
        const { Retailer_Id } = req.query;

        if (!checkIsNumber(Retailer_Id)) {
            return invalidInput(res, 'Retailer_Id is required')
        }

        try {
            const query = `
            SELECT 
                rm.*,
                COALESCE(rom.Route_Name, '') AS RouteGet,
                COALESCE(am.Area_Name, '') AS AreaGet,
                COALESCE(sm.State_Name, '') AS StateGet,
                COALESCE(cm.Company_Name, '') AS Company_Name,
                COALESCE(modify.Name, '') AS lastModifiedBy,
                COALESCE(created.Name, '') AS createdBy,
                COALESCE((
                    SELECT TOP (1) *
                    FROM tbl_Retailers_Locations
                    WHERE Retailer_Id = rm.Retailer_Id AND isActiveLocation = 1 
                    FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                ), '{}') AS VERIFIED_LOCATION,
                COALESCE(lol.Party_Name, '') AS Party_Name,
                COALESCE(lol.Party_Location, '') AS Party_Location,
                COALESCE(lol.Party_Mailing_Name, '') AS retailerTamilName,
                COALESCE(lol.Party_Mailing_Address, '') AS Party_Mailing_Address,
                COALESCE(lol.GST_No, '') AS GST_No,
                COALESCE(lol.Route_Name, '') AS Route_Name
            FROM tbl_Retailers_Master AS rm
            LEFT JOIN tbl_Route_Master AS rom ON rom.Route_Id = rm.Route_Id
            LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
            LEFT JOIN tbl_State_Master AS sm ON sm.State_Id = rm.State_Id
            LEFT JOIN tbl_Company_Master AS cm ON cm.Company_id = rm.Company_Id
            LEFT JOIN tbl_Users AS modify ON modify.UserId = rm.Updated_By
            LEFT JOIN tbl_Users AS created ON created.UserId = rm.Created_By
            LEFT JOIN  tbl_Ledger_LOL AS lol  ON lol.Ret_Id = rm.Retailer_Id
            WHERE rm.Retailer_Id = @retail;`;

            const request = new sql.Request();
            request.input('retail', Retailer_Id);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const withImage = result.recordset.map(o => ({
                    ...o,
                    VERIFIED_LOCATION: JSON.parse(o.VERIFIED_LOCATION),
                    imageUrl: getImage('retailers', o?.ImageName)
                }));

                dataFound(res, withImage);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailerInfoWithClosingStock = async (req, res) => {
        const { Retailer_Id, Fromdate, Todate } = req.query;

        if (!checkIsNumber(Retailer_Id)) {
            return invalidInput(res, 'Retailer_Id is required')
        }

        try {
            const query = `
            SELECT 
                rm.*,
                COALESCE(rom.Route_Name, '') AS RouteGet,
                COALESCE(am.Area_Name, '') AS AreaGet,
                COALESCE(sm.State_Name, '') AS StateGet,
                COALESCE(cm.Company_Name, '') AS Company_Name,
                COALESCE(modify.Name, '') AS lastModifiedBy,
                COALESCE(created.Name, '') AS createdBy,
                COALESCE((
                        SELECT 
                            TOP (1) *
                        FROM 
                            tbl_Retailers_Locations
                        WHERE
                            Retailer_Id = rm.Retailer_Id
                            AND
                            isActiveLocation = 1
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                ), '{}') AS VERIFIED_LOCATION,
            	COALESCE((
            		SELECT 
            			csgi.*,
            			COALESCE((
                            SELECT
                                csi.*,
                                COALESCE((SELECT Product_Name FROM tbl_Product_Master WHERE Product_Id = csi.Item_Id), 'unknown') AS ProductName
                            FROM
                                tbl_Closing_Stock_Info AS csi
                            WHERE
                                csi.St_Id = csgi.ST_Id
                            FOR JSON PATH
                         ), '[]') AS ProductCount,
            			COALESCE((
            				SELECT Name FROM tbl_Users WHERE UserId = csgi.Created_by
            			), 'unknown') AS CreatedByGet
            		FROM
            			tbl_Closing_Stock_Gen_Info AS csgi
            		WHERE 
            			csgi.Retailer_Id = rm.Retailer_Id
                        AND
                        CONVERT(DATE, csgi.ST_Date) >= CONVERT(DATE, @from)
                        AND
                        CONVERT(DATE, csgi.ST_Date) <= CONVERT(DATE, @to)
                    ORDER BY
                        CONVERT(DATETIME, csgi.Created_on_date) DESC
            		FOR JSON PATH
            	), '[]') AS ClosingStocks
            FROM
                tbl_Retailers_Master AS rm
            LEFT JOIN
                tbl_Route_Master AS rom
                ON rom.Route_Id = rm.Route_Id
            LEFT JOIN
                tbl_Area_Master AS am
                ON am.Area_Id = rm.Area_Id
            LEFT JOIN
                tbl_State_Master AS sm
                ON sm.State_Id = rm.State_Id
            LEFT JOIN
                tbl_Company_Master AS cm
                ON cm.Company_id = rm.Company_Id
            LEFT JOIN
                tbl_Users AS modify
                ON modify.UserId = rm.Updated_By
            LEFT JOIN
                tbl_Users AS created
                ON created.UserId = rm.Created_By
            WHERE
            	rm.Retailer_Id = @retail
            `;

            const request = new sql.Request();
            request.input('retail', Retailer_Id);
            request.input('from', Fromdate || new Date());
            request.input('to', Todate || new Date());

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const withImage = result.recordset.map(o => ({
                    ...o,
                    VERIFIED_LOCATION: JSON.parse(o.VERIFIED_LOCATION),
                    imageUrl: getImage('retailers', o?.ImageName)
                }));

                const parsed = withImage.map(o => ({
                    ...o,
                    ClosingStocks: JSON.parse(o?.ClosingStocks)
                }))

                const parsed2 = parsed.map(o => ({
                    ...o,
                    ClosingStocks: o?.ClosingStocks?.map(oo => ({
                        ...oo,
                        ProductCount: JSON.parse(oo?.ProductCount)
                    }))
                }))
                dataFound(res, parsed2);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const convertVisitLogToRetailer = async (req, res) => {

        try {
            const {
                Retailer_Name, Contact_Person, Mobile_No, Retailer_Channel_Id, PinCode,
                Retailer_Class, Route_Id, Area_Id, Reatailer_Address, Reatailer_City,
                State_Id, Branch_Id, Gstno, Latitude, Longitude,
                Created_By, Company_Id, fileName, fileType, fileSize, visitLogID
            } = req.body;

            const sourcearea = path.join(__dirname, '..', '..', 'uploads', 'visitLogs');
            const destination = path.join(__dirname, '..', '..', 'uploads', 'retailers');

            const copyedFileName = fileName ? (await copyImageMiddleware(sourcearea, destination, fileName)) : null;

            const request = new sql.Request()
                .input('code', 0)
                .input('rname', Retailer_Name)
                .input('cperson', Contact_Person)
                .input('mobile', Mobile_No)
                .input('channel', Retailer_Channel_Id)

                .input('rclass', Retailer_Class)
                .input('route', Route_Id)
                .input('area', Area_Id)
                .input('address', Reatailer_Address)
                .input('city', Reatailer_City)

                .input('pincode', PinCode)
                .input('state', State_Id)
                .input('salesforce', '')
                .input('branch', Branch_Id)
                .input('gst', Gstno)

                .input('erp', 0)
                .input('lati', Latitude ? Latitude : null)
                .input('long', Longitude ? Longitude : null)
                .input('profile', fileName ? domain + '/imageURL/retailers/' + fileName : null)
                .input('created', new Date())

                .input('createdby', Created_By)
                .input('update', new Date())
                .input('updateby', 0)
                .input('dflag', 0)
                .input('filename', fileName ? fileName : null)

                .input('filepath', copyedFileName ? copyedFileName : null)
                .input('filetype', fileType ? fileType : null)
                .input('filesize', fileSize ? fileSize : null)
                .input('company', Company_Id)
                .query(`
                    INSERT INTO tbl_Retailers_Master (
                        Retailer_Code, Retailer_Name, Contact_Person, Mobile_No, Retailer_Channel_Id, 
                        Retailer_Class, Route_Id, Area_Id, Reatailer_Address, Reatailer_City,
                        PinCode, State_Id, Sales_Force_Id, Branch_Id, Gstno,
                        ERP_Id, Latitude, Longitude, Profile_Pic, Created_Date,
                        Created_By, Updated_Date, Updated_By, Del_Flag, ImageName,
                        ImagePath, ImageType, ImageSize, Company_Id, isRetailer 
                    ) VALUES (
                        @code, @rname, @cperson, @mobile, @channel, 
                        @rclass, @route, @area, @address, @city, 
                        @pincode, @state, @salesforce, @branch, @gst, 
                        @erp, @lati, @long, @profile, @created, 
                        @createdby, @update, @updateby, @dflag, @filename, 
                        @filepath, @filetype, @filesize, @company, 1
                    );

                    SELECT SCOPE_IDENTITY() AS Retailer_Id
                `)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {

                await new sql.Request()
                    .input('Retailer_Id', result.recordset[0]?.Retailer_Id)
                    .input('visitLogID', visitLogID)
                    .query(`
                    UPDATE 
                        tbl_Daily_Call_Log 
                    SET 
                        IsExistingRetailer = 1, 
                        Retailer_Id = @Retailer_Id 
                    WHERE 
                        Id = @visitLogID`
                    )

                return success(res, 'New Customer Added');
            } else {
                return failed(res, 'Failed to create customer')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const syncTallyLOL = async (req, res) => {
        try {
            await SPCall({ SPName: 'Ledger_Sync' });
            success(res, 'Sync success')
        } catch (e) {
            servError(e, res);
        }
    }

    const posRetailesSync = async (req, res) => {
        try {
            const response = await fetch("https://smtraders.posbill.in/api/interledgerapi.php");
            const data = await response.json();

            if (data) {
                success(res, data.data)
            }
            else {
                failed(res, "Failed to sync POS products")
            }

        } catch (error) {
            console.error("Error fetching POS product data:", error);
            servError(res, "Internal server error")
        }
    }

    const retailerSoldProduct = async (req, res) => {
        try {
            const { Retailer_Id } = req.query;

            if (!checkIsNumber(Retailer_Id)) return invalidInput(res, 'Retailer_Id is required');

            const request = new sql.Request()
                .input('Retailer_Id', Retailer_Id)
                .query(`
                    WITH soldProducts AS (
                    	SELECT 
                    		DISTINCT sdsi.Item_Id AS Product_Id,
                            p.Product_Name,
                            p.Short_Name,
                            b.Brand_Id,
                    		b.Brand_Name,
                            COALESCE(p.Product_Rate, 0) AS Product_Rate
                    	FROM 
                    		tbl_Sales_Delivery_Stock_Info AS sdsi
                    	JOIN 
                    		tbl_Sales_Delivery_Gen_Info as sdgi
                    		ON sdgi.Do_Id = sdsi.Delivery_Order_Id
                    	JOIN 
                    		tbl_Product_Master AS p
                    		ON p.Product_Id = sdsi.Item_Id
                    	JOIN 
                    		tbl_Brand_Master AS b
                    		ON b.Brand_Id = p.Brand
                    	WHERE sdgi.Retailer_Id = @Retailer_Id
                    ), closingStock AS (
                    	SELECT *
                    	FROM Previous_Stock_Fn_1(CONVERT(DATE, GETDATE()), @Retailer_Id)
                    )
                    SELECT 
                    	DISTINCT pb.Brand_Id,
                    	pb.Brand_Name,
                    	COALESCE((
                    		SELECT 
			                    sp.Product_Id,
			                    sp.Product_Name,
			                    sp.Product_Rate,
                                sp.Short_Name,
                    			COALESCE((
                    				SELECT TOP (1) CONVERT(VARCHAR(10), Cl_Date, 120)
                    				FROM closingStock
                    				WHERE 
                    					Item_Id = sp.Product_Id
                    					AND CL_Type = 'Closing QTY'
                    				ORDER BY Cl_Date DESC
                    			), '') AS lastclosingDate,
                    			COALESCE((
                    				SELECT TOP (1) Previous_Balance
                    				FROM closingStock
                    				WHERE 
                    					Item_Id = sp.Product_Id
                    					AND CL_Type = 'Closing QTY'
                    				ORDER BY Cl_Date DESC
                    			), 0) AS lastClosingQuanity,
                    			COALESCE((
                    				SELECT TOP (1) CONVERT(VARCHAR(10), Cl_Date, 120)
                    				FROM closingStock
                    				WHERE 
                    					Item_Id = sp.Product_Id
                    					AND CL_Type = 'Delivery QTY'
                    				ORDER BY Cl_Date DESC
                    			), '') AS lastDeliveryDate,
                    			COALESCE((
                    				SELECT TOP (1) Previous_Balance
                    				FROM closingStock
                    				WHERE 
                    					Item_Id = sp.Product_Id
                    					AND CL_Type = 'Delivery QTY'
                    				ORDER BY Cl_Date DESC
                    			), 0) AS lastDeliveryQuantity,
                    			COALESCE((
                    				SELECT SUM(Previous_Balance)
                    				FROM closingStock
                    				WHERE 
                    					Item_Id = sp.Product_Id
                    			), 0) AS totalQty
                    		FROM soldProducts AS sp
                    		WHERE sp.Brand_Id = pb.Brand_Id
                    		FOR JSON PATH
                    	), '[]') AS GroupedProductArray
                    FROM soldProducts AS pb`
                );

            const result = await request;

            const getEstimatedQty = (item) => {
                const closing = new Date(item.lastclosingDate)
                const delivery = new Date(item.lastDeliveryDate)

                if (!item.lastclosingDate || !item.lastDeliveryDate) return {
                    qty: item.totalQty,
                    date: (item?.lastclosingDate && (closing > delivery)) ? item?.lastclosingDate : item.lastDeliveryDate
                }

                return closing > delivery ? {
                    qty: toNumber(item.lastClosingQuanity),
                    date: closing
                } : {
                    qty: item.totalQty,
                    date: delivery
                }
            }

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(pg => ({
                    ...pg,
                    GroupedProductArray: toArray(
                        JSON.parse(pg.GroupedProductArray)
                    ).map(item => {
                        const closing = getEstimatedQty(item)
                        return {
                            ...item,
                            estimatedQuantity: closing.qty,
                            lastVisitDate: String(ISOString(closing.date)),
                            entryDate: item?.lastDeliveryDate ? LocalDate(item?.lastDeliveryDate) : '',
                            updateDate: item?.lastclosingDate ? LocalDate(item?.lastclosingDate) : '',
                            entryDays: item?.lastDeliveryDate ? getDaysBetween(item?.lastDeliveryDate, ISOString()) : '',
                            updateDays: item?.lastclosingDate ? getDaysBetween(item?.lastclosingDate, ISOString()) : ''
                        }
                    }).map(item => ({
                        ...item,
                        totalValue: Multiplication(item.estimatedQuantity, item.Product_Rate)
                    }))
                }));

                const brandGroupSum = parsed.map(pb => {
                    const groupArray = toArray(pb.GroupedProductArray).map(item => {
                        const closing = getEstimatedQty(item);
                        const estimatedQuantity = closing.qty;
                        const lastVisitDate = String(ISOString(closing.date));
                        const totalValue = Multiplication(estimatedQuantity, item.Product_Rate);

                        return {
                            ...item,
                            estimatedQuantity,
                            lastVisitDate,
                            totalValue
                        };
                    }).sort((a, b) => b.totalValue - a.totalValue);

                    const totalQty = groupArray.reduce((acc, item) => Addition(acc, item.estimatedQuantity), 0);
                    const totalValue = groupArray.reduce((acc, item) => Addition(acc, item.totalValue), 0);

                    const deliveryDates = groupArray
                        .map(item => item?.lastDeliveryDate)
                        .filter(d => isValidDate(d));
                    const closingDates = groupArray
                        .map(item => item?.lastclosingDate)
                        .filter(d => isValidDate(d));

                    const entryDate = deliveryDates.length
                        ? new Date(Math.max(...deliveryDates.map(d => new Date(d))))
                        : '';
                    const updateDate = closingDates.length
                        ? new Date(Math.max(...closingDates.map(d => new Date(d))))
                        : '';

                    return {
                        Brand_Id: pb.Brand_Id,
                        Brand_Name: pb.Brand_Name,
                        entryDate: entryDate ? ISOString(entryDate) : '',
                        updateDate: updateDate ? ISOString(updateDate) : '',
                        entryDays: entryDate ? getDaysBetween(ISOString(entryDate), ISOString()) : '',
                        updateDays: updateDate ? getDaysBetween(ISOString(updateDate), ISOString()) : '',
                        totalQty,
                        totalValue,
                        GroupedProductArray: groupArray
                    };
                });

                dataFound(
                    res,
                    brandGroupSum,
                    'Data found',
                    {
                        productBased: brandGroupSum.flatMap(cs =>
                            cs.GroupedProductArray.map(product => ({
                                ...product,
                                Brand_Id: cs.Brand_Id,
                                Brand_Name: cs.Brand_Name,
                            }))
                        ).sort((a, b) => b.totalValue - a.totalValue)

                    }
                )
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailersWhoHasClosingStock = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                    	DISTINCT rl.Retailer_Id,
                    	r.Retailer_Name
                    FROM (
                    	SELECT sd.Retailer_Id
                    	FROM tbl_Sales_Delivery_Gen_Info AS sd
                    	UNION ALL
                    	SELECT cs.Retailer_Id
                    	FROM tbl_Closing_Stock_Gen_Info AS cs
                    ) AS rl
                    JOIN 
                    	tbl_Retailers_Master AS r
                    	ON r.Retailer_Id = rl.Retailer_Id
                    ORDER BY r.Retailer_Name`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

const getSFCustomersPaginated = async (req, res) => {
  try {
    const {
      Retailer_Id,
      PhoneNumber,
      ContactPerson_Name,
      Route_Id,
      Area_Id,
      City,
    //   search = '',
    //   page = 1,
    //   limit = 100,
      filter1,
      filter2,
      filter3
    } = req.query;

    // const pageNo = Math.max(parseInt(page), 1);
    // const pageSize = Math.min(parseInt(limit), 50);
    // const offset = (pageNo - 1) * pageSize;

    const request = new sql.Request();
    // request.input('offset', sql.Int, offset);
    // request.input('limit', sql.Int, pageSize);
    // request.input('search', sql.NVarChar, `%${search}%`);

  
    let whereClause = ` WHERE rm.isRetailer = 1 `;

    if (Retailer_Id) {
      whereClause += ` AND rm.Retailer_Id = @Retailer_Id`;
      request.input('Retailer_Id', sql.Int, Retailer_Id);
    }

    if (PhoneNumber) {
      whereClause += ` AND rm.Mobile_No LIKE '%' + @PhoneNumber + '%'`;
      request.input('PhoneNumber', sql.NVarChar, PhoneNumber);
    }

    if (ContactPerson_Name) {
      whereClause += ` AND rm.Contact_Person LIKE '%' + @ContactPerson_Name + '%'`;
      request.input('ContactPerson_Name', sql.NVarChar, ContactPerson_Name);
    }

    if (Route_Id && Route_Id !== 'ALL') {
      whereClause += ` AND rm.Route_Id = @Route_Id`;
      request.input('Route_Id', sql.Int, Route_Id);
    }

    if (Area_Id && Area_Id !== 'ALL') {
      whereClause += ` AND rm.Area_Id = @Area_Id`;
      request.input('Area_Id', sql.Int, Area_Id);
    }

    if (City && City !== 'ALL') {
      whereClause += ` AND rm.Reatailer_City LIKE '%' + @City + '%'`;
      request.input('City', sql.NVarChar, City);
    }

    // if (search) {
    //   whereClause += `
    //     AND (
    //       rm.Retailer_Name LIKE @search
    //       OR rm.Mobile_No LIKE @search
    //       OR rm.Contact_Person LIKE @search
    //     )
    //   `;
    // }


    const parseValues = v =>
      v ? v.split(',').map(x => x.trim()).filter(Boolean) : null;

    const filterValues = [
      parseValues(filter1),
      parseValues(filter2),
      parseValues(filter3)
    ];

    const mobileFilters = await new sql.Request().query(`
      SELECT 
        mrd.Column_Name AS ColumnName,
        tm.Table_Name AS TableName,
        mrd.FilterLevel
      FROM tbl_Mobile_Report_Details mrd
      INNER JOIN tbl_Mobile_Report_Type mrt 
        ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
      LEFT JOIN tbl_Mobile_Rpt_Table_Master tm 
        ON tm.Table_Id = mrd.Table_Id
      WHERE mrt.Report_Name = 'Transaction'
      ORDER BY mrd.FilterLevel
    `);

    const dynamicConditions = [];

    const buildFilterCondition = (cfg, values, paramName) => {
      if (!cfg || !values || !values.length) return null;

      const isSingle = values.length === 1;
      const placeholders = isSingle
        ? `@${paramName}`
        : values.map((_, i) => `@${paramName}${i}`).join(',');

      const column = cfg.ColumnName;

      // ✅ tbl_Ledger_LOL (MAIN FIX)
      if (cfg.TableName === 'tbl_Ledger_LOL') {
        return `
          EXISTS (
            SELECT 1
            FROM tbl_Ledger_LOL llol
            WHERE llol.${column} ${isSingle ? '=' : 'IN'} (${placeholders})
              AND llol.Ret_Id = rm.Retailer_Id
          )
        `;
      }

      // ✅ Generic direct-table filter
      return `
        EXISTS (
          SELECT 1
          FROM ${cfg.TableName} t
          WHERE t.${column} ${isSingle ? '=' : 'IN'} (${placeholders})
            AND t.Ret_Id = rm.Retailer_Id
        )
      `;
    };

    filterValues.forEach((values, index) => {
      if (values && mobileFilters.recordset[index]) {
        const param = `filter${index + 1}`;
        const condition = buildFilterCondition(
          mobileFilters.recordset[index],
          values,
          param
        );

        if (condition) {
          dynamicConditions.push(condition);

          if (values.length === 1) {
            request.input(param, values[0]);
          } else {
            values.forEach((v, i) => {
              request.input(`${param}${i}`, v);
            });
          }
        }
      }
    });

    if (dynamicConditions.length) {
      whereClause += ` AND ${dynamicConditions.join(' AND ')}`;
    }

    /* ---------------- Count Query ---------------- */
    const countQuery = `
      SELECT COUNT(*) AS totalRecords
      FROM tbl_Retailers_Master rm
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    // const totalRecords = countResult.recordset[0].totalRecords;
    // const totalPages = Math.ceil(totalRecords / pageSize);

    /* ---------------- Data Query ---------------- */
    const dataQuery = `
      SELECT 
        rm.*,
        COALESCE(rom.Route_Name, '') AS RouteGet,
        COALESCE(am.Area_Name, '') AS AreaGet,
        COALESCE(sm.State_Name, '') AS StateGet,
        COALESCE(cm.Company_Name, '') AS Company_Name,
        COALESCE(modify.Name, '') AS lastModifiedBy,
        COALESCE(created.Name, '') AS createdBy,
        COALESCE((
          SELECT TOP 1 *
          FROM tbl_Retailers_Locations
          WHERE Retailer_Id = rm.Retailer_Id AND isActiveLocation = 1
          FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ), '{}') AS VERIFIED_LOCATION,
        COALESCE((
          SELECT TOP 5 ml.*,
            COALESCE((SELECT Name FROM tbl_Users WHERE UserId = ml.EntryBy),'unknown') AS EntryByGet
          FROM tbl_Retailers_Locations ml
          WHERE rm.Retailer_Id = ml.Retailer_Id
          ORDER BY CONVERT(DATETIME, EntryAt) DESC
          FOR JSON PATH
        ), '[]') AS AllLocations
      FROM tbl_Retailers_Master rm
      LEFT JOIN tbl_Route_Master rom ON rom.Route_Id = rm.Route_Id
      LEFT JOIN tbl_Area_Master am ON am.Area_Id = rm.Area_Id
      LEFT JOIN tbl_State_Master sm ON sm.State_Id = rm.State_Id
      LEFT JOIN tbl_Company_Master cm ON cm.Company_id = rm.Company_Id
      LEFT JOIN tbl_Users modify ON modify.UserId = rm.Updated_By
      LEFT JOIN tbl_Users created ON created.UserId = rm.Created_By
      ${whereClause}
      ORDER BY rm.Retailer_Id DESC
      --OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await request.query(dataQuery);

    const parsed = result.recordset.map(r => ({
      ...r,
      VERIFIED_LOCATION: JSON.parse(r.VERIFIED_LOCATION || '{}'),
      AllLocations: JSON.parse(r.AllLocations || '[]'),
      imageUrl: getImage('retailers', r?.ImageName)
    }));

    return res.json({
      success: true,
    //   page: pageNo,
    //   limit: pageSize,
    //   totalRecords,
    //   totalPages,
      data: parsed
    });

  } catch (err) {
    console.error('Customer API Error:', err);
    return servError(err, res);
  }
};




    return {
        getSFCustomers,
        getRetailerDropDown,
        getAreaRetailers,
        postLocationForCustomer,
        verifyLocation,
        addRetailers,
        putRetailers,
        getRetailerInfo,
        getRetailerInfoWithClosingStock,
        convertVisitLogToRetailer,
        syncTallyLOL,
        posRetailesSync,
        retailerSoldProduct,
        getRetailersWhoHasClosingStock,
        getSFCustomersPaginated
    }
}


export default RetailerControll()