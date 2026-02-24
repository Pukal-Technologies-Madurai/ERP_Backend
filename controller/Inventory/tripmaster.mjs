
import sql from 'mssql'
import { servError, dataFound, noData, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, ISOString, Subraction, createPadString, isValidDate, toNumber, filterableText } from '../../helper_functions.mjs'

const tripActivities = () => {

    const createTripDetails = async (req, res) => {

        const transaction = new sql.Transaction();

        try {
            const {
                Branch_Id,
                Vehicle_No = '',
                Trip_ST_KM = '',
                Trip_EN_KM = '',
                Created_By = '',
                PhoneNumber = '',
                LoadingLoad = 0,
                LoadingEmpty = 0,
                UnloadingLoad = 0,
                UnloadingEmpty = 0,
                Godownlocation = 0,
                BillType = '',
                VoucherType = '',
                Narration = '',
                TripStatus = 'New',
                Product_Array = [],
                EmployeesInvolved = [],
            } = req.body;

            const Trip_Date = req.body?.Trip_Date ? ISOString(req.body.Trip_Date) : ISOString();
            const StartTime = req.body?.StartTime ? new Date(req.body.StartTime) : new Date();
            const EndTime = req.body?.EndTime ? new Date(req.body.EndTime) : new Date();

            if (!checkIsNumber(Branch_Id) || !BillType || !checkIsNumber(VoucherType)) {
                return invalidInput(res, 'Select Branch, BillType, VoucherType is required');
            }

            if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
                return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
            }

            // ------------------ Unique Trip_Id

            const Trip_Id = Number((await new sql.Request().query(`
               SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
               FROM tbl_Trip_Master`
            ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');

            // ------------------ year details

            const getYearId = await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE Fin_Start_Date <= @Trip_Date AND Fin_End_Date >= @Trip_Date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];

            // ------------------ T_No

            const T_No = Number((await new sql.Request()
                .input('VoucherType', VoucherType)
                .input('Year_Id', Year_Id)
                .query(`
                    SELECT COALESCE(MAX(T_No), 0) AS MaxId
                    FROM tbl_Trip_Master
                    WHERE VoucherType = @VoucherType
                    AND Year_Id = @Year_Id;`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(T_No)) throw new Error('Failed to get T_No');

            // ------------------ Voucher Code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', VoucherType)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            // ------------------ TR_INV_ID creations

            const TR_INV_ID = Voucher_Code + "/" + createPadString(T_No, 6) + '/' + Year_Desc;

            // ------------------ Trip_No (day wise count)

            const Trip_No = Number((await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .input('Godownlocation', Godownlocation)
                .query(`
                    SELECT COALESCE(MAX(Trip_No), 0) AS MaxId
                    FROM tbl_Trip_Master    
                    WHERE 
                        Trip_Date = @Trip_Date
                        AND Godownlocation = @Godownlocation`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_No)) throw new Error('Failed to get Trip_No');

            const Challan_No = createPadString(Trip_Id, 4);
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);

            await transaction.begin();

            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', toNumber(Trip_Id))
                .input('TR_INV_ID', TR_INV_ID)
                .input('Branch_Id', toNumber(Branch_Id))
                .input('T_No', T_No)
                .input('VoucherType', toNumber(VoucherType))
                .input('Year_Id', Year_Id)
                .input('Trip_No', toNumber(Trip_No))
                .input('Challan_No', Challan_No)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('PhoneNumber', PhoneNumber)
                .input('LoadingLoad', Number(LoadingLoad || 0))
                .input('LoadingEmpty', Number(LoadingEmpty || 0))
                .input('UnloadingLoad', Number(UnloadingLoad || 0))
                .input('UnloadingEmpty', Number(UnloadingEmpty || 0))
                .input('Godownlocation', toNumber(Godownlocation))
                .input('BillType', BillType)
                .input('Narration', Narration)
                .input('TripStatus', 'New')
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Trip_EN_KM', Number(Trip_EN_KM))
                .input('Trip_Tot_Kms', toNumber(Trip_Tot_Kms))
                .input('Created_By', Created_By)
                .input('Created_At', new Date())
                .query(`
                    INSERT INTO tbl_Trip_Master (
                       Trip_Id, TR_INV_ID, Branch_Id, T_No, VoucherType, Year_Id, Challan_No, Trip_Date, Vehicle_No,
                       PhoneNumber, LoadingLoad, LoadingEmpty, UnloadingLoad, UnloadingEmpty, Narration, BillType,
                       StartTime, EndTime, Trip_No, Trip_ST_KM, Trip_Tot_Kms, Trip_EN_KM, Godownlocation, TripStatus,
                       Created_At, Created_By
                    ) VALUES (
                       @Trip_Id, @TR_INV_ID, @Branch_Id, @T_No, @VoucherType, @Year_Id, @Challan_No, @Trip_Date, @Vehicle_No,
                       @PhoneNumber, @LoadingLoad, @LoadingEmpty, @UnloadingLoad, @UnloadingEmpty, @Narration, @BillType,
                       @StartTime, @EndTime, @Trip_No, @Trip_ST_KM, @Trip_Tot_Kms, @Trip_EN_KM, @Godownlocation, @TripStatus,
                       @Created_At, @Created_By
                    );`
                );

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Trip_Date', Trip_Date)
                    .input('Arrival_Id', toNumber(product?.Arrival_Id))
                    .input('Batch_No', product?.Batch_No)
                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('QTY', toNumber(product?.QTY))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(product?.To_Location))
                    .input('Created_By', toNumber(Created_By))
                    .query(`
                    -- trip update
                        DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                        DECLARE @reference_id INT;
                        ${filterableText(product?.Batch_No) ? `
                    -- batch update in arrival
                            UPDATE tbl_Trip_Arrival
                            SET Batch_No = @Batch_No
                            WHERE Arr_Id = @Arrival_Id;` : ''}
                    -- Trip details
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, Arrival_Id
                        ) VALUES (
                            @Trip_Id, @Arrival_Id
                        );
                        SET @reference_id = SCOPE_IDENTITY();
                        ${(BillType === 'MATERIAL INWARD' && filterableText(product?.Batch_No)) ? `
                    -- Batch details
                            MERGE tbl_Batch_Master AS target
                            USING (SELECT @Batch_No AS batch, @Product_Id AS item_id, @To_Location AS godown_id) AS src
                            ON  target.batch         = src.batch
                                AND target.item_id   = src.item_id
                                AND target.godown_id = src.godown_id
                            WHEN MATCHED THEN 
                                UPDATE SET target.quantity = target.quantity + @QTY
                            WHEN NOT MATCHED THEN
                                INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by, ob_id)
                                VALUES (NEWID(), @Batch_No, @Product_Id, @To_Location, @Trip_Date, @QTY, @Gst_Rate, @Created_By, @openingId);`
                            : ''}
                    -- if the bill type is Godown transfer
                        ${(BillType === 'OTHER GODOWN' && filterableText(product?.Batch_No)) ? `
                            DECLARE @batch_id uniqueidentifier = (
                                SELECT TOP(1) id FROM tbl_Batch_Master
                                WHERE batch = @Batch_No AND item_id = @Product_Id AND godown_id = @From_Location
                            );
                            INSERT INTO tbl_Batch_Transaction (
                                batch_id, batch, trans_date, item_id, godown_id, 
                                quantity, type, reference_id, created_by, ob_id
                            ) VALUES (
                                @batch_id, @Batch_No, @Trip_Date, @Product_Id, @From_Location, 
                                @QTY, 'TRIP_SHEET', @reference_id, @Created_By, @openingId
                            );
                        ` : ''}
                        `
                    );

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                const employeeData = await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                       INSERT INTO tbl_Trip_Employees (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                       VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);`
                    );

                if (employeeData.rowsAffected[0] === 0) throw new Error('Failed to save employee data');
            }

            await transaction.commit();
            success(res, 'Trip Created!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const updateTripDetails = async (req, res) => {

        const {
            Trip_Id,
            Branch_Id,
            Trip_Date,
            Vehicle_No,
            Trip_ST_KM = 0,
            Trip_EN_KM = 0,
            PhoneNumber = '',
            LoadingLoad = 0,
            LoadingEmpty = 0,
            UnloadingLoad = 0,
            UnloadingEmpty = 0,
            Godownlocation = 0,
            BillType = 0,
            VoucherType = '',
            Narration = '',
            Updated_By = '',
            TripStatus = 'New',
            Product_Array = [],
            EmployeesInvolved = []
        } = req.body;

        const StartTime = isValidDate(req.body.StartTime) ? new Date(req.body.StartTime) : null,
            EndTime = isValidDate(req.body.EndTime) ? new Date(req.body.EndTime) : null;

        if (!checkIsNumber(Branch_Id) || Trip_Date === '' || !checkIsNumber(Trip_Id)) {
            return invalidInput(res, 'Check values ');
        }
        if (StartTime && EndTime && new Date(StartTime) > new Date(EndTime)) {
            return invalidInput(res, 'Start Time cannot be greater than End Time');
        }
        if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
            return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        }

        const transaction = new sql.Transaction();

        try {

            const tripCheck = await new sql.Request()
                .input('Trip_Id', Trip_Id)
                .query(`
                    SELECT COUNT(*) AS TripCount FROM tbl_Trip_Master WHERE Trip_Id = @Trip_Id
                `);

            if (tripCheck.recordset[0].TripCount === 0) {
                return invalidInput(res, 'Trip does not exist');
            }

            const Trip_Tot_Kms = Subraction(Trip_EN_KM, Trip_ST_KM);

            await transaction.begin();

            const updateMaster = await new sql.Request(transaction)
                .input('Trip_Id', toNumber(Trip_Id))
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('PhoneNumber', PhoneNumber)
                .input('LoadingLoad', toNumber(LoadingLoad || 0))
                .input('LoadingEmpty', toNumber(LoadingEmpty || 0))
                .input('UnloadingLoad', toNumber(UnloadingLoad || 0))
                .input('UnloadingEmpty', toNumber(UnloadingEmpty || 0))
                .input('BillType', BillType)
                .input('Narration', Narration)
                .input('TripStatus', TripStatus)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_ST_KM', toNumber(Trip_ST_KM))
                .input('Trip_EN_KM', toNumber(Trip_EN_KM))
                .input('Trip_Tot_Kms', Trip_Tot_Kms)
                .input('Godownlocation', Godownlocation)
                .input('Updated_By', Updated_By)
                .input('Updated_At', new Date())
                .query(`
                    UPDATE tbl_Trip_Master
                    SET 
                        Branch_Id = @Branch_Id,
                        Trip_Date = @Trip_Date,
                        Vehicle_No = @Vehicle_No,
                        StartTime = @StartTime,
                        EndTime = @EndTime,
                        Trip_ST_KM = @Trip_ST_KM,
                        Trip_EN_KM = @Trip_EN_KM,
                        Trip_Tot_Kms = @Trip_Tot_Kms,
                        Godownlocation = @Godownlocation,
                        PhoneNumber = @PhoneNumber,
                        LoadingLoad = @LoadingLoad,
                        LoadingEmpty = @LoadingEmpty,
                        UnloadingLoad = @UnloadingLoad,
                        UnloadingEmpty = @UnloadingEmpty,
                        BillType = @BillType,
                        Narration = @Narration,
                        TripStatus = @TripStatus,
                        Updated_By = @Updated_By,
                        Updated_At = @Updated_At
                    WHERE Trip_Id = @Trip_Id
               `);

            if (updateMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to update Trip Master');
            }

            await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .input('Updated_By', Updated_By)
                .query(`
                -- latest obid
                    DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, 
                        quantity, type, reference_id, created_by, ob_id
                    ) 
                    SELECT *
                    FROM ( 
                        SELECT
                            (
                                SELECT TOP(1) id FROM tbl_Batch_Master
                                WHERE batch = ta.Batch_No AND item_id = ta.Product_Id AND godown_id = ta.To_Location
                                ORDER BY id DESC
                            ) batch_id,
                            ta.Batch_No batch,
                            GETDATE() trans_date,
                            ta.Product_Id item_id,
                            ta.To_Location godown_id,
                            -ta.QTY quantity,
                            'REVERSAL_TRIP_SHEET' type,
                            td.Id reference_id,
                            @Updated_By created_by,
                            @openingId as ob_id
                        FROM tbl_Trip_Details AS td
                        LEFT JOIN tbl_Trip_Arrival as ta
                            ON ta.Arr_Id = td.Arrival_Id
                        WHERE 
                            td.Trip_Id = @Trip_Id
                            AND ta.Batch_No IS NOT NULL
                            AND ta.Batch_No <> ''
                    ) AS batchDetails
                    WHERE batchDetails.batch_id IS NOT NULL;
                    UPDATE tbl_Trip_Arrival
                    SET Batch_No = null
                    WHERE Arr_Id IN (
                        SELECT Arrival_Id
                        FROM tbl_Trip_Details
                        WHERE Trip_Id = @Trip_Id
                    );
                -- deleteing for new insert
                    DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id;
                    DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id;`
                );

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Trip_Date', Trip_Date)
                    .input('Arrival_Id', toNumber(product?.Arrival_Id))
                    .input('Batch_No', product?.Batch_No ? product?.Batch_No : null)
                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('QTY', toNumber(product?.QTY))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(product?.To_Location))
                    .input('Created_By', toNumber(Updated_By))
                    .query(`
                    -- trip update
                        DECLARE @reference_id INT;
                    -- latest obid
                        DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                    -- batch update in arrival
                        UPDATE tbl_Trip_Arrival
                        SET Batch_No = @Batch_No
                        WHERE Arr_Id = @Arrival_Id;
                    -- trip details
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, Arrival_Id
                        ) VALUES (
                            @Trip_Id, @Arrival_Id
                        );
                        SET @reference_id = SCOPE_IDENTITY();
                        ${(BillType === 'MATERIAL INWARD' && filterableText(product?.Batch_No)) ? `
                    -- Batch details
                            MERGE tbl_Batch_Master AS target
                            USING (SELECT @Batch_No AS batch, @Product_Id AS item_id, @To_Location AS godown_id) AS src
                            ON  target.batch         = src.batch
                                AND target.item_id   = src.item_id
                                AND target.godown_id = src.godown_id
                            WHEN MATCHED THEN 
                                UPDATE SET target.quantity = target.quantity + @QTY
                            WHEN NOT MATCHED THEN
                                INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by, ob_id)
                                VALUES (NEWID(), @Batch_No, @Product_Id, @To_Location, @Trip_Date, @QTY, @Gst_Rate, @Created_By, @openingId);`
                            : ''}
                    -- if the bill type is Godown transfer
                        ${(BillType === 'OTHER GODOWN' && filterableText(product?.Batch_No)) ? `
                            DECLARE @batch_id uniqueidentifier = (
                                SELECT TOP(1) id FROM tbl_Batch_Master
                                WHERE batch = @Batch_No AND item_id = @Product_Id AND godown_id = @From_Location
                            );
                            INSERT INTO tbl_Batch_Transaction (
                                batch_id, batch, trans_date, item_id, godown_id, 
                                quantity, type, reference_id, created_by, ob_id
                            ) VALUES (
                                @batch_id, @Batch_No, @Trip_Date, @Product_Id, @From_Location, 
                                @QTY, 'TRIP_SHEET', @reference_id, @Created_By, @openingId
                            );
                        ` : ''}
                        `
                    );

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                        INSERT INTO tbl_Trip_Employees (
                            Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );`
                    );
            }

            await transaction.commit();
            success(res, 'Trip Updated!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const getTripDetails = async (req, res) => {
        try {
            const FromDate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const ToDate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            if (!FromDate && !ToDate) {
                return invalidInput(res, 'Select StartDate & EndDate')
            }

            const request = new sql.Request();
            request.input('FromDate', sql.Date, FromDate);
            request.input('ToDate', sql.Date, ToDate);
            const result = await request.query(
                `WITH TRIP_MASTER AS (
                    SELECT
                        tm.*,
                		COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                		COALESCE(cb_created.Name, 'unknown') AS Created_By_User,
                		COALESCE(cb_updated.Name, 'unknown') AS Updated_By_User,
                		COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                    FROM tbl_Trip_Master AS tm
                	LEFT JOIN tbl_Branch_Master AS bm
                	ON bm.BranchId = tm.Branch_Id
                	LEFT JOIN tbl_Users AS cb_created
                	ON cb_created.UserId = tm.Created_By
                	LEFT JOIN tbl_Users AS cb_updated
                	ON cb_updated.UserId = tm.Updated_By
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = tm.VoucherType
                    WHERE 
                		tm.Trip_Date BETWEEN @FromDate AND @ToDate
                        AND tm.BillType IN (
                            'MATERIAL INWARD',
                            'OTHER GODOWN'
                        )
                ), TRIP_DETAILS AS (
                    SELECT
                        td.*, ta.*,
                        COALESCE(pm.Product_Rate, 0) AS Product_Rate,
                        CASE 
                        WHEN TRY_CAST(pck.Pack AS DECIMAL(18,2)) IS NULL
                             OR TRY_CAST(pck.Pack AS DECIMAL(18,2)) = 0
                        THEN 0
                        ELSE CONVERT(
                            DECIMAL(18,2),
                            COALESCE(QTY, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
                        )
                    END AS Bag,
                        COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                        COALESCE(gm_from.Godown_Name, 'Unknown') AS FromLocation,
                        COALESCE(gm_to.Godown_Name, 'Unknown') AS ToLocation,
                        po.OrderId AS arrivalOrderId
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival as ta
                        ON ta.Arr_Id = td.Arrival_Id
                    LEFT JOIN tbl_Product_Master AS pm
                        ON pm.Product_Id = ta.Product_Id
                    LEFT JOIN tbl_Godown_Master AS gm_from
                        ON gm_from.Godown_Id = ta.From_Location
                    LEFT JOIN tbl_Godown_Master AS gm_to
                        ON gm_to.Godown_Id = ta.To_Location
                    LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS po
                        ON po.Trip_Id = td.Trip_Id AND po.Trip_Item_SNo = td.Arrival_Id
                        LEFT JOIN tbl_Pack_Master as pck
                        ON pck.Pack_Id=pm.Pack_Id
                    WHERE 
                        td.Trip_Id IN (SELECT Trip_Id FROM TRIP_MASTER)
                ), MAPED_ARRIVALS AS (
                    SELECT 
                        Id, OrderId, Trip_Id, Trip_Item_SNo, TransporterIndex,
                        LocationId, Location, ArrivalDate, ItemId, ItemName,
                        Quantity, Weight, BilledRate
                    FROM tbl_PurchaseOrderDeliveryDetails
                    WHERE Trip_Id IN (SELECT Trip_Id FROM TRIP_MASTER)
                ),TRIP_EMPLOYEES AS (
                    SELECT 
                        te.*,
                        e.Cost_Center_Name AS Emp_Name,
                        cc.Cost_Category
                    FROM 
                        tbl_Trip_Employees AS te
                    LEFT JOIN tbl_ERP_Cost_Center AS e
                        ON e.Cost_Center_Id = te.Involved_Emp_Id
                    LEFT JOIN tbl_ERP_Cost_Category AS cc
                        ON cc.Cost_Category_Id = te.Cost_Center_Type_Id
                	WHERE 
                        te.Trip_Id IN (SELECT Trip_Id FROM TRIP_MASTER)
                )
                SELECT 
                    tm.*,
                    COALESCE((
                        SELECT td.* 
                        FROM TRIP_DETAILS AS td
                        WHERE td.Trip_Id = tm.Trip_Id
                        FOR JSON PATH
                    ), '[]') AS Products_List,
                    COALESCE((
                        SELECT te.* 
                        FROM TRIP_EMPLOYEES AS te
                        WHERE te.Trip_Id = tm.Trip_Id
                        FOR JSON PATH
                    ), '[]') AS Employees_Involved,
                    COALESCE((
                        SELECT ma.* 
                        FROM MAPED_ARRIVALS AS ma
                        WHERE ma.Trip_Id = tm.Trip_Id
                        FOR JSON PATH
                    ), '[]') AS ConvertedPurchaseOrders
                FROM 
                    TRIP_MASTER AS tm`
            );

            if (result.recordset.length > 0) {

                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: JSON.parse(o?.Products_List),
                    Employees_Involved: JSON.parse(o?.Employees_Involved),
                    ConvertedPurchaseOrders: JSON.parse(o?.ConvertedPurchaseOrders)
                }));

                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {

            servError(e, res);
        }
    };

    return {
        createTripDetails,
        updateTripDetails,
        getTripDetails,
    }
}

export default tripActivities()
