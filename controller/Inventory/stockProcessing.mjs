import sql from 'mssql';
import { servError, dataFound, noData, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, createPadString, isEqualNumber, ISOString, Subraction, toArray, toNumber } from '../../helper_functions.mjs';

const StockManagement = () => {

    const createStockProcessing = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Branch_Id = 0,
                VoucherType = '',
                BillType = 'PROCESSING',
                Machine_No = '',
                Godownlocation = 0,
                ST_Reading = 0,
                EN_Reading = 0,
                Total_Reading = Subraction(EN_Reading, ST_Reading),
                Narration = '',
                PR_Status = 'New',
                Created_By = 0,
            } = req.body;

            const Process_date = req.body?.Process_date ? ISOString(req.body.Process_date) : ISOString();
            const StartDateTime = req.body?.StartDateTime ? new Date(req.body.StartDateTime) : new Date();
            const EndDateTime = req.body?.EndDateTime ? new Date(req.body.EndDateTime) : new Date();

            if (!checkIsNumber(Branch_Id)) {
                return invalidInput(res, 'Select Branch');
            }

            if (!checkIsNumber(VoucherType)) {
                return invalidInput(res, 'Select Voucher')
            }

            if (StartDateTime && EndDateTime && (new Date(StartDateTime) > new Date(EndDateTime))) {
                return invalidInput(res, 'Start Time cannot be greater than End Time');
            }

            if (ST_Reading && EN_Reading && (Number(ST_Reading) > Number(EN_Reading))) {
                return invalidInput(res, 'Start Reading cannot be greater than End Reading');
            }

            const Source = Array.isArray(req.body.Source) ? req.body.Source : [];
            const StaffInvolve = Array.isArray(req.body.StaffInvolve) ? req.body.StaffInvolve : [];
            const Destination = Array.isArray(req.body.Destination) ? req.body.Destination : [];

            // unique id for processing

            const PR_Id = Number((await new sql.Request().query(`
                SELECT COALESCE(MAX(PR_Id), 0) AS MaxId
                FROM tbl_Processing_Gen_Info
            `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(PR_Id)) throw new Error('Failed to get PR_Id');

            // year and desc

            const getYearId = await new sql.Request()
                .input('Process_date', Process_date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @Process_date 
                        AND Fin_End_Date >= @Process_date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];

            // process on based on year and voucher

            const P_No = Number((await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('VoucherType', VoucherType)
                .query(`
                    SELECT COALESCE(MAX(P_No), 0) AS MaxId
                    FROM tbl_Processing_Gen_Info
                    WHERE Year_Id = @Year_Id
                    AND VoucherType = @VoucherType`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(P_No)) throw new Error('Failed to get P_No');

            // voucher code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', VoucherType)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            const PR_Inv_Id = Voucher_Code + '/' + createPadString(P_No, 6) + '/' + Year_Desc;

            // process no for godown and each date based

            const Process_no = Number((await new sql.Request()
                .input('Process_date', Process_date)
                .input('Godownlocation', Godownlocation)
                .query(`
                SELECT COALESCE(MAX(Process_no), 0) AS MaxId
                FROM tbl_Processing_Gen_Info
                WHERE 
                    Process_date = @Process_date
                    AND Godownlocation = @Godownlocation`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Process_no)) throw new Error('Failed to get Process_no');

            await transaction.begin();

            const OrderDetailsInsert = await new sql.Request(transaction)
                .input('PR_Id', toNumber(PR_Id))
                .input('PR_Inv_Id', PR_Inv_Id)
                .input('Year_Id', toNumber(Year_Id))
                .input('P_No', toNumber(P_No))
                .input('Process_no', toNumber(Process_no))
                .input('Branch_Id', toNumber(Branch_Id))
                .input('VoucherType', VoucherType)
                .input('BillType', BillType)
                .input('Process_date', Process_date)
                .input('Machine_No', Machine_No)
                .input('Godownlocation', toNumber(Godownlocation))
                .input('StartDateTime', StartDateTime)
                .input('EndDateTime', EndDateTime)
                .input('ST_Reading', toNumber(ST_Reading))
                .input('EN_Reading', toNumber(EN_Reading))
                .input('Total_Reading', toNumber(Total_Reading))
                .input('Narration', Narration)
                .input('PR_Status', PR_Status)
                .input('Created_By', Created_By)
                .input('Created_At', new Date())
                .query(`
                    INSERT INTO tbl_Processing_Gen_Info (
                        PR_Id, PR_Inv_Id, Year_Id, P_No, Process_no, Branch_Id,
                        VoucherType, BillType, Process_date, Machine_No, Godownlocation, 
                        StartDateTime, EndDateTime, ST_Reading, EN_Reading, Total_Reading, Narration,
                        PR_Status, Created_By, Created_At
                    ) VALUES (
                        @PR_Id, @PR_Inv_Id, @Year_Id, @P_No, @Process_no, @Branch_Id,
                        @VoucherType, @BillType, @Process_date, @Machine_No, @Godownlocation, 
                        @StartDateTime, @EndDateTime, @ST_Reading, @EN_Reading, @Total_Reading, @Narration,
                        @PR_Status, @Created_By, @Created_At
                    );
                `);

            if (OrderDetailsInsert.rowsAffected[0] == 0) {
                throw new Error('Failed to insert Journal details');
            }

            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)
                    .input('PR_Id', PR_Id)
                    .input('Sour_Item_Id', item.Sour_Item_Id)
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', item.Sour_Batch_Lot_No)
                    .input('Sour_Qty', Number(item.Sour_Qty) || null)
                    .input('Sour_Unit_Id', item.Sour_Unit_Id)
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate) || null)
                    .input('Sour_Amt', Number(item.Sour_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Source_Details (
                            PR_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, 
                            Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                        ) VALUES (
                            @PR_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, 
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
                    .input('PR_Id', PR_Id)
                    .input('Staff_Type_Id', Number(delivery.Staff_Type_Id) || null)
                    .input('Staff_Id', Number(delivery.Staff_Id) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Staff_Involved (
                            PR_Id, Staff_Type_Id, Staff_Id
                        ) VALUES (
                            @PR_Id, @Staff_Type_Id, @Staff_Id
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }

            for (let i = 0; i < Destination.length; i++) {
                const final = Destination[i];
                const result = await new sql.Request(transaction)
                    .input('PR_Id', PR_Id)
                    .input('Dest_Item_Id', Number(final.Dest_Item_Id) || null)
                    .input('Dest_Goodown_Id', Number(final.Dest_Goodown_Id) || null)
                    .input('Dest_Batch_Lot_No', final.Dest_Batch_Lot_No)
                    .input('Dest_Qty', Number(final.Dest_Qty) || null)
                    .input('Dest_Unit_Id', Number(final.Dest_Unit_Id) || null)
                    .input('Dest_Unit', final.Dest_Unit)
                    .input('Dest_Rate', Number(final.Dest_Rate) || null)
                    .input('Dest_Amt', Number(final.Dest_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Destin_Details (
                            PR_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, 
                            Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @PR_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, 
                            @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Destination details');
                }
            }

            await transaction.commit();

            return success(res, 'Stock Processing created successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const updateStockProcessing = async (req, res) => {
        const transaction = new sql.Transaction();

        try {

            const {
                PR_Id = 0,
                Branch_Id = 0,
                VoucherType = 0,
                BillType = 'PROCESSING',
                Machine_No = '',
                Godownlocation = 0,
                ST_Reading = 0,
                EN_Reading = 0,
                Total_Reading = '',
                Narration = '',
                PR_Status = 'New',
                Updated_By = 0
            } = req.body;

            const Process_date = req.body?.Process_date ? ISOString(req.body.Process_date) : ISOString();
            const StartDateTime = req.body?.StartDateTime ? new Date(req.body.StartDateTime) : new Date();
            const EndDateTime = req.body?.EndDateTime ? new Date(req.body.EndDateTime) : new Date();

            if (!checkIsNumber(Branch_Id) || !checkIsNumber(PR_Id)) {
                return invalidInput(res, 'Select Branch, PR_Id');
            }

            if (!checkIsNumber(VoucherType)) {
                return invalidInput(res, 'Select Voucher')
            }

            if (StartDateTime && EndDateTime && (new Date(StartDateTime) > new Date(EndDateTime))) {
                return invalidInput(res, 'Start Time cannot be greater than End Time');
            }

            if (ST_Reading && EN_Reading && (Number(ST_Reading) > Number(EN_Reading))) {
                return invalidInput(res, 'Start Reading cannot be greater than End Reading');
            }

            const Source = Array.isArray(req.body.Source) ? req.body.Source : [];
            const StaffInvolve = Array.isArray(req.body.StaffInvolve) ? req.body.StaffInvolve : [];
            const Destination = Array.isArray(req.body.Destination) ? req.body.Destination : [];

            await transaction.begin();

            const updateOrderDetails = await new sql.Request(transaction)
                .input('Branch_Id', Branch_Id)
                .input('VoucherType', VoucherType)
                .input('BillType', BillType)
                .input('Process_date', Process_date)
                .input('Machine_No', Machine_No)
                .input('Godownlocation', Godownlocation)
                .input('StartDateTime', StartDateTime)
                .input('EndDateTime', EndDateTime)
                .input('ST_Reading', ST_Reading)
                .input('EN_Reading', EN_Reading)
                .input('Total_Reading', Total_Reading)
                .input('Narration', Narration)
                .input('PR_Status', PR_Status)
                .input('Updated_By', Updated_By)
                .input('Updated_At', new Date())
                .input('PR_Id', PR_Id)
                .query(`
                    UPDATE tbl_Processing_Gen_Info
                    SET 
                        Branch_Id = @Branch_Id,
                        VoucherType = @VoucherType,
                        BillType = @BillType,
                        Process_date = @Process_date,
                        Machine_No = @Machine_No,
                        Godownlocation = @Godownlocation,
                        StartDateTime = @StartDateTime,
                        EndDateTime = @EndDateTime,
                        ST_Reading = @ST_Reading,
                        EN_Reading = @EN_Reading,
                        Total_Reading = @Total_Reading,
                        Narration = @Narration,
                        PR_Status = @PR_Status,
                        Updated_By = @Updated_By,
                        Updated_At = @Updated_At
                    WHERE PR_Id = @PR_Id;`
                );

            if (updateOrderDetails.rowsAffected[0] === 0) {
                throw new Error('Failed to update General Info');
            }

            await new sql.Request(transaction)
                .input('PR_Id', PR_Id)
                .query(`
                    DELETE FROM tbl_Processing_Staff_Involved WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Source_Details WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Destin_Details WHERE PR_Id = @PR_Id;`
                );


            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)
                    .input('PR_Id', PR_Id)
                    .input('Sour_Item_Id', item.Sour_Item_Id)
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', item.Sour_Batch_Lot_No)
                    .input('Sour_Qty', Number(item.Sour_Qty) || null)
                    .input('Sour_Unit_Id', item.Sour_Unit_Id)
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate) || null)
                    .input('Sour_Amt', Number(item.Sour_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Source_Details (
                            PR_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, 
                            Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                        ) VALUES (
                            @PR_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, 
                            @Sour_Unit_Id, @Sour_Unit, @Sour_Rate, @Sour_Amt
                        );`
                    );

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Source details');
                }
            }

            for (let i = 0; i < StaffInvolve.length; i++) {
                const delivery = StaffInvolve[i];
                const result = await new sql.Request(transaction)
                    .input('PR_Id', PR_Id)
                    .input('Staff_Type_Id', Number(delivery.Staff_Type_Id) || null)
                    .input('Staff_Id', Number(delivery.Staff_Id) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Staff_Involved (
                            PR_Id, Staff_Type_Id, Staff_Id
                        ) VALUES (
                            @PR_Id, @Staff_Type_Id, @Staff_Id
                        );`
                    );

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }

            for (let i = 0; i < Destination.length; i++) {
                const final = Destination[i];
                const result = await new sql.Request(transaction)
                    .input('PR_Id', PR_Id)
                    .input('Dest_Item_Id', Number(final.Dest_Item_Id) || null)
                    .input('Dest_Goodown_Id', Number(final.Dest_Goodown_Id) || null)
                    .input('Dest_Batch_Lot_No', final.Dest_Batch_Lot_No)
                    .input('Dest_Qty', Number(final.Dest_Qty) || null)
                    .input('Dest_Unit_Id', Number(final.Dest_Unit_Id) || null)
                    .input('Dest_Unit', final.Dest_Unit)
                    .input('Dest_Rate', Number(final.Dest_Rate) || null)
                    .input('Dest_Amt', Number(final.Dest_Amt) || null)
                    .query(`
                        INSERT INTO tbl_Processing_Destin_Details (
                            PR_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, 
                            Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @PR_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, 
                            @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );`
                    );

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Destination details');
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

    const deleteStockProcessing = async (req, res) => {
        try {

            const { PR_Id } = req.body;
            if (!checkIsNumber(PR_Id)) return invalidInput(res, 'PR_Id is required');

            const request = new sql.Request()
                .input('PR_Id', PR_Id)
                .query(`
                    DELETE FROM tbl_Processing_Gen_Info WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Source_Details WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Destin_Details WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Staff_Involved WHERE PR_Id = @PR_Id;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) throw new Error('Failed to delete');

            return success(res, 'Processing Deleted!')

        } catch (e) {
            servError(e, res);
        }
    }

    const getProcessingDetails = async (req, res) => {
        try {
            const Fromdate = req.body?.Fromdate ? ISOString(req.body.Fromdate) : ISOString();
            const Todate = req.body?.Todate ? ISOString(req.body.Todate) : ISOString();
            const { filterItems = [] } = req.body;

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('filterItems', toArray(filterItems).map(item => toNumber(item)).join(', '))
                .query(`
                    DECLARE @itemFilterTable TABLE (itemId INT);
                    -- inserting items
                    INSERT INTO @itemFilterTable (itemId)
                    SELECT TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL;
                    -- other final filters
                    DECLARE @processingFilters TABLE (PR_Id INT);
                    -- inserting final filter data
                    INSERT INTO @processingFilters (PR_Id)
                    SELECT pgi.PR_Id
                    FROM tbl_Processing_Gen_Info AS pgi
                    LEFT JOIN tbl_Processing_Source_Details AS s
                    ON s.PR_Id = pgi.PR_Id
                    LEFT JOIN tbl_Processing_Destin_Details AS d
                    ON d.PR_Id = pgi.PR_Id
                    WHERE 
                    	pgi.Process_date BETWEEN @Fromdate AND @Todate
                    	${toArray(filterItems).length > 0 ? `
                        AND (
                    		s.Sour_Item_Id IN (SELECT DISTINCT itemId FROM @itemFilterTable)
                    		OR d.Dest_Item_Id IN (SELECT DISTINCT itemId FROM @itemFilterTable)
                    	) ` : ''}
                    -- processing general info
                    SELECT 
                    	pgi.*,
                    	br.BranchName,
                    	v.Voucher_Type AS VoucherTypeGet,
                    	g.Godown_Name AS GodownNameGet
                    FROM tbl_Processing_Gen_Info AS pgi
                    LEFT JOIN tbl_Branch_Master AS br
                        ON br.BranchId = pgi.Branch_Id
                    LEFT JOIN tbl_Voucher_Type AS v
                        ON v.Vocher_Type_Id = pgi.VoucherType
                    LEFT JOIN tbl_Godown_Master AS g
                        ON g.Godown_Id = pgi.Godownlocation
                    WHERE pgi.PR_Id IN (SELECT DISTINCT PR_Id FROM @processingFilters)
                    ORDER BY pgi.Process_date DESC;
                    -- source details
                    SELECT s.*,
                        p.Product_Name,
                        g.Godown_Name
                    FROM tbl_Processing_Source_Details AS s
                    LEFT JOIN tbl_Product_Master AS p
                        ON s.Sour_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                        ON s.Sour_Goodown_Id = g.Godown_Id
                    WHERE s.PR_Id IN (SELECT DISTINCT PR_Id FROM @processingFilters);
                    -- destination details
                    SELECT d.*,
                        p.Product_Name,
                        g.Godown_Name
                    FROM tbl_Processing_Destin_Details AS d
                    LEFT JOIN tbl_Product_Master AS p
                        ON d.Dest_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                        ON d.Dest_Goodown_Id = g.Godown_Id
                    WHERE d.PR_Id IN (SELECT DISTINCT PR_Id FROM @processingFilters);
                    -- staff details
                    SELECT st.*,
                        cc.Cost_Center_Name AS EmpNameGet,
                        cct.Cost_Category AS EmpTypeGet
                    FROM tbl_Processing_Staff_Involved AS st
                    LEFT JOIN tbl_ERP_Cost_Center AS cc
                        ON cc.Cost_Center_Id = st.Staff_Id
                    LEFT JOIN tbl_ERP_Cost_Category as cct
                        ON cct.Cost_Category_Id = st.Staff_Type_Id
                    WHERE st.PR_Id IN (SELECT DISTINCT PR_Id FROM @processingFilters);
                `);

            const result = await request;

            const generalInfo = toArray(result.recordsets[0]);
            const sourceInfo = toArray(result.recordsets[1]);
            const destinationInfo = toArray(result.recordsets[2]);
            const staffInfo = toArray(result.recordsets[3]);

            if (result.recordsets[0].length > 0) {

                const extractedData = generalInfo.map(o => ({
                    ...o,
                    SourceDetails: sourceInfo.filter(
                        fil => isEqualNumber(fil.PR_Id, o.PR_Id)
                    ),
                    DestinationDetails: destinationInfo.filter(
                        fil => isEqualNumber(fil.PR_Id, o.PR_Id)
                    ),
                    StaffsDetails: staffInfo.filter(
                        fil => isEqualNumber(fil.PR_Id, o.PR_Id)
                    )
                }));

                dataFound(res, extractedData);

            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const getItemsUsedInProcessing = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    DECLARE @itemFilterTable TABLE (itemId INT);
                    -- inserting source items
                    INSERT INTO @itemFilterTable (itemId)
                    SELECT DISTINCT Sour_Item_Id
                    FROM tbl_Processing_Source_Details;
                    -- inserting destination items
                    INSERT INTO @itemFilterTable (itemId)
                    SELECT DISTINCT Dest_Item_Id
                    FROM tbl_Processing_Destin_Details;
                    -- value, label
                    SELECT Product_Id AS value, Product_Name AS label
                    FROM tbl_Product_Master 
                    WHERE Product_Id IN (SELECT DISTINCT itemId FROM @itemFilterTable)
                    ORDER BY Product_Name;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    }

    return {
        createStockProcessing,
        updateStockProcessing,
        deleteStockProcessing,
        getProcessingDetails,
        getItemsUsedInProcessing,
    }
}

export default StockManagement();
