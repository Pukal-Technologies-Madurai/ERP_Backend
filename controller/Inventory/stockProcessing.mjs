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

            const Source = toArray(req.body?.Source).map(item => ({
                ...item,
                Sour_Item_Id: toNumber(item?.Sour_Item_Id),
                Sour_Goodown_Id: toNumber(item?.Sour_Goodown_Id),
                Sour_Qty: toNumber(item?.Sour_Qty),
                Sour_Unit_Id: toNumber(item?.Sour_Unit_Id),
                Sour_Rate: toNumber(item?.Sour_Rate),
                Sour_Amt: toNumber(item?.Sour_Amt)
            }));

            const Destination = toArray(req.body?.Destination).map(item => ({
                ...item,
                Dest_Item_Id: toNumber(item?.Dest_Item_Id),
                Dest_Goodown_Id: toNumber(item?.Dest_Goodown_Id),
                Dest_Qty: toNumber(item?.Dest_Qty),
                Dest_Unit_Id: toNumber(item?.Dest_Unit_Id),
                Dest_Rate: toNumber(item?.Dest_Rate),
                Dest_Amt: toNumber(item?.Dest_Amt)
            }));

            const StaffInvolve = toArray(req.body.StaffInvolve).map(item => ({
                ...item,
                Staff_Type_Id: toNumber(item?.Staff_Type_Id),
                Staff_Id: toNumber(item?.Staff_Id)
            }));

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
                throw new Error('Failed to insert Processing details');
            }

            await new sql.Request(transaction)
                .input('PR_Id', sql.BigInt, PR_Id)
                .input('createdBy', Created_By)
                .input('trans_date', Process_date)
                .input('payload', sql.NVarChar(sql.MAX), JSON.stringify({
                    Source,
                    Destination,
                    StaffInvolve
                }))
                .query(`
                    DECLARE @SourceOut TABLE (
                        PRS_Id BIGINT,
                        Sour_Item_Id BIGINT,
                        Sour_Goodown_Id BIGINT,
                        Sour_Batch_Lot_No NVARCHAR(200),
                        Quantity DECIMAL(18,2),
                        Batch_Id UNIQUEIDENTIFIER NULL
                    );
                    DECLARE @DestOut TABLE (
                        PRD_Id BIGINT,
                        Dest_Item_Id BIGINT,
                        Dest_Goodown_Id BIGINT,
                        Dest_Batch_Lot_No NVARCHAR(200),
                        Quantity DECIMAL(18,2),
                        Rate DECIMAL(18,2)
                    );
                    /* ===================== Source ===================== */
                    INSERT INTO tbl_Processing_Source_Details (
                        PR_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty,
                        Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                    )
                    OUTPUT
                        inserted.PRS_Id,
                        inserted.Sour_Item_Id,
                        inserted.Sour_Goodown_Id,
                        inserted.Sour_Batch_Lot_No,
                        inserted.Sour_Qty
                    INTO @SourceOut (PRS_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Quantity)
                    SELECT
                        @PR_Id,
                        j.Sour_Item_Id,
                        j.Sour_Goodown_Id,
                        j.Sour_Batch_Lot_No,
                        j.Sour_Qty,
                        j.Sour_Unit_Id,
                        j.Sour_Unit,
                        j.Sour_Rate,
                        j.Sour_Amt
                    FROM OPENJSON(@payload, '$.Source')
                    WITH (
                        Sour_Item_Id       BIGINT             '$.Sour_Item_Id',
                        Sour_Goodown_Id    BIGINT             '$.Sour_Goodown_Id',
                        Sour_Batch_Lot_No  NVARCHAR(200)      '$.Sour_Batch_Lot_No',
                        Sour_Qty           DECIMAL(18,2)      '$.Sour_Qty',
                        Sour_Unit_Id       BIGINT             '$.Sour_Unit_Id',
                        Sour_Unit          NVARCHAR(50)       '$.Sour_Unit',
                        Sour_Rate          DECIMAL(18,2)      '$.Sour_Rate',
                        Sour_Amt           DECIMAL(18,2)      '$.Sour_Amt'
                    ) AS j;
                    /* Fill Source Batch_Id by joining Batch_Master */
                    UPDATE s
                    SET s.Batch_Id = bm.id
                    FROM @SourceOut s
                    JOIN tbl_Batch_Master bm ON bm.batch = s.Sour_Batch_Lot_No AND bm.item_id = s.Sour_Item_Id AND bm.godown_id = s.Sour_Goodown_Id;
                    /* =================== Source batch consumption =================== */
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, 
                        quantity, type, reference_id, created_by
                    )
                    SELECT 
                        s.Batch_Id, s.Sour_Batch_Lot_No, @trans_date, s.Sour_Item_Id, s.Sour_Goodown_Id, 
                        s.Quantity, 'CONSUMPTION', s.PRS_Id, @createdBy
                    FROM @SourceOut s
                    WHERE s.Batch_Id IS NOT NULL;
                    /* ====================================== */
                    /* =================== Destination =================== */
                    /* ====================================== */
                    INSERT INTO tbl_Processing_Destin_Details (
                        PR_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty,
                        Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                    )
                    OUTPUT
                        inserted.PRD_Id,
                        inserted.Dest_Item_Id,
                        inserted.Dest_Goodown_Id,
                        inserted.Dest_Batch_Lot_No,
                        inserted.Dest_Qty,
                        inserted.Dest_Rate
                    INTO @DestOut (PRD_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Quantity, Rate)
                    SELECT
                        @PR_Id,
                        j.Dest_Item_Id,
                        j.Dest_Goodown_Id,
                        j.Dest_Batch_Lot_No,
                        j.Dest_Qty,
                        j.Dest_Unit_Id,
                        j.Dest_Unit,
                        j.Dest_Rate,
                        j.Dest_Amt
                    FROM OPENJSON(@payload, '$.Destination')
                    WITH (
                        Dest_Item_Id       BIGINT             '$.Dest_Item_Id',
                        Dest_Goodown_Id    BIGINT             '$.Dest_Goodown_Id',
                        Dest_Batch_Lot_No  NVARCHAR(200)      '$.Dest_Batch_Lot_No',
                        Dest_Qty           DECIMAL(18,2)      '$.Dest_Qty',
                        Dest_Unit_Id       BIGINT             '$.Dest_Unit_Id',
                        Dest_Unit          NVARCHAR(50)       '$.Dest_Unit',
                        Dest_Rate          DECIMAL(18,2)      '$.Dest_Rate',
                        Dest_Amt           DECIMAL(18,2)      '$.Dest_Amt'
                    ) AS j;
                    /* ==================== Destination Batch production (upsert) ==================== */
                    MERGE tbl_Batch_Master AS target
                    USING @DestOut AS d
                    ON  target.batch    = d.Dest_Batch_Lot_No
                    AND target.item_id  = d.Dest_Item_Id
                    AND target.godown_id= d.Dest_Goodown_Id
                    WHEN MATCHED THEN
                        UPDATE SET 
                            target.quantity = target.quantity + d.Quantity,
                            --target.rate     = d.Rate,                -- adjust if you want to keep existing
                            --target.trans_date = @trans_date
                    WHEN NOT MATCHED THEN
                        INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                        VALUES (NEWID(), d.Dest_Batch_Lot_No, d.Dest_Item_Id, d.Dest_Goodown_Id, @trans_date, d.Quantity, d.Rate, @createdBy);
                    /* ====================================== */
                    /* =================== Staff involved =================== */
                    /* ====================================== */
                    INSERT INTO tbl_Processing_Staff_Involved (PR_Id, Staff_Type_Id, Staff_Id)
                    SELECT
                        @PR_Id,
                        Staff_Type_Id,
                        Staff_Id
                    FROM OPENJSON(@payload, '$.StaffInvolve')
                    WITH (
                        Staff_Type_Id  BIGINT '$.Staff_Type_Id',
                        Staff_Id       BIGINT '$.Staff_Id'
                    );`
                );

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

            const Source = toArray(req.body?.Source).map(item => ({
                ...item,
                Sour_Item_Id: toNumber(item?.Sour_Item_Id),
                Sour_Goodown_Id: toNumber(item?.Sour_Goodown_Id),
                Sour_Qty: toNumber(item?.Sour_Qty),
                Sour_Unit_Id: toNumber(item?.Sour_Unit_Id),
                Sour_Rate: toNumber(item?.Sour_Rate),
                Sour_Amt: toNumber(item?.Sour_Amt)
            }));

            const Destination = toArray(req.body?.Destination).map(item => ({
                ...item,
                Dest_Item_Id: toNumber(item?.Dest_Item_Id),
                Dest_Goodown_Id: toNumber(item?.Dest_Goodown_Id),
                Dest_Qty: toNumber(item?.Dest_Qty),
                Dest_Unit_Id: toNumber(item?.Dest_Unit_Id),
                Dest_Rate: toNumber(item?.Dest_Rate),
                Dest_Amt: toNumber(item?.Dest_Amt)
            }));

            const StaffInvolve = toArray(req.body.StaffInvolve).map(item => ({
                ...item,
                Staff_Type_Id: toNumber(item?.Staff_Type_Id),
                Staff_Id: toNumber(item?.Staff_Id)
            }));

            await transaction.begin();

            const updateOrderDetails = await new sql.Request(transaction)
                .input('Branch_Id', toNumber(Branch_Id))
                .input('VoucherType', toNumber(VoucherType))
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
                .input('Updated_By', toNumber(Updated_By))
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
                .input('PR_Id', sql.BigInt, PR_Id)
                .input('createdBy', Updated_By)
                .input('trans_date', Process_date)
                .input('payload', sql.NVarChar(sql.MAX), JSON.stringify({
                    Source,
                    Destination,
                    StaffInvolve
                }))
                .query(`
                    -- removing previous quantity in batch
                    DECLARE @OldSource TABLE (
                        PRS_Id BIGINT,
                        Item_Id BIGINT,
                        Godown_Id BIGINT,
                        Batch NVARCHAR(200),
                        Qty DECIMAL(18,2),
                        Batch_Id UNIQUEIDENTIFIER NULL
                    );
                    INSERT @OldSource (PRS_Id, Item_Id, Godown_Id, Batch, Qty, Batch_Id)
                    SELECT  s.PRS_Id,
                            s.Sour_Item_Id,
                            s.Sour_Goodown_Id,
                            s.Sour_Batch_Lot_No,
                            s.Sour_Qty,
                            bm.id
                    FROM tbl_Processing_Source_Details s
                    LEFT JOIN tbl_Batch_Master bm
                    ON bm.batch = s.Sour_Batch_Lot_No AND bm.item_id = s.Sour_Item_Id AND bm.godown_id = s.Sour_Goodown_Id
                    WHERE s.PR_Id = @PR_Id;
                    DECLARE @OldDest TABLE (
                        PRD_Id BIGINT,
                        Item_Id BIGINT,
                        Godown_Id BIGINT,
                        Batch NVARCHAR(200),
                        Qty DECIMAL(18,2),
                        Rate DECIMAL(18,2),
                        Batch_Id UNIQUEIDENTIFIER NULL
                    );
                    INSERT @OldDest (PRD_Id, Item_Id, Godown_Id, Batch, Qty, Rate, Batch_Id)
                    SELECT  d.PRD_Id,
                            d.Dest_Item_Id,
                            d.Dest_Goodown_Id,
                            d.Dest_Batch_Lot_No,
                            d.Dest_Qty,
                            d.Dest_Rate,
                            bm.id
                    FROM tbl_Processing_Destin_Details d
                    LEFT JOIN tbl_Batch_Master bm
                    ON bm.batch = d.Dest_Batch_Lot_No
                    AND bm.item_id = d.Dest_Item_Id
                    AND bm.godown_id = d.Dest_Goodown_Id
                    WHERE d.PR_Id = @PR_Id;
                    /* ===================== negative quantity inserting ================== */
                    -- If you historically wrote a CONSUMPTION row with +Qty, the negative here cancels it out.
                    INSERT INTO tbl_Batch_Transaction
                        (batch_id, batch, trans_date, item_id, godown_id, quantity, type, reference_id, created_by)
                    SELECT
                        os.Batch_Id, os.Batch, @trans_date, os.Item_Id, os.Godown_Id,
                        -os.Qty, 'REVERSAL_CONSUMPTION', os.PRS_Id, @createdBy
                    FROM @OldSource os
                    WHERE os.Batch_Id IS NOT NULL;
                    /* ===================== destination removal ================== */
                    INSERT INTO tbl_Batch_Transaction
                        (batch_id, batch, trans_date, item_id, godown_id, quantity, type, reference_id, created_by)
                    SELECT
                        od.Batch_Id, od.Batch, @trans_date, od.Item_Id, od.Godown_Id,
                        -od.Qty, 'REVERSAL_PRODUCTION', od.PRD_Id, @createdBy
                    FROM @OldDest od
                    WHERE od.Batch_Id IS NOT NULL;
                    /* ===================== Deleting Previous Data ===================== */
                    DELETE FROM tbl_Processing_Staff_Involved WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Source_Details WHERE PR_Id = @PR_Id;
                    DELETE FROM tbl_Processing_Destin_Details WHERE PR_Id = @PR_Id;
                    /* ====================================== */
                    /* ===================== New Values ===================== */   
                    /* ====================================== */ 
                    DECLARE @SourceOut TABLE (
                        PRS_Id BIGINT,
                        Sour_Item_Id BIGINT,
                        Sour_Goodown_Id BIGINT,
                        Sour_Batch_Lot_No NVARCHAR(200),
                        Quantity DECIMAL(18,2),
                        Batch_Id UNIQUEIDENTIFIER NULL
                    );
                    DECLARE @DestOut TABLE (
                        PRD_Id BIGINT,
                        Dest_Item_Id BIGINT,
                        Dest_Goodown_Id BIGINT,
                        Dest_Batch_Lot_No NVARCHAR(200),
                        Quantity DECIMAL(18,2),
                        Rate DECIMAL(18,2)
                    );
                    /* ===================== Source ===================== */
                    INSERT INTO tbl_Processing_Source_Details (
                        PR_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty,
                        Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                    )
                    OUTPUT
                        inserted.PRS_Id,
                        inserted.Sour_Item_Id,
                        inserted.Sour_Goodown_Id,
                        inserted.Sour_Batch_Lot_No,
                        inserted.Sour_Qty
                    INTO @SourceOut (PRS_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Quantity)
                    SELECT
                        @PR_Id,
                        j.Sour_Item_Id,
                        j.Sour_Goodown_Id,
                        j.Sour_Batch_Lot_No,
                        j.Sour_Qty,
                        j.Sour_Unit_Id,
                        j.Sour_Unit,
                        j.Sour_Rate,
                        j.Sour_Amt
                    FROM OPENJSON(@payload, '$.Source')
                    WITH (
                        Sour_Item_Id       BIGINT             '$.Sour_Item_Id',
                        Sour_Goodown_Id    BIGINT             '$.Sour_Goodown_Id',
                        Sour_Batch_Lot_No  NVARCHAR(200)      '$.Sour_Batch_Lot_No',
                        Sour_Qty           DECIMAL(18,2)      '$.Sour_Qty',
                        Sour_Unit_Id       BIGINT             '$.Sour_Unit_Id',
                        Sour_Unit          NVARCHAR(50)       '$.Sour_Unit',
                        Sour_Rate          DECIMAL(18,2)      '$.Sour_Rate',
                        Sour_Amt           DECIMAL(18,2)      '$.Sour_Amt'
                    ) AS j;
                    /* Fill Source Batch_Id by joining Batch_Master */
                    UPDATE s
                    SET s.Batch_Id = bm.id
                    FROM @SourceOut s
                    JOIN tbl_Batch_Master bm ON bm.batch = s.Sour_Batch_Lot_No AND bm.item_id = s.Sour_Item_Id AND bm.godown_id = s.Sour_Goodown_Id;
                    /* =================== Source batch consumption =================== */
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, 
                        quantity, type, reference_id, created_by
                    )
                    SELECT 
                        s.Batch_Id, s.Sour_Batch_Lot_No, @trans_date, s.Sour_Item_Id, s.Sour_Goodown_Id, 
                        s.Quantity, 'CONSUMPTION', s.PRS_Id, @createdBy
                    FROM @SourceOut s
                    WHERE s.Batch_Id IS NOT NULL;
                    /* ====================================== */
                    /* =================== Destination =================== */
                    /* ====================================== */
                    INSERT INTO tbl_Processing_Destin_Details (
                        PR_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty,
                        Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                    )
                    OUTPUT
                        inserted.PRD_Id,
                        inserted.Dest_Item_Id,
                        inserted.Dest_Goodown_Id,
                        inserted.Dest_Batch_Lot_No,
                        inserted.Dest_Qty,
                        inserted.Dest_Rate
                    INTO @DestOut (PRD_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Quantity, Rate)
                    SELECT
                        @PR_Id,
                        j.Dest_Item_Id,
                        j.Dest_Goodown_Id,
                        j.Dest_Batch_Lot_No,
                        j.Dest_Qty,
                        j.Dest_Unit_Id,
                        j.Dest_Unit,
                        j.Dest_Rate,
                        j.Dest_Amt
                    FROM OPENJSON(@payload, '$.Destination')
                    WITH (
                        Dest_Item_Id       BIGINT             '$.Dest_Item_Id',
                        Dest_Goodown_Id    BIGINT             '$.Dest_Goodown_Id',
                        Dest_Batch_Lot_No  NVARCHAR(200)      '$.Dest_Batch_Lot_No',
                        Dest_Qty           DECIMAL(18,2)      '$.Dest_Qty',
                        Dest_Unit_Id       BIGINT             '$.Dest_Unit_Id',
                        Dest_Unit          NVARCHAR(50)       '$.Dest_Unit',
                        Dest_Rate          DECIMAL(18,2)      '$.Dest_Rate',
                        Dest_Amt           DECIMAL(18,2)      '$.Dest_Amt'
                    ) AS j;
                    /* ==================== Destination Batch production (upsert) ==================== */
                    MERGE tbl_Batch_Master AS target
                    USING @DestOut AS d
                    ON  target.batch    = d.Dest_Batch_Lot_No
                    AND target.item_id  = d.Dest_Item_Id
                    AND target.godown_id= d.Dest_Goodown_Id
                    WHEN MATCHED THEN
                        UPDATE SET 
                            target.quantity = target.quantity + d.Quantity,
                            --target.rate = d.Rate,
                            --target.trans_date = @trans_date
                    WHEN NOT MATCHED THEN
                        INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                        VALUES (NEWID(), d.Dest_Batch_Lot_No, d.Dest_Item_Id, d.Dest_Goodown_Id, @trans_date, d.Quantity, d.Rate, @createdBy);
                    /* ====================================== */
                    /* =================== Staff involved =================== */
                    /* ====================================== */
                    INSERT INTO tbl_Processing_Staff_Involved (PR_Id, Staff_Type_Id, Staff_Id)
                    SELECT
                        @PR_Id,
                        Staff_Type_Id,
                        Staff_Id
                    FROM OPENJSON(@payload, '$.StaffInvolve')
                    WITH (
                        Staff_Type_Id  BIGINT '$.Staff_Type_Id',
                        Staff_Id       BIGINT '$.Staff_Id'
                    );`
                );

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
