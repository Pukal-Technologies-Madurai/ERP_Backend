import { dataFound, invalidInput, noData, sentData, servError, success } from "../../res.mjs";
import { Addition, checkIsNumber, createPadString, filterableText, ISOString } from '../../helper_functions.mjs';
import sql from 'mssql';
import { getNextId } from '../../middleware/miniAPIs.mjs';


const collectionGeneralInfo = [
    'collection_id',
    'collection_inv_no',
    'voucher_id',
    'collection_no',
    'year_id',
    'retailer_id',
    'payed_by',
    'collection_date',
    'collection_type',
    'collected_amount',
    'latitude',
    'longitude',
    'created_on',
    'alterd_on',
    'collected_by',
    'created_by',
    'updated_by'
];

const collectionDetailsInfo = [
    'auto_id',
    'collection_id',
    'bill_id',
    'bill_amount',
    'collected_amount',
    'verify_status',
    'payment_status',
    'bank_date',
    'narration',
    'verified_by',
    'verified_at'
];

const paymentMethods = ['CASH', 'UPI', 'CHECK', 'BANK TRANSFER'];

const Payments = () => {

    const getPayments = async (req, res) => {
        try {
            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH GENERALDETAILS AS (
                    	SELECT
                    		gi.*,
                    		COALESCE(cre.Name, 'not found') AS CreatedByGet,
                    		COALESCE(upd.Name, 'not found') AS UpdatedByGet
                    	FROM tbl_Sales_Receipt_General_Info AS gi
                    	LEFT JOIN tbl_Users AS cre
                    		ON cre.UserId = gi.created_by
                    	LEFT JOIN tbl_Users AS upd
                    		ON upd.UserId = gi.updated_by
                    	WHERE gi.collection_date BETWEEN @Fromdate AND @Todate
                    ), DETAILSINFO AS (
                    	SELECT di.*
                    	FROM tbl_Sales_Receipt_Details_Info AS di
                    	WHERE di.collection_id IN (SELECT collection_id FROM GENERALDETAILS)
                    ), DeliveryDI AS (
                        SELECT
                            oi.*,
                            pm.Product_Id,
                            COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                            COALESCE(u.Units, 'not available') AS UOM,
                            COALESCE(b.Brand_Name, 'not available') AS BrandGet,
                            COALESCE(rm.Retailer_Name, 'not available') AS RetailerGet
                        FROM tbl_Sales_Delivery_Stock_Info AS oi
                        LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                        LEFT JOIN tbl_UOM AS u
                            ON u.Unit_Id = oi.Unit_Id
                        LEFT JOIN tbl_Brand_Master AS b
                            ON b.Brand_Id = pm.Brand
                    	LEFT JOIN tbl_Sales_Delivery_Gen_Info AS so
                    		ON so.Do_Id = oi.Delivery_Order_Id
                        LEFT JOIN tbl_Retailers_Master AS rm
                            ON rm.Retailer_Id = so.Retailer_Id
                        WHERE
                            oi.Delivery_Order_Id IN (SELECT bill_id FROM DETAILSINFO)
                    )
                    SELECT 
                    	gi.*,
                    	COALESCE((
                    		SELECT di.*,
                    			COALESCE((
                    				SELECT dbi.*
                    				FROM DeliveryDI AS dbi
                    				WHERE dbi.Delivery_Order_Id = di.bill_id
                    				FOR JSON PATH
                    			), '[]') AS DeliveryBillDetails
                    		FROM DETAILSINFO di
                    		WHERE di.collection_id = gi.collection_id
                    		FOR JSON PATH
                    	), '[]') AS PAYMENTS
                    FROM GENERALDETAILS AS gi
                    ORDER BY gi.collection_date DESC`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(gi => ({
                    ...gi,
                    PAYMENTS: JSON.parse(gi.PAYMENTS)
                }));

                const parseDeliveryItems = parseData.map(gi => ({
                    ...gi,
                    Products_List: gi.Products_List.map(di => ({
                        ...di,
                        DeliveryBillDetails: JSON.parse(di.DeliveryBillDetails)
                    }))
                }));

                dataFound(res, parseDeliveryItems);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const PaymentEntry = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const {
                retailer_id,
                payed_by = null,
                collection_type = 'CASH',
                voucher_id,
                latitude = null,
                longitude = null,
                collected_by,
                created_by,
                Collections = [],
                verify_status = 0,
                payment_status,
                narration = null,
                verified_by = null
            } = req.body;

            const collection_date = req.body?.collection_date ? ISOString(req.body.collection_date) : ISOString();
            const bank_date = req.body?.bank_date ? ISOString(req.body.bank_date) : null;

            const validation = {
                isArray: !Array.isArray(Collections),
                bill_id: Collections?.some(col => !checkIsNumber(col.bill_id)),
                retailer_id: !checkIsNumber(retailer_id),
                created_by: !checkIsNumber(created_by),
                collected_by: !checkIsNumber(collected_by),
                voucher_id: !checkIsNumber(voucher_id),
                collection_type: !paymentMethods.some(method => filterableText(method) === filterableText(collection_type)),
                bill_amount: Collections?.some(col => !checkIsNumber(col.bill_amount)),
                collected_amount: Collections?.some(col => !checkIsNumber(col.collected_amount)),
            };
            const isError = Object.entries(validation).some(([key, value]) => value === true)

            if (isError) {
                console.log('Validation failed:', validation); // Helpful for debugging
                return invalidInput(res, 'Invalid or missing data provided.', validation);
            }

            // unique id

            const getCollectionId = await getNextId({ table: 'tbl_Sales_Receipt_General_Info', column: 'collection_id' });
            if (!getCollectionId.status || !checkIsNumber(getCollectionId.MaxId)) throw new Error('Failed to get collection_id');
            const collection_id = getCollectionId.MaxId;

            // year and desc

            const getYearId = await new sql.Request()
                .input('collection_date', collection_date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @collection_date 
                        AND Fin_End_Date >= @collection_date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];

            // process on based on year and voucher

            const collection_no = Number((await new sql.Request()
                .input('year_id', Year_Id)
                .input('voucher_id', voucher_id)
                .query(`
                    SELECT COALESCE(MAX(collection_no), 0) AS MaxId
                    FROM tbl_Sales_Receipt_General_Info
                    WHERE year_id = @year_id
                    AND voucher_id = @voucher_id`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(collection_no)) throw new Error('Failed to get P_No');

            // voucher code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', voucher_id)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            const collection_inv_no = Voucher_Code + '/' + createPadString(collection_no, 6) + '/' + Year_Desc;

            const total_amount = Collections.reduce((total, col) => Addition(total, col.collected_amount), 0);

            await transaction.begin();

            const insertGI = new sql.Request(transaction)
                .input(`collection_id`, collection_id)
                .input(`collection_inv_no`, collection_inv_no)
                .input(`voucher_id`, voucher_id)
                .input(`collection_no`, collection_no)
                .input(`year_id`, Year_Id)
                .input(`retailer_id`, retailer_id)
                .input(`payed_by`, payed_by)
                .input(`collection_date`, collection_date)
                .input(`bank_date`, bank_date)
                .input(`collection_type`, collection_type)
                .input(`total_amount`, total_amount)
                .input(`collected_by`, collected_by)
                .input(`latitude`, latitude)
                .input(`longitude`, longitude)
                .input(`created_by`, created_by)
                .input(`verify_status`, verify_status)
                .input(`payment_status`, payment_status)
                .input(`narration`, narration)
                .input(`verified_by`, verified_by)
                .query(`
                    INSERT INTO tbl_Sales_Receipt_General_Info (
                        collection_id, collection_inv_no, voucher_id, collection_no, year_id, 
                        retailer_id, payed_by, collection_date, bank_date, collection_type, total_amount, 
                        collected_by, latitude, longitude, created_by, 
                        verify_status, payment_status, narration, verified_by
                    ) VALUES (
                        @collection_id, @collection_inv_no, @voucher_id, @collection_no, @year_id, 
                        @retailer_id, @payed_by, @collection_date, @bank_date, @collection_type, @total_amount, 
                        @collected_by, @latitude, @longitude, @created_by,
                        @verify_status, @payment_status, @narration, @verified_by
                    )
                `);

            const GIresult = await insertGI;

            if (GIresult.rowsAffected[0] === 0) throw new Error('Failed to insert Collection -gi');

            for (let i = 0; i < Collections.length; i++) {
                const collection = Collections[i];
                const {
                    bill_id, bill_amount, collected_amount,
                    bank_date = null, narration, verified_by = null, payment_status
                } = collection;

                const insertCD = new sql.Request(transaction)
                    .input(`collection_id`, collection_id)
                    .input(`bill_id`, bill_id)
                    .input(`bill_amount`, bill_amount)
                    .input(`collected_amount`,  collected_amount)
                    .query(`
                        INSERT INTO tbl_Sales_Receipt_Details_Info (
                            collection_id, bill_id, bill_amount, collected_amount
                        ) VALUES (
                            @collection_id, @bill_id, @bill_amount, @collected_amount
                        ); `
                    );

                const result = await insertCD;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert Collection -details');
            }

            await transaction.commit();
            success(res, 'Payment Saved');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const getRetailerBills = async (req, res) => {
        try {
            const { retailer_id } = req.query; console.log(retailer_id)

            if (!checkIsNumber(retailer_id)) {
                return invalidInput(res, 'Invalid Retailer ID');
            }

            const request = new sql.Request()
                .input('Retailer_Id', retailer_id)
                .query(`
                    WITH DeliveryGI AS (
                        SELECT 
                            so.*,
                            rm.Retailer_Name AS Retailer_Name,
                            erpUser.Name AS Delivery_Person_Name, 
                            bm.BranchName AS Branch_Name,
                            cb.Name AS Created_BY_Name,
                            rmt.Route_Name AS Routename,
                            am.Area_Name AS AreaName,
                            rmt.Route_Id AS Route_Id,
                            rm.Area_Id AS Area_Id,
                            st.Status AS DeliveryStatusName,
                            sgi.SO_Date AS SaleOrderDate
                        FROM
                            tbl_Sales_Delivery_Gen_Info AS so
                        LEFT JOIN tbl_Retailers_Master AS rm
                            ON rm.Retailer_Id = so.Retailer_Id
                        LEFT JOIN tbl_Status AS st
                            ON st.Status_Id = so.Delivery_Status
                        LEFT JOIN tbl_Users AS sp
                            ON sp.UserId = so.Delivery_Person_Id
                        LEFT JOIN tbl_Branch_Master bm
                            ON bm.BranchId = so.Branch_Id
                        LEFT JOIN tbl_Users AS cb
                            ON cb.UserId = so.Created_by
                        LEFT JOIN tbl_Route_Master AS rmt
                            ON rmt.Route_Id = rm.Route_Id
                        LEFT JOIN tbl_Area_Master AS am
                            ON am.Area_Id = rm.Area_Id
                        LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi
                            ON sgi.So_Id = so.So_No
                        LEFT JOIN tbl_ERP_Cost_Center AS ecc
                            ON ecc.Cost_Center_Id = so.Delivery_Person_Id 
                        LEFT JOIN tbl_Users AS erpUser
                            ON erpUser.UserId = ecc.User_Id
                        WHERE 
                            so.Retailer_Id = @Retailer_Id
                    ), DeliveryDI AS (
                        SELECT
                            oi.*,
                            pm.Product_Id,
                            COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                            COALESCE(u.Units, 'not available') AS UOM,
                            COALESCE(b.Brand_Name, 'not available') AS BrandGet
                        FROM
                            tbl_Sales_Delivery_Stock_Info AS oi
                        LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                        LEFT JOIN tbl_UOM AS u
                            ON u.Unit_Id = oi.Unit_Id
                        LEFT JOIN tbl_Brand_Master AS b
                            ON b.Brand_Id = pm.Brand
                        WHERE
                            oi.Delivery_Order_Id IN (SELECT Do_Id FROM DeliveryGI)
                    ), Payments AS (
                        SELECT 
                            di.*,
                            COALESCE(col.Name, 'not found') AS CollectedByGet,
                            COALESCE(cre.Name, 'not found') AS CreatedByGet,
                    		COALESCE(upd.Name, 'not found') AS UpdatedByGet,
                            gi.payed_by,
                            gi.collection_date,
                            gi.collection_type,
                            gi.latitude,
                            gi.longitude,
                            gi.verify_status,
                            gi.payment_status,
                            gi.narration,
                            gi.bank_date
                    	FROM tbl_Sales_Receipt_Details_Info AS di
                        LEFT JOIN tbl_Sales_Receipt_General_Info AS gi
                            ON di.collection_id = gi.collection_id
                        LEFT JOIN tbl_Users AS verify
                    		ON verify.UserId = gi.verified_by
                        LEFT JOIN tbl_Users AS col
                    		ON col.UserId = gi.collected_by
                        LEFT JOIN tbl_Users AS cre
                    		ON cre.UserId = gi.created_by
                    	LEFT JOIN tbl_Users AS upd
                    		ON upd.UserId = gi.updated_by
                    	WHERE di.bill_id IN (SELECT Do_Id FROM DeliveryGI)
                    )
                    SELECT 
                        gi.*,
                        COALESCE((
                            SELECT
                                sd.*
                            FROM
                                DeliveryDI AS sd
                            WHERE
                                sd.Delivery_Order_Id = gi.Do_Id
                            FOR JSON PATH
                        ), '[]') AS Products_List,
                        COALESCE((
                            SELECT 
                                pgi.*
                            FROM Payments AS pgi
                            WHERE pgi.bill_id = gi.Do_Id
                            ORDER BY pgi.collection_date
                            FOR JSON PATH
                        ), '[]') AS Payments
                    FROM DeliveryGI AS gi
                    ORDER BY gi.Do_Date ASC`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(obj => ({
                    ...obj,
                    Products_List: JSON.parse(obj.Products_List),
                    Payments: JSON.parse(obj.Payments)
                }));

                dataFound(res, parseData)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailersWhoHasBills = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        rm.Retailer_Id,
                        rm.Retailer_Name,
                        COUNT(DISTINCT so.Do_Id) AS Total_Bills
                    FROM 
                        tbl_Sales_Delivery_Gen_Info AS so
                    LEFT JOIN tbl_Retailers_Master AS rm
                        ON rm.Retailer_Id = so.Retailer_Id
                    GROUP BY 
                        rm.Retailer_Id, rm.Retailer_Name
					ORDER BY rm.Retailer_Name
                `);

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getRetailersWhoHasBills,
        getRetailerBills,
        getPayments,
        PaymentEntry,
    }
}

export default Payments();