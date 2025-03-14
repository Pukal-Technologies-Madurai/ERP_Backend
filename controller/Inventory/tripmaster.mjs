
import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, createPadString, isValidDate, toNumber } from '../../helper_functions.mjs'
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

const tripActivities = () => {

    const createTripDetails = async (req, res) => {
        const {
            Branch_Id,
            Trip_Date,
            Vehicle_No = '',
            Trip_No = '',
            Trip_ST_KM = '',
            Trip_EN_KM = '',
            Created_by = '',
            PhoneNumber = '',
            LoadingLoad = 0,
            LoadingEmpty = 0,
            UnloadingLoad = 0,
            UnloadingEmpty = 0,
            Godownlocation = 0,
            BillType = '',
            VoucherType = 0,
            Narration = '',
            Product_Array = [],
            EmployeesInvolved = [],
        } = req.body;

        const StartTime = isValidDate(req.body.StartTime) ? new Date(req.body.StartTime) : null,
            EndTime = isValidDate(req.body.EndTime) ? new Date(req.body.EndTime) : null;

        if (!checkIsNumber(Branch_Id) || Trip_Date === '' || Vehicle_No === '') {
            return invalidInput(res, 'Select Branch');
        }
        if (StartTime && EndTime && new Date(StartTime) > new Date(EndTime)) {
            return invalidInput(res, 'Start Time cannot be greater than End Time');
        }
        if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
            return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        }

        const transaction = new sql.Transaction();

        try {
            const Trip_Id = Number((await new sql.Request().query(`
               SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
               FROM tbl_Trip_Master
           `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');
            const Challan_No = createPadString(Trip_Id, 4);
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);

            await transaction.begin();

            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', toNumber(Trip_Id))
                .input('Challan_No', Challan_No)
                .input('Branch_Id', toNumber(Branch_Id))
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_No', toNumber(Trip_No))
                .input('PhoneNumber', PhoneNumber)
                .input('LoadingLoad', Number(LoadingLoad || 0))
                .input('LoadingEmpty', Number(LoadingEmpty || 0))
                .input('UnloadingLoad', Number(UnloadingLoad || 0))
                .input('UnloadingEmpty', Number(UnloadingEmpty || 0))
                .input('Godownlocation', toNumber(Godownlocation))
                .input('BillType', BillType)
                .input('VoucherType', toNumber(VoucherType))
                .input('Narration', Narration)
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Trip_EN_KM', Number(Trip_EN_KM))
                .input('Trip_Tot_Kms', toNumber(Trip_Tot_Kms))
                .input('Created_By', Created_by)
                .input('Created_At', new Date())
                .query(`
                   INSERT INTO tbl_Trip_Master (
                       Trip_Id, Challan_No, Branch_Id, Trip_Date, Vehicle_No,
                       PhoneNumber, LoadingLoad, LoadingEmpty, UnloadingLoad, UnloadingEmpty, Narration, BillType, VoucherType,
                       StartTime, EndTime, Trip_No, Trip_ST_KM, Trip_Tot_Kms, Trip_EN_KM, Godownlocation,
                       Created_At, Created_By
                   ) VALUES (
                       @Trip_Id, @Challan_No, @Branch_Id, @Trip_Date, @Vehicle_No,
                       @PhoneNumber, @LoadingLoad, @LoadingEmpty, @UnloadingLoad, @UnloadingEmpty, @Narration, @BillType, @VoucherType,
                       @StartTime, @EndTime, @Trip_No, @Trip_ST_KM, @Trip_EN_KM, @Trip_Tot_Kms, @Godownlocation, 
                       @Created_At, @Created_By
                   );
               `);

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Batch_No', product?.Batch_No)
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(Godownlocation))
                    .input('S_No', i + 1)

                    .input('Concern', product?.Concern)
                    .input('BillNo', product?.BillNo)
                    .input('BatchLocation', product?.BatchLocation)

                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('HSN_Code', product?.HSN_Code)
                    .input('QTY', toNumber(product?.QTY))
                    .input('KGS', toNumber(product?.KGS))

                    .input('Unit_Id', toNumber(product?.Unit_Id))
                    .input('Units', product?.Units)

                    .input('GST_Inclusive', toNumber(product?.GST_Inclusive))
                    .input('IS_IGST', toNumber(product?.IS_IGST))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('Gst_P', toNumber(product?.Gst_P))
                    .input('Cgst_P', toNumber(product?.Cgst_P))
                    .input('Sgst_P', toNumber(product?.Sgst_P))
                    .input('Igst_P', toNumber(product?.Igst_P))
                    .input('Taxable_Value', toNumber(product?.Taxable_Value))
                    .input('Round_off', toNumber(product?.Round_off))
                    .input('Total_Value', toNumber(product?.Total_Value))
                    .input('Trip_From', product?.Trip_From)
                    .input('Party_And_Branch_Id', product?.Party_And_Branch_Id)
                    .input('Transporter_Id', product?.Transporter_Id)
                    .input('Created_By', Created_by)
                    .query(`
                       INSERT INTO tbl_Trip_Details (
                           Trip_Id, Batch_No,From_Location, To_Location, S_No, Product_Id,
                           HSN_Code, QTY, KGS, GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value,
                           Concern, BillNo, BatchLocation, Unit_Id, Units,
                           Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id, Created_By
                       ) VALUES (
                           @Trip_Id, @Batch_No, @From_Location, @To_Location, @S_No, @Product_Id,
                           @HSN_Code, @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value,
                           @Concern, @BillNo, @BatchLocation, @Unit_Id, @Units,
                           @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, @Transporter_Id, @Created_By
                       );
                   `);

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
                       VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);
                   `);

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
            Trip_No = '',
            Trip_ST_KM = 0,
            Trip_EN_KM = 0,
            PhoneNumber = '',
            LoadingLoad = 0,
            LoadingEmpty = 0,
            UnloadingLoad = 0,
            UnloadingEmpty = 0,
            Godownlocation = 0,
            BillType = 0,
            VoucherType = 0,
            Narration = '',
            Updated_By = '',
            Product_Array = [],
            EmployeesInvolved = []
        } = req.body;

        const StartTime = isValidDate(req.body.StartTime) ? new Date(req.body.StartTime) : null,
            EndTime = isValidDate(req.body.EndTime) ? new Date(req.body.EndTime) : null;

        if (!checkIsNumber(Branch_Id) || Trip_Date === '' || Vehicle_No === '' || Trip_Id == '' || Trip_Id == null) {
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
                .input('VoucherType', toNumber(VoucherType))
                .input('Narration', Narration)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_No', Trip_No)
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
                        Trip_No = @Trip_No,
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
                        VoucherType = @VoucherType,
                        Narration = @Narration,
                        Updated_By = @Updated_By,
                        Updated_At = @Updated_At
                    WHERE Trip_Id = @Trip_Id
               `);

            if (updateMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to update Trip Master');
            }

            await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .query(`
                    DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id
                    DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id`
                );

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Batch_No', product?.Batch_No)
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(Godownlocation))
                    .input('S_No', i + 1)

                    .input('Concern', product?.Concern)
                    .input('BillNo', product?.BillNo)
                    .input('BatchLocation', product?.BatchLocation)

                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('HSN_Code', product?.HSN_Code)
                    .input('QTY', toNumber(product?.QTY))
                    .input('KGS', toNumber(product?.KGS))

                    .input('Unit_Id', toNumber(product?.Unit_Id))
                    .input('Units', product?.Units)

                    .input('GST_Inclusive', toNumber(product?.GST_Inclusive))
                    .input('IS_IGST', toNumber(product?.IS_IGST))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('Gst_P', toNumber(product?.Gst_P))
                    .input('Cgst_P', toNumber(product?.Cgst_P))
                    .input('Sgst_P', toNumber(product?.Sgst_P))
                    .input('Igst_P', toNumber(product?.Igst_P))
                    .input('Taxable_Value', toNumber(product?.Taxable_Value))
                    .input('Round_off', toNumber(product?.Round_off))
                    .input('Total_Value', toNumber(product?.Total_Value))
                    .input('Trip_From', product?.Trip_From)
                    .input('Party_And_Branch_Id', product?.Party_And_Branch_Id)
                    .input('Transporter_Id', product?.Transporter_Id)
                    .input('Created_By', Updated_By)
                    .query(`
                           INSERT INTO tbl_Trip_Details (
                               Trip_Id, Batch_No, From_Location, To_Location, S_No, Product_Id,
                               HSN_Code, QTY, KGS, GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value,
                               Concern, BillNo, BatchLocation, Unit_Id, Units,
                               Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id, Created_By
                           ) VALUES (
                               @Trip_Id, @Batch_No, @From_Location, @To_Location, @S_No, @Product_Id,
                               @HSN_Code, @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value,
                               @Concern, @BillNo, @BatchLocation, @Unit_Id, @Units,
                               @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, @Transporter_Id, @Created_By
                           );
                       `);

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                       INSERT INTO tbl_Trip_Employees
                       (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                       VALUES
                       (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                   `);
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
                        DISTINCT po.OrderId AS convertedPurchaseOrderId, 
                        tm.*,
                		COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                		COALESCE(cb_created.Name, 'unknown') AS Created_By_User,
                		COALESCE(cb_updated.Name, 'unknown') AS Updated_By_User
                    FROM tbl_Trip_Master AS tm
                	LEFT JOIN tbl_Branch_Master AS bm
                	ON bm.BranchId = tm.Branch_Id
                	LEFT JOIN tbl_Users AS cb_created
                	ON cb_created.UserId = tm.Created_By
                	LEFT JOIN tbl_Users AS cb_updated
                	ON cb_updated.UserId = tm.Updated_By
                    LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS po
                    ON po.Trip_Id = tm.Trip_Id
                    WHERE 
                		tm.Trip_Date BETWEEN @FromDate AND @ToDate	
                ), TRIP_DETAILS AS (
                    SELECT
                        td.*,
                        COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                        COALESCE(gm_from.Godown_Name, 'Unknown') AS FromLocation,
                        COALESCE(gm_to.Godown_Name, 'Unknown') AS ToLocation,
                        po.OrderId AS arrivalOrderId
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Product_Master AS pm
                        ON pm.Product_Id = td.Product_Id
                    LEFT JOIN tbl_Godown_Master AS gm_from
                        ON gm_from.Godown_Id = td.From_Location
                    LEFT JOIN tbl_Godown_Master AS gm_to
                        ON gm_to.Godown_Id = td.To_Location
                    LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS po
                        ON po.Trip_Id = td.Trip_Id AND po.ItemId = td.Product_Id
                    WHERE 
                        td.Trip_Id IN (SELECT Trip_Id FROM TRIP_MASTER)
                ), TRIP_EMPLOYEES AS (
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
                        SELECT 
                            td.* 
                        FROM 
                            TRIP_DETAILS AS td
                        WHERE 
                            td.Trip_Id = tm.Trip_Id
                        FOR JSON PATH
                    ), '[]') AS Products_List,
                    COALESCE((
                        SELECT 
                            te.* 
                        FROM 
                            TRIP_EMPLOYEES AS te
                        WHERE 
                            te.Trip_Id = tm.Trip_Id
                        FOR JSON PATH
                    ), '[]') AS Employees_Involved
                FROM 
                    TRIP_MASTER AS tm`
            );

            if (result.recordset.length > 0) {

                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: JSON.parse(o?.Products_List),
                    Employees_Involved: JSON.parse(o?.Employees_Involved)
                }));

                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {

            servError(e, res);
        }
    };

    const getArrivalReport = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    WITH Arrival AS (
                        SELECT 
    	                    td.*,
		                    t.Trip_Date,
		                    t.Challan_No,
		                    t.Vehicle_No,
		                    t.StartTime, t.EndTime,
		                    t.Trip_ST_KM, t.Trip_EN_KM,
		                    t.Godownlocation, 
                            t.Narration,
		                    pm.Product_Name,
                    	    COALESCE(gm_from.Godown_Name, 'Unknown') AS FromLocation,
                            COALESCE(gm_to.Godown_Name, 'Unknown') AS ToLocation
                        FROM tbl_Trip_Details AS td
                        LEFT JOIN tbl_Trip_Master AS t
                        ON t.Trip_Id = td.Trip_Id
                    	LEFT JOIN tbl_Product_Master AS pm
                    	ON pm.Product_Id = td.Product_Id
                    	LEFT JOIN tbl_Godown_Master AS gm_from
                    	ON gm_from.Godown_Id = td.From_Location
                    	LEFT JOIN tbl_Godown_Master AS gm_to
                    	ON gm_to.Godown_Id = td.To_Location
                        WHERE 
		                    t.Trip_Date BETWEEN @Fromdate AND @Todate
		                    AND t.BillType = 'MATERIAL INWARD'
                    ), ConvertedAsOrders AS (
                    	SELECT 
		                    OrderId,
		                    Trip_Id,
		                    Trip_Item_SNo,
		                    LocationId,
		                    Location,
		                    ArrivalDate,
		                    ItemId,
		                    BillDate,
		                    BilledRate,
		                    Quantity,
		                    Weight
                    	FROM tbl_PurchaseOrderDeliveryDetails
                    	WHERE Trip_Id IN (
                    		SELECT Trip_Id
                    		FROM Arrival
                    	)
                    ), ConvertedAsInvoices AS (
                        SELECT pio.PIN_Id, pio.Order_Id, pis.Item_Id, pis.Bill_Qty
                        FROM tbl_Purchase_Order_Inv_Gen_Order AS pio
                        JOIN tbl_Purchase_Order_Inv_Stock_Info AS pis
                        ON pis.PIN_Id = pio.PIN_Id 
                        WHERE pio.Order_Id IN (
                            SELECT OrderId
                            FROM ConvertedAsOrders
                        )
                    ) 
                    SELECT 
                    	td.*,
                    	COALESCE((
                    		SELECT pod.*
                    		FROM ConvertedAsOrders AS pod
                    		WHERE 
                        		pod.Trip_Id = td.Trip_Id 
                        		AND pod.ItemId = td.Product_Id 
                        		AND pod.LocationId = td.Godownlocation
                    		FOR JSON PATH
                    	), '[]') AS ConvertedOrders,
                    	COALESCE((
                    		SELECT cai.*
                    		FROM ConvertedAsInvoices AS cai
                    		JOIN ConvertedAsOrders AS co
                    		ON 
                        		co.Trip_Id = td.Trip_Id 
                    			AND co.OrderId = cai.Order_Id
                    			AND cai.Item_Id = td.Product_Id
                    		FOR JSON PATH
                    	), '[]') AS ConvertedAsInvoices
                    FROM Arrival AS td`
                );
            
            const result = await request;

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    ConvertedOrders: JSON.parse(o?.ConvertedOrders),
                    ConvertedAsInvoices: JSON.parse(o?.ConvertedAsInvoices)
                }));
                dataFound(res, parsed)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        createTripDetails,
        updateTripDetails,
        getTripDetails,
        getArrivalReport
    }
}

export default tripActivities()
