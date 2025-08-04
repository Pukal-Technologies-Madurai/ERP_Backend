import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, getDaysBetween, ISOString, stringCompare, toNumber } from '../../helper_functions.mjs';


const getUnAssignedBatchFromMaterialInward = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
                SELECT 
                	--TOP (200)
                	ar.Arr_Id AS uniquId,
                	tm.Trip_Id AS moduleId,
                	tm.Trip_Date AS eventDate,
                    tm.TR_INV_ID AS voucherNumber,
                	ar.Product_Id AS productId,
                	p.Product_Name AS productNameGet,
                    tg.Godown_Id AS godownId, 
                	fg.Godown_Name AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(ar.QTY, 0) AS quantity,
                	COALESCE(ar.Gst_Rate, 0) AS rate,
                	COALESCE(ar.Total_Value, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	ar.CreatedAt AS createdAt,
                	'MATERIAL_INWARD' AS moduleName
                FROM tbl_Trip_Arrival AS ar
                LEFT JOIN tbl_Product_Master AS p ON ar.Product_Id = p.Product_Id
                LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ar.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ar.To_Location
                LEFT JOIN tbl_Users AS cb ON cb.UserId = ar.Created_By
                JOIN tbl_Trip_Details AS td ON td.Arrival_Id = ar.Arr_Id
                JOIN tbl_Trip_Master AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE 
                	TRIM(COALESCE(ar.Batch_No, '')) = ''
                	AND CONVERT(DATE, tm.Trip_Date) BETWEEN @Fromdate AND @Todate
                	AND tm.billType = 'MATERIAL INWARD'
                ORDER BY tm.Trip_Date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const getUnAssignedBatchProcessing = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
                SELECT 
                	TOP (200)
                	prd.PRD_Id AS uniquId,
                	pr.PR_Id AS moduleId,
                	pr.Process_date AS eventDate,
                    pr.PR_Inv_Id AS voucherNumber,
                	prd.Dest_Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    prd.Dest_Goodown_Id AS godownId, 
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(prd.Dest_Qty, 0) AS quantity,
                	COALESCE(prd.Dest_Rate, 0) AS rate,
                	COALESCE(prd.Dest_Amt, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	pr.Created_At AS createdAt,
                	'PROCESSING' AS moduleName
                FROM tbl_Processing_Destin_Details AS prd
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = prd.Dest_Item_Id
                --LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = prd.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = prd.Dest_Goodown_Id
                JOIN tbl_Processing_Gen_Info AS pr ON pr.PR_Id = prd.PR_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = pr.Created_By
                WHERE 
                	TRIM(COALESCE(prd.Dest_Batch_Lot_No, '')) = ''
                	AND pr.Process_date BETWEEN @Fromdate AND @Todate
                ORDER BY pr.Process_date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const postBatchInMaterialInward = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;
        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        const request = new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .query(`
            -- Parse JSON to temp table
                CREATE TABLE #Parsed (
                    batch NVARCHAR(50),
                    item_id BIGINT,
                    godown_id BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    created_by NVARCHAR(100),
                    uniquId BIGINT
                );
                INSERT INTO #Parsed (batch, item_id, godown_id, quantity, rate, created_by, uniquId)
                SELECT * FROM OPENJSON(@jsonData)
                WITH (
                    batch NVARCHAR(50),
                    productId BIGINT,
                    godownId BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    created_by NVARCHAR(100),
                    uniquId BIGINT
                );
            -- Validate parsed rows
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
            -- Merge to Batch Master
                MERGE tbl_Batch_Master AS target
                USING #Parsed AS source
                ON target.batch = source.batch
                    AND target.item_id = source.item_id
                    AND target.godown_id = source.godown_id
                WHEN MATCHED THEN
                    UPDATE SET target.quantity = target.quantity + source.quantity
                WHEN NOT MATCHED THEN
                    INSERT (batch, item_id, godown_id, quantity, rate, created_by)
                    VALUES (source.batch, source.item_id, source.godown_id, source.quantity, source.rate, @createdBy);
            -- Update Trip Arrival
                UPDATE t
                SET t.Batch_No = p.batch
                FROM tbl_Trip_Arrival t
                JOIN #Parsed p ON t.Arr_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        await request;

        await transaction.commit();
        success(res, 'Batch and Trip Arrival updated successfully');

    } catch (err) {
        if (transaction._aborted !== true) await transaction.rollback();
        servError(err, res);
    }
};

const postBatchInProcessing = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const { itemBatch = [], createdBy = '' } = req.body;
        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        const request = new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .query(`
            -- Parse JSON to temp table
                CREATE TABLE #Parsed (
                    batch NVARCHAR(50),
                    item_id BIGINT,
                    godown_id BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    created_by NVARCHAR(100),
                    uniquId BIGINT
                );
                INSERT INTO #Parsed (batch, item_id, godown_id, quantity, rate, created_by, uniquId)
                SELECT * FROM OPENJSON(@jsonData)
                WITH (
                    batch NVARCHAR(50),
                    productId BIGINT,
                    godownId BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    created_by NVARCHAR(100),
                    uniquId BIGINT
                );
            -- Validate parsed rows
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
            -- Merge to Batch Master
                MERGE tbl_Batch_Master AS target
                USING #Parsed AS source
                ON target.batch = source.batch
                    AND target.item_id = source.item_id
                    AND target.godown_id = source.godown_id
                WHEN MATCHED THEN
                    UPDATE SET target.quantity = target.quantity + source.quantity
                WHEN NOT MATCHED THEN
                    INSERT (batch, item_id, godown_id, quantity, rate, created_by)
                    VALUES (source.batch, source.item_id, source.godown_id, source.quantity, source.rate, @createdBy);
            -- Update Trip Arrival
                UPDATE pr
                SET pr.Dest_Batch_Lot_No = p.batch
                FROM tbl_Processing_Destin_Details pr
                JOIN #Parsed p ON pr.PRD_Id = p.uniquId;
                DROP TABLE #Parsed;`
            );

        await request;

        await transaction.commit();
        success(res, 'Batch and Processing updated successfully');

    } catch (err) {
        if (transaction._aborted !== true) await transaction.rollback();
        servError(err, res);
    }
}

