import sql from 'mssql';
import { servError, dataFound, noData, success, failed, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, createPadString, ISOString } from '../../helper_functions.mjs';
import SPCall from '../../middleware/SPcall.mjs';

const StockJournal = () => {

    const createStockJournal = async (req, res) => {
        const {
            Branch_Id,
            Stock_Journal_date = '',
            Stock_Journal_Bill_type = 0,
            Stock_Journal_Voucher_type = '',
            Invoice_no = '',
            Narration = '',
            // Start_Time = '',
            // End_Time = '',
            // Vehicle_Start_KM = '',
            // Vehicle_End_KM = '',
            // Trip_No = '',
            Created_by = ''
        } = req.body;


        if (!checkIsNumber(Branch_Id)) {
            return invalidInput(res, 'Select Branch');
        }
        // if (Start_Time && End_Time && new Date(Start_Time) > new Date(End_Time)) {
        //     return invalidInput(res, 'Start Time cannot be greater than End Time');
        // }

        // if (Vehicle_Start_KM && Vehicle_End_KM && Number(Vehicle_Start_KM) > Number(Vehicle_End_KM)) {
        //     return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        // }

        const Source = Array.isArray(req.body.Source) ? req.body.Source : [];
        const StaffInvolve = Array.isArray(req.body.StaffInvolve) ? req.body.StaffInvolve : [];
        const Destination = Array.isArray(req.body.Destination) ? req.body.Destination : [];

        const transaction = new sql.Transaction();

        try {
            const ST_Inv_Id = Number((await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .input('Stock_Journal_Bill_type', Stock_Journal_Bill_type)
                .query(`
                    SELECT COALESCE(MAX(ST_Inv_Id), 0) AS MaxId
                    FROM tbl_Stock_Journal_Gen_Info
                    WHERE Branch_Id = @Branch_Id
                    AND Stock_Journal_Bill_type = @Stock_Journal_Bill_type
                `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(ST_Inv_Id)) throw new Error('Failed to get Branch Id');

            const STJ_Id = Number((await new sql.Request().query(`
                SELECT COALESCE(MAX(STJ_Id), 0) AS MaxId
                FROM tbl_Stock_Journal_Gen_Info
            `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(STJ_Id)) throw new Error('Failed to get Stock Journal ID');

            const Journal_no = 'JN_' + Branch_Id + '_' + createPadString(ST_Inv_Id, 4);

            await transaction.begin();

            const OrderDetailsInsert = await new sql.Request(transaction)
                .input('STJ_Id', STJ_Id)
                .input('ST_Inv_Id', ST_Inv_Id)
                .input('Branch_Id', Number(Branch_Id))
                .input('Journal_no', Journal_no || null)
                .input('Stock_Journal_date', Stock_Journal_date)
                .input('Stock_Journal_Bill_type', Stock_Journal_Bill_type)
                .input('Stock_Journal_Voucher_type', Stock_Journal_Voucher_type)
                .input('Invoice_no', Invoice_no)
                .input('Narration', Narration)
                // .input('Start_Time', Start_Time)
                // .input('End_Time', End_Time)
                // .input('Vehicle_Start_KM', Number(Vehicle_Start_KM))
                // .input('Vehicle_End_KM', Number(Vehicle_End_KM))
                // .input('Trip_No', Trip_No)
                .input('Created_by', Created_by)
                .query(`
                    INSERT INTO tbl_Stock_Journal_Gen_Info (
                        STJ_Id, ST_Inv_Id, Branch_Id, Journal_no, Stock_Journal_date,
                        Stock_Journal_Bill_type, Stock_Journal_Voucher_type, Invoice_no, Narration, 
                        Trip_No, Created_by
                    ) VALUES (
                        @STJ_Id, @ST_Inv_Id, @Branch_Id, @Journal_no, @Stock_Journal_date,
                        @Stock_Journal_Bill_type, @Stock_Journal_Voucher_type, @Invoice_no, @Narration,
                        @Trip_No, @Created_by
                    );
                `);

            if (OrderDetailsInsert.rowsAffected[0] == 0) {
                throw new Error('Failed to insert Journal details');
            }

            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', STJ_Id)
                    .input('Sour_Item_Id', item.Sour_Item_Id)
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', item.Sour_Batch_Lot_No)
                    .input('Sour_Qty', Number(item.Sour_Qty) || null)
                    .input('Sour_Unit_Id', item.Sour_Unit_Id)
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate) || null)
                    .input('Sour_Amt', Number(item.Sour_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Sour_Details (
                            STJ_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, 
                            Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                        ) VALUES (
                            @STJ_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, 
                            @Sour_Unit_Id, @Sour_Unit, @Sour_Rate, @Sour_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Source details');
                }
            }

            for (let i = 0; i < StaffInvolve.length; i++) {
                const delivery = StaffInvolve[i];
                const result = await new sql.Request(transaction)
                    .input('STJ_Id', STJ_Id)
                    .input('Staff_Type_Id', Number(delivery.Staff_Type_Id) || null)
                    .input('Staff_Id', Number(delivery.Staff_Id) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Staff_Involved (
                            STJ_Id, Staff_Type_Id, Staff_Id
                        ) VALUES (
                            @STJ_Id, @Staff_Type_Id, @Staff_Id
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }

            for (let i = 0; i < Destination.length; i++) {
                const final = Destination[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', Number(STJ_Id) || null)
                    .input('Dest_Item_Id', Number(final.Dest_Item_Id) || null)
                    .input('Dest_Goodown_Id', Number(final.Dest_Goodown_Id) || null)
                    .input('Dest_Batch_Lot_No', final.Dest_Batch_Lot_No)
                    .input('Dest_Qty', Number(final.Dest_Qty) || null)
                    .input('Dest_Unit_Id', Number(final.Dest_Unit_Id) || null)
                    .input('Dest_Unit', final.Dest_Unit)
                    .input('Dest_Rate', Number(final.Dest_Rate) || null)
                    .input('Dest_Amt', Number(final.Dest_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Dest_Details (
                            STJ_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, 
                            Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @STJ_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, 
                            @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Destination details');
                }
            }

            await transaction.commit();

            return success(res, 'Stock Journal created successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const updateStockJournal = async (req, res) => {
        const {
            STJ_Id = '',
            Stock_Journal_date = '',
            Stock_Journal_Bill_type = '',
            Stock_Journal_Voucher_type = '',
            Invoice_no = '',
            Narration = '',
            // Start_Time = '',
            // End_Time = '',
            // Vehicle_Start_KM = 0,
            // Vehicle_End_KM = 0,
            // Trip_No = '',
            altered_by = '',
            Source = [],
            StaffInvolve = [],
            Destination = []
        } = req.body;

        const transaction = new sql.Transaction();


        // if (Start_Time && End_Time && new Date(Start_Time) > new Date(End_Time)) {
        //     return invalidInput(res, 'Start Time cannot be greater than End Time');
        // }

        // if (Vehicle_Start_KM && Vehicle_End_KM && Number(Vehicle_Start_KM) > Number(Vehicle_End_KM)) {
        //     return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        // }

        try {
            await transaction.begin();

            const updateOrderDetails = await new sql.Request(transaction)
                .input('STJ_Id', Number(STJ_Id))
                .input('Stock_Journal_date', Stock_Journal_date)
                .input('Stock_Journal_Bill_type', Stock_Journal_Bill_type)
                .input('Invoice_no', Invoice_no)
                .input('Narration', Narration)
                // .input('Start_Time', Start_Time)
                // .input('End_Time', End_Time)
                // .input('Vehicle_Start_KM', Number(Vehicle_Start_KM) || 0)
                // .input('Vehicle_End_KM', Number(Vehicle_End_KM) || 0)
                // .input('Trip_No', Trip_No)
                .input('altered_by', altered_by)
                .query(`
                    UPDATE tbl_Stock_Journal_Gen_Info
                    SET 
                        Stock_Journal_date = @Stock_Journal_date, 
                        Stock_Journal_Bill_type = @Stock_Journal_Bill_type,
                        Invoice_no = @Invoice_no,
                        Narration = @Narration,
                        altered_by = @altered_by
                    WHERE STJ_Id = @STJ_Id
                `);

            if (updateOrderDetails.rowsAffected[0] === 0) {
                throw new Error('Failed to update General Info');
            }

            await new sql.Request(transaction)
                .input('STJ_Id', STJ_Id)
                .query(`
                    DELETE FROM tbl_Stock_Journal_Sour_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Dest_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Staff_Involved WHERE STJ_Id = @STJ_Id;
                `);


            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', STJ_Id)
                    .input('Sour_Item_Id', item.Sour_Item_Id)
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', item.Sour_Batch_Lot_No)
                    .input('Sour_Qty', Number(item.Sour_Qty) || null)
                    .input('Sour_Unit_Id', item.Sour_Unit_Id)
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate) || null)
                    .input('Sour_Amt', Number(item.Sour_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Sour_Details (
                            STJ_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, 
                            Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                        ) VALUES (
                            @STJ_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, 
                            @Sour_Unit_Id, @Sour_Unit, @Sour_Rate, @Sour_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Source details');
                }
            }

            for (let i = 0; i < Destination.length; i++) {
                const item = Destination[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', Number(STJ_Id) || null)
                    .input('Dest_Item_Id', Number(item.Dest_Item_Id) || null)
                    .input('Dest_Goodown_Id', Number(item.Dest_Goodown_Id) || null)
                    .input('Dest_Batch_Lot_No', item.Dest_Batch_Lot_No || null)
                    .input('Dest_Qty', Number(item.Dest_Qty) || null)
                    .input('Dest_Unit_Id', Number(item.Dest_Unit_Id) || null)
                    .input('Dest_Unit', item.Dest_Unit || null)
                    .input('Dest_Rate', Number(item.Dest_Rate) || null)
                    .input('Dest_Amt', Number(item.Dest_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Dest_Details (
                            STJ_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, 
                            Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @STJ_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, 
                            @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Destination details');
                }
            }

            for (let i = 0; i < StaffInvolve.length; i++) {
                const staff = StaffInvolve[i];
                const result = await new sql.Request(transaction)
                    .input('STJ_Id', STJ_Id)
                    .input('Staff_Type_Id', Number(staff.Staff_Type_Id) || null)
                    .input('Staff_Id', Number(staff.Staff_Id) || null)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Staff_Involved (
                            STJ_Id, Staff_Type_Id, Staff_Id
                        ) VALUES (
                            @STJ_Id, @Staff_Type_Id, @Staff_Id
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }

            await transaction.commit();
            return success(res, 'Journal Updated Successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const deleteJournalInfo = async (req, res) => {

        const { STJ_Id } = req.body;

        if (!checkIsNumber(STJ_Id)) return invalidInput(res, 'OrderId is required');

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('STJ_Id', STJ_Id)
                .query(`
                    DELETE FROM tbl_Stock_Journal_Gen_Info WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Sour_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Dest_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Staff_Involved WHERE STJ_Id = @STJ_Id;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) throw new Error('Failed to delete Journal');

            await transaction.commit();

            return success(res, 'Journal Deleted!')

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const getJournalDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const Stock_Journal_Bill_type = req.query.billType;
            const request = new sql.Request();

            const result = await request
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('Stock_Journal_Bill_type', Stock_Journal_Bill_type)
                .query(`
                    WITH UserTypes AS (
                        SELECT Id, UserType
                        FROM tbl_User_Type
                    ), Godown AS (
                        SELECT Godown_Id, Godown_Name
                        FROM tbl_Godown_Master
                    ), Product AS (
                        SELECT Product_Id, Product_Name
                        FROM tbl_Product_Master
                    ), Branch AS (
                        SELECT BranchId, BranchName
                        FROM tbl_Branch_Master
                    ), CostCenter AS (
                        SELECT c.Cost_Center_Id, c.Cost_Center_Name, c.User_Type, 
                            COALESCE(ut.UserType, 'Not Found') AS UserTypeGet 
                        FROM tbl_ERP_Cost_Center AS c
                        LEFT JOIN UserTypes AS ut
                            ON c.User_Type = ut.Id
                    ), SJ_Main AS (
                        SELECT sj.*,
                        b.BranchName
                        FROM tbl_Stock_Journal_Gen_Info AS sj
                        LEFT JOIN Branch AS b
                        ON sj.Branch_Id = b.BranchId
                        WHERE 
                            CONVERT(DATE, sj.Stock_Journal_date) >= CONVERT(DATE, @Fromdate) 
                            AND CONVERT(DATE, sj.Stock_Journal_date) <= CONVERT(DATE, @Todate)
                            ${Stock_Journal_Bill_type
                        ? ' AND sj.Stock_Journal_Bill_type = @Stock_Journal_Bill_type '
                        : ''
                    }
                    ), Source AS (
                      SELECT s.*,
                        p.Product_Name,
                        g.Godown_Name
                        FROM tbl_Stock_Journal_Sour_Details AS s
                        LEFT JOIN Product AS p
                        ON s.Sour_Item_Id = p.Product_Id
                        LEFT JOIN Godown AS g
                        ON s.Sour_Goodown_Id = g.Godown_Id
                        WHERE s.STJ_Id IN (
                            SELECT STJ_Id 
                            FROM SJ_Main
                    	)
                    ), Destination AS (
                        SELECT d.*,
                        p.Product_Name,
                        g.Godown_Name
                        FROM tbl_Stock_Journal_Dest_Details AS d
                        LEFT JOIN Product AS p
                        ON d.Dest_Item_Id = p.Product_Id
                        LEFT JOIN Godown AS g
                        ON d.Dest_Goodown_Id = g.Godown_Id
                        WHERE d.STJ_Id IN (
                            SELECT STJ_Id 
                            FROM SJ_Main
                    	)
                    ), Staffs AS (
                        SELECT st.*,
                            cc.Cost_Center_Name,
                            cc.UserTypeGet
                        FROM tbl_Stock_Journal_Staff_Involved AS st
                        LEFT JOIN CostCenter AS cc
                        ON cc.Cost_Center_Id = st.Staff_Id
                        WHERE st.STJ_Id IN (
                            SELECT STJ_Id 
                            FROM SJ_Main
                    	)
                    )
                    SELECT 
                        main.*,
                        COALESCE(( 
                            SELECT source.*
                            FROM Source AS source
                            WHERE source.STJ_Id = main.STJ_Id
                            FOR JSON PATH
                        ), '[]') AS SourceDetails,
                        COALESCE((
                            SELECT destination.*
                            FROM Destination AS destination
                            WHERE destination.STJ_Id = main.STJ_Id
                            FOR JSON PATH
                        ), '[]') AS DestinationDetails,
                        COALESCE((
                            SELECT staff.*
                            FROM Staffs AS staff
                            WHERE staff.STJ_Id = main.STJ_Id
                            FOR JSON PATH
                        ), '[]') AS StaffsDetails
                    FROM SJ_Main AS main
                    ORDER BY main.STJ_Id;
                `);

            if (result.recordset.length > 0) {
                const extractedData = result.recordset.map(o => ({
                    ...o,
                    SourceDetails: JSON.parse(o.SourceDetails),
                    DestinationDetails: JSON.parse(o.DestinationDetails),
                    StaffsDetails: JSON.parse(o.StaffsDetails)
                }));

                dataFound(res, extractedData);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const godownActivity = async (req, res) => {
        const { fromGodown, toGodown } = req.query;

        const FromDate = ISOString(req.query.FromDate), ToDate = ISOString(req.query.ToDate);

        if (!checkIsNumber(fromGodown) || !checkIsNumber(toGodown)) {
            return invalidInput(res, 'Source and Destination Godowns are required');
        }

        try {

            const request = new sql.Request()
                .input('fromDate', sql.Date, FromDate)
                .input('toDate', sql.Date, ToDate)
                .input('fromGodown', sql.Int, fromGodown)
                .input('toGodown', sql.Int, toGodown)
                .query(`
                    WITH SJ_IDs AS (
                    	SELECT 
                    		DISTINCT sjg.STJ_Id
                    	FROM
                    		tbl_Stock_Journal_Sour_Details AS s,
                    		tbl_Stock_Journal_Dest_Details AS d,
                    		tbl_Stock_Journal_Gen_Info AS sjg
                    		LEFT JOIN tbl_Trip_Details td 
                    	    ON td.STJ_Id = sjg.STJ_Id
                    	WHERE
                    		sjg.Stock_Journal_date BETWEEN @fromDate AND @toDate
                    	    AND sjg.Stock_Journal_Bill_type <> 'PROCESSING'
                    		AND sjg.STJ_Id = s.STJ_Id 
                    		AND sjg.STJ_Id = d.STJ_Id 
                    		AND s.Sour_Goodown_Id = @fromGodown
                    		AND d.Dest_Goodown_Id = @toGodown
                    		AND td.STJ_Id IS NULL 
                    ), SOURCE AS (
                    	SELECT * 
                    	FROM tbl_Stock_Journal_Sour_Details
                    	WHERE STJ_Id IN (
                    		SELECT STJ_Id FROM SJ_IDs
                    	)
                    )
                    SELECT 
                    	DISTINCT s.SJD_Id,
                        s.STJ_Id,
                        s.Sour_Item_Id,
                        s.Sour_Goodown_Id,
                        s.Sour_Batch_Lot_No,
                        s.Sour_Qty,
                        s.Sour_Unit_Id,
                        s.Sour_Unit,
                        s.Sour_Rate,
                        s.Sour_Amt,
                    	d.Dest_Goodown_Id,
                    	p.Product_Name AS Sour_Item_Name,
                        g.Godown_Name AS Source_Godown_Name,
                        sjg.Stock_Journal_Bill_type,
                        sjg.Stock_Journal_Voucher_type,
                        sjg.Journal_no
                    FROM
                    	SOURCE AS s,
                    	tbl_Stock_Journal_Dest_Details AS d,
                    	tbl_Godown_Master AS g,
                    	tbl_Product_Master AS p,
                        tbl_Stock_Journal_Gen_Info AS sjg
                    WHERE
                    	s.STJ_Id = d.STJ_Id
                        AND s.STJ_Id = sjg.STJ_Id
                    	AND s.Sour_Item_Id = d.Dest_Item_Id
                    	AND p.Product_Id = s.Sour_Item_Id
                    	AND s.Sour_Goodown_Id = g.Godown_Id
                    ORDER BY s.STJ_Id`
                )


            const result = await request;


            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }

        } catch (e) {
            console.error('Error fetching journal list:', e);
            servError(e, res);
        }
    };

    const syncTallyStockJournal = async (req, res) => {
        try {
            const result = await SPCall({
                SPName: 'Stock_Journal_Sync',
            })

            if (result) {
                success(res, 'Sync Success')
            } else {
                failed(res, 'Failed to sync')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getDestinationItemsOfInwards = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const { sourceGodown = '', destinationGodown = '' } = req.query;

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('sourceGodown', sourceGodown)
                .input('destinationGodown', destinationGodown)
                .query(`
                    SELECT
                        g.Stock_Journal_date,
                        g.Journal_no,
                        d.Dest_Item_Id,
                        p.Product_Name AS destinationItemNameGet,
                        p.Pack_Id,
                        pck.Pack,
                        d.Dest_Goodown_Id,
                        dgd.Godown_Name AS destinationGodownGet,
                        s.Sour_Goodown_Id,
                        COALESCE(s.Sour_Qty, 0) AS Sour_Qty,
                        sgd.Godown_Name AS sourceGodownGet,
                        COALESCE(d.Dest_Qty, 0) AS Dest_Qty,
                        TRY_CAST(
                    		COALESCE(TRY_CAST(d.Dest_Qty AS DECIMAL(18,2)), 0) / 
                    		NULLIF(COALESCE(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0), 0) 
                    	 AS decimal(18, 2)) AS bagsQuantity
                    FROM tbl_Stock_Journal_Gen_Info AS g
                    LEFT JOIN tbl_Stock_Journal_Dest_Details AS d
                        ON d.STJ_Id = g.STJ_Id
                    LEFT JOIN tbl_Product_Master AS p
                        ON p.Product_Id = d.Dest_Item_Id
                    LEFT JOIN tbl_Pack_Master AS pck
                        ON pck.Pack_Id = p.Pack_Id
                    LEFT JOIN tbl_Godown_Master AS dgd
                        ON dgd.Godown_Id = d.Dest_Goodown_Id
                    LEFT JOIN tbl_Stock_Journal_Sour_Details AS s
                        ON g.STJ_Id = s.STJ_Id AND d.Dest_Item_Id = s.Sour_Item_Id
                    LEFT JOIN tbl_Godown_Master AS sgd
                        ON sgd.Godown_Id = s.Sour_Goodown_Id
                    WHERE g.Stock_Journal_Bill_type = 'MATERIAL INWARD'
                    AND g.Stock_Journal_date BETWEEN @Fromdate AND @Todate
                    ${sourceGodown ? ' AND s.Sour_Goodown_Id = @sourceGodown ' : ''}
                    ${destinationGodown ? ' AND d.Dest_Goodown_Id = @destinationGodown ' : ''}
                    ORDER BY g.Stock_Journal_date, g.Journal_no;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        createStockJournal,
        updateStockJournal,
        deleteJournalInfo,
        getJournalDetails,
        godownActivity,
        syncTallyStockJournal,
        getDestinationItemsOfInwards
    }
}

export default StockJournal();