const getUnAssignedBatchFromGodownTransfer = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
                SELECT 
                	TOP (200)
                	ar.Arr_Id AS uniquId,
                	tm.Trip_Id AS moduleId,
                	tm.Trip_Date AS eventDate,
                    tm.TR_INV_ID AS voucherNumber,
                	ar.Product_Id AS productId,
                	p.Product_Name AS productNameGet,
                    fg.Godown_Id AS fromGodownId, 
                    tg.Godown_Id AS godownId, 
                	fg.Godown_Name AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(ar.QTY, 0) AS quantity,
                	COALESCE(ar.Gst_Rate, 0) AS rate,
                	COALESCE(ar.Total_Value, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	ar.CreatedAt AS createdAt,
                	'OTHER_GODOWN' AS moduleName
                FROM tbl_Trip_Arrival AS ar
                LEFT JOIN tbl_Product_Master AS p ON ar.Product_Id = p.Product_Id
                LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ar.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ar.To_Location
                LEFT JOIN tbl_Users AS cb ON cb.UserId = ar.Created_By
                JOIN tbl_Trip_Details AS td ON td.Arrival_Id = ar.Arr_Id
                JOIN tbl_Trip_Master AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE 
                	TRIM(COALESCE(ar.Batch_No, '')) = ''
                	AND CONVERT(DATE, tm.Trip_Date) BETWEEN @Fromdate AND @Todate
                	AND tm.billType = 'OTHER GODOWN'
                ORDER BY tm.Trip_Date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const postOtherGodownTransfer = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy))
            return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);
        await transaction.begin();

        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .input('trans_date', sql.Date, trans_date)
            .query(`
            -- Parse input JSON into temp table
                CREATE TABLE #Parsed (
                    batch_id NVARCHAR(150),
                    batch NVARCHAR(50),
                    item_id BIGINT,
                    from_godown BIGINT,
                    to_godown BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    uniquId BIGINT,
                    moduleId BIGINT
                );
                INSERT INTO #Parsed (batch_id, batch, item_id, from_godown, to_godown, quantity, rate, uniquId, moduleId)
                SELECT * FROM OPENJSON(@jsonData)
                WITH (
                    id NVARCHAR(150),
                    batch NVARCHAR(50),
                    productId BIGINT,
                    fromGodownId BIGINT,
                    godownId BIGINT,
                    quantity DECIMAL(18,2),
                    rate DECIMAL(18,2),
                    uniquId BIGINT,
                    moduleId BIGINT
                );
            -- Insert transfer out transaction
                INSERT INTO tbl_Batch_Transaction (
                    batch_id, batch, trans_date, item_id, godown_id, quantity, type, reference_id, created_by
                )
                SELECT batch_id, batch, @trans_date, item_id, from_godown, quantity, 'OTHER GODOWN', moduleId, @createdBy
                FROM #Parsed;
            -- Ensure the batch exists in destination godown (if not, insert)
                MERGE tbl_Batch_Master AS target
                USING #Parsed AS source
                ON 
                    target.batch = source.batch
                    AND target.item_id = source.item_id
                    AND target.godown_id = source.to_godown
                WHEN MATCHED THEN
                    UPDATE SET target.quantity = target.quantity + source.quantity
                WHEN NOT MATCHED THEN
                    INSERT (batch, trans_date, item_id, godown_id, quantity, rate, created_by)
                    VALUES (source.batch, @trans_date, source.item_id, source.to_godown, source.quantity, source.rate, @createdBy);
            -- Update Trip Arrival
                UPDATE t
                SET t.Batch_No = p.batch
                FROM tbl_Trip_Arrival t
                JOIN #Parsed p ON t.Arr_Id = p.uniquId;
                DROP TABLE #Parsed;`
            );

        await transaction.commit();
        success(res, 'Godown transfer completed successfully');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

const getBatchStockBalance = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const { dateBased = false } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
            -- only useable quantity details
                DECLARE @batchDetails TABLE (id NVARCHAR(150), consumedQuantity DECIMAL(18, 2));
            -- filters
                INSERT INTO @batchDetails (id, consumedQuantity)
                SELECT 
                	bm.id, 
                	COALESCE(SUM(bt.quantity), 0) AS consumedQuantity
                FROM tbl_Batch_Master AS bm
                LEFT JOIN tbl_Batch_Transaction AS bt ON bt.batch_id = bm.id
                ${dateBased ? ` WHERE bm.trans_date BETWEEN @Fromdate AND @Todate ` : ''}
                GROUP BY bm.id, bm.quantity
                ${!dateBased ? ` HAVING COALESCE(SUM(bt.quantity), 0) < bm.quantity ` : ''};
            -- batch master
                SELECT
                	bm.id,
                	bm.batch,
                	bm.trans_date,
                	bm.godown_id,
                	sg.Godown_Name AS godownName,
                	bm.item_id,
                	p.Product_Name AS productNameGet,
                	COALESCE(bm.quantity, 0) AS totalQuantity,
                	COALESCE(bm.quantity, 0) - pq.consumedQuantity AS pendingQuantity,
                	pq.consumedQuantity,
                	bm.created_at,
                	COALESCE(cb.Name, 'Not found') AS createdByGet
                FROM tbl_Batch_Master AS bm 
                JOIN @batchDetails AS pq ON pq.id = bm.id
                LEFT JOIN tbl_Batch_Transaction AS bt ON bt.batch_id = bm.id
                LEFT JOIN tbl_Godown_Master AS sg ON sg.Godown_Id = bm.godown_id
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = bm.item_id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = bm.created_by;
            -- batch transaction
                SELECT *
                FROM tbl_Batch_Transaction
                WHERE batch_id IN (SELECT batch_id FROM @batchDetails)`
            );

        const result = await request;

        const bMaster = result.recordsets[0];
        const bTransaction = result.recordsets[1];

        const merged = bMaster.map(masterRow => {

            const transactionRows = bTransaction.filter(
                transactionRow => stringCompare(transactionRow.batch_id, masterRow.id)
            );

            const trans_date = masterRow?.trans_date ? ISOString(masterRow.trans_date) : ISOString();

            const stockDays = toNumber(masterRow?.invoice_date ? getDaysBetween(trans_date, ISOString()) : '');

            return {
                ...masterRow,
                stockDays,
                transaction: transactionRows
            };
        });

        sentData(res, merged);

    } catch (e) {
        servError(e, res);
    }
}


export default {
    getUnAssignedBatchFromMaterialInward,
    getUnAssignedBatchProcessing,
    postBatchInMaterialInward,
    postBatchInProcessing,
    getUnAssignedBatchFromGodownTransfer,
    postOtherGodownTransfer,
    getBatchStockBalance,

}