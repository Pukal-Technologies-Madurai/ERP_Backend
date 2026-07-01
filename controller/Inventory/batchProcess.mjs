import sql from 'mssql'
import { servError, success, invalidInput, sentData } from '../../res.mjs';
import { Addition, checkIsNumber, getDaysBetween, isEqualNumber, ISOString, stringCompare, Subraction, toArray, toNumber } from '../../helper_functions.mjs';
import { insertMultipleBatch, insertMultipleBatchUsageDetails } from '../../middleware/batchTransactions.mjs';

// material inward

const getUnAssignedBatchFromMaterialInward = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
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
                    ${checkIsNumber(fromGodown) ? ` AND ar.From_Location = @fromGodown ` : ''}
                    ${checkIsNumber(toGodown) ? ` AND ar.To_Location = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND ar.Product_Id = @item ` : ''}
                ORDER BY tm.Trip_Date ASC;
                -- filter values
                -- From godowns
                SELECT DISTINCT ta.From_Location AS value, fg.Godown_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ta.From_Location
                ORDER BY fg.Godown_Name;
                -- To godowns
                SELECT DISTINCT ta.To_Location AS value, tg.Godown_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.To_Location
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Product_Id AS value, p.Product_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Product_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, fromGodowns, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodowns: toArray(fromGodowns),
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

    } catch (e) {
        servError(e, res);
    }
}

const postBatchInMaterialInward = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        // Update Trip Arrival batch numbers
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
                UPDATE t
                SET t.Batch_No = p.batch
                FROM tbl_Trip_Arrival t
                JOIN #Parsed p ON t.Arr_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch master upsert via centralized function
        const batchResult = await insertMultipleBatch(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                rate: toNumber(item.rate),
                type: 'MATERIAL_INWARD',
                reference_id: toNumber(item.uniquId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch creation failed');

        await transaction.commit();
        success(res, 'Batch and Trip Arrival updated successfully');

    } catch (err) {
        if (transaction._aborted !== true) await transaction.rollback();
        servError(err, res);
    }
};

// consumption stock-journal

const getUnAssignedBatchProcessingSource = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	--TOP (200)
                	prd.PRS_Id AS uniquId,
                	pr.PR_Id AS moduleId,
                	pr.Process_date AS eventDate,
                    pr.PR_Inv_Id AS voucherNumber,
                	prd.Sour_Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    prd.Sour_Goodown_Id AS godownId, 
                	tg.Godown_Name AS fromGodownGet,
                	'' AS toGodownGet,
                	COALESCE(prd.Sour_Qty, 0) AS quantity,
                	COALESCE(prd.Sour_Rate, 0) AS rate,
                	COALESCE(prd.Sour_Amt, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	pr.Created_At AS createdAt,
                	'PROCESSING' AS moduleName
                FROM tbl_Processing_Source_Details AS prd
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = prd.Sour_Item_Id
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = prd.Sour_Goodown_Id
                JOIN tbl_Processing_Gen_Info AS pr ON pr.PR_Id = prd.PR_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = pr.Created_By
                WHERE 
                	TRIM(COALESCE(prd.Sour_Batch_Lot_No, '')) = ''
                	AND pr.Process_date BETWEEN @Fromdate AND @Todate
                    ${checkIsNumber(fromGodown) ? ` AND prd.Sour_Goodown_Id = @fromGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND prd.Sour_Item_Id = @item ` : ''}
                ORDER BY pr.Process_date ASC;
                -- filter values
                -- From godowns
                SELECT DISTINCT ta.Sour_Goodown_Id AS value, fg.Godown_Name AS label
                FROM tbl_Processing_Source_Details AS ta
                JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ta.Sour_Goodown_Id
                ORDER BY fg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Sour_Item_Id AS value, p.Product_Name AS label
                FROM tbl_Processing_Source_Details AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Sour_Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, fromGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodowns: toArray(fromGodowns),
            toGodowns: [],
            items: toArray(items)
        });
    } catch (e) {
        servError(e, res);
    }
}

const postBatchInProcessingSource = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy))
            return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);
        await transaction.begin();

        // Update source details batch numbers
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                UPDATE pr
                SET pr.Sour_Batch_Lot_No = p.batch
                FROM tbl_Processing_Source_Details pr
                JOIN #Parsed p ON pr.PRS_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch usage via centralized function
        const batchResult = await insertMultipleBatchUsageDetails(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                type: 'CONSUMPTION',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch consumption failed');

        await transaction.commit();
        success(res, 'Godown transfer completed successfully');

    } catch (err) {
        if (transaction._aborted !== true) await transaction.rollback();
        servError(err, res);
    }
}

// production stock-journal

const getUnAssignedBatchProcessing = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	--TOP (200)
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
                    ${checkIsNumber(toGodown) ? ` AND prd.Dest_Goodown_Id = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND prd.Dest_Item_Id = @item ` : ''}
                ORDER BY pr.Process_date ASC;
                -- filter values
                -- To godowns
                SELECT DISTINCT ta.Dest_Goodown_Id AS value, tg.Godown_Name AS label
                FROM tbl_Processing_Destin_Details AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.Dest_Goodown_Id
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Dest_Item_Id AS value, p.Product_Name AS label
                FROM tbl_Processing_Destin_Details AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Dest_Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodowns: [],
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });
    } catch (e) {
        servError(e, res);
    }
}

const postBatchInProcessing = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        // Update destination details batch numbers
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
                UPDATE pr
                SET pr.Dest_Batch_Lot_No = p.batch
                FROM tbl_Processing_Destin_Details pr
                JOIN #Parsed p ON pr.PRD_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch master upsert via centralized function
        const batchResult = await insertMultipleBatch(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                rate: toNumber(item.rate),
                type: 'PRODUCTION',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch creation failed');

        await transaction.commit();
        success(res, 'Batch and Processing updated successfully');

    } catch (err) {
        if (transaction._aborted !== true) await transaction.rollback();
        servError(err, res);
    }
}

// godown transfer

const getUnAssignedBatchFromGodownTransfer = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	--TOP (200)
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
                    ${checkIsNumber(fromGodown) ? ` AND ar.From_Location = @fromGodown ` : ''}
                    ${checkIsNumber(toGodown) ? ` AND ar.To_Location = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND ar.Product_Id = @item ` : ''}
                ORDER BY tm.Trip_Date ASC;
                -- filter values
                -- From godowns
                SELECT DISTINCT ta.From_Location AS value, fg.Godown_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ta.From_Location
                ORDER BY fg.Godown_Name;
                -- To godowns
                SELECT DISTINCT ta.To_Location AS value, tg.Godown_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.To_Location
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Product_Id AS value, p.Product_Name AS label
                FROM tbl_Trip_Arrival AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Product_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, fromGodowns, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodowns: toArray(fromGodowns),
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

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

        // Update Trip Arrival batch numbers
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                UPDATE t
                SET t.Batch_No = p.batch
                FROM tbl_Trip_Arrival t
                JOIN #Parsed p ON t.Arr_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Transfer out: batch consumption from source godown
        const usageResult = await insertMultipleBatchUsageDetails(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.fromGodownId),
                quantity: toNumber(item.quantity),
                type: 'OTHER_GODOWN',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!usageResult) throw new Error('Batch consumption failed');

        // Transfer in: batch master upsert in destination godown
        const batchResult = await insertMultipleBatch(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                rate: toNumber(item.rate),
                type: 'OTHER_GODOWN',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch creation in destination failed');

        await transaction.commit();
        success(res, 'Godown transfer completed successfully');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

// sales invoice

const getUnAssignedBatchSales = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	--TOP (200)
                	sdi.DO_St_Id AS uniquId,
                	sd.Do_Id AS moduleId,
                	sd.Do_Date AS eventDate,
                    sd.Do_Inv_No AS voucherNumber,
                	sdi.Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    sdi.GoDown_Id AS godownId, 
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(sdi.Bill_Qty, 0) AS quantity,
                	COALESCE(sdi.Item_Rate, 0) AS rate,
                	COALESCE(sdi.Final_Amo, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	sd.Created_on AS createdAt,
                	'SALES' AS moduleName
                FROM tbl_Sales_Delivery_Stock_Info AS sdi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdi.Item_Id
                --LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = prd.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = sdi.GoDown_Id
                JOIN tbl_Sales_Delivery_Gen_Info AS sd ON sd.Do_Id = sdi.Delivery_Order_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sd.Created_By
                WHERE 
                	TRIM(COALESCE(sdi.Batch_Name, '')) = ''
                	AND sd.Do_Date BETWEEN @Fromdate AND @Todate
                    AND sd.Cancel_status <> 0
                    ${checkIsNumber(toGodown) ? ` AND sdi.GoDown_Id = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND sdi.Item_Id = @item ` : ''}
                ORDER BY sd.Do_Date ASC;
                -- filter values
                -- To godowns
                SELECT DISTINCT ta.GoDown_Id AS value, tg.Godown_Name AS label
                FROM tbl_Sales_Delivery_Stock_Info AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.GoDown_Id
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Item_Id AS value, p.Product_Name AS label
                FROM tbl_Sales_Delivery_Stock_Info AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodown: [],
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

    } catch (e) {
        servError(e, res);
    }
};

const postSalesUsage = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy))
            return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);
        await transaction.begin();

        // Update sales delivery batch names
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                UPDATE s
                SET s.Batch_Name = p.batch
                FROM tbl_Sales_Delivery_Stock_Info s
                JOIN #Parsed p ON s.DO_St_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch usage via centralized function
        const batchResult = await insertMultipleBatchUsageDetails(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                type: 'SALES',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Sales batch usage failed');

        await transaction.commit();
        success(res, 'Sales usage update successfully');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

// purchase invoice 

const getUnAssignedBatchPurchase = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { fromGodown = null, toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('fromGodown', sql.Int, fromGodown)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	--TOP (200)
                	psi.POI_St_Id AS uniquId,
                	pui.PIN_Id AS moduleId,
                	pui.Po_Entry_Date AS eventDate,
                    pui.Po_Inv_No AS voucherNumber,
                	psi.Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    psi.Location_Id AS godownId, 
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(psi.Bill_Qty, 0) AS quantity,
                	COALESCE(psi.Item_Rate, 0) AS rate,
                	COALESCE(psi.Final_Amo, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	pui.Created_on AS createdAt,
                	'PURCHASE' AS moduleName
                FROM tbl_Purchase_Order_Inv_Stock_Info AS psi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = psi.Item_Id
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = psi.Location_Id
                JOIN tbl_Purchase_Order_Inv_Gen_Info AS pui ON pui.PIN_Id = psi.PIN_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = pui.Created_by
                WHERE 
                	TRIM(COALESCE(psi.Batch_No, '')) = ''
                	AND pui.Po_Entry_Date BETWEEN @Fromdate AND @Todate
					AND pui.Cancel_status = 0
                    ${checkIsNumber(toGodown) ? ` AND psi.Location_Id = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND psi.Item_Id = @item ` : ''}
                ORDER BY pui.Po_Entry_Date ASC;
                -- filter values
                -- To godowns
                SELECT DISTINCT ta.Location_Id AS value, tg.Godown_Name AS label
                FROM tbl_Purchase_Order_Inv_Stock_Info AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.Location_Id
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Item_Id AS value, p.Product_Name AS label
                FROM tbl_Purchase_Order_Inv_Stock_Info AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodown: [],
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

    } catch (e) {
        servError(e, res);
    }
};

const postPurchaseBatch = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        // Update purchase stock info batch numbers
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
                UPDATE pid
                SET pid.Batch_No = p.batch
                FROM tbl_Purchase_Order_Inv_Stock_Info pid
                JOIN #Parsed p ON pid.POI_St_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch master upsert via centralized function
        const batchResult = await insertMultipleBatch(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                rate: toNumber(item.rate),
                type: 'PURCHASE',
                reference_id: toNumber(item.uniquId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch creation failed');

        await transaction.commit();
        success(res, 'Changes saved');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

// credit note

const getUnAssignedBatchCreditNote = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	csi.CR_St_Id AS uniquId,
                	cr.CR_Id AS moduleId,
                	cr.CR_Date AS eventDate,
                    cr.CR_Inv_No AS voucherNumber,
                	csi.Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    csi.GoDown_Id AS godownId, 
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(csi.Bill_Qty, 0) AS quantity,
                	COALESCE(csi.Item_Rate, 0) AS rate,
                	COALESCE(csi.Final_Amo, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	cr.Created_on AS createdAt,
                	'CREDIT_NOTE' AS moduleName
                FROM tbl_Credit_Note_Stock_Info AS csi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = csi.Item_Id
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = csi.GoDown_Id
                JOIN tbl_Credit_Note_Gen_Info AS cr ON cr.CR_Id = csi.CR_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = cr.Created_by
                WHERE 
                	TRIM(COALESCE(csi.Batch_Name, '')) = ''
                	AND cr.CR_Date BETWEEN @Fromdate AND @Todate
                    AND cr.Cancel_status <> 0
                    ${checkIsNumber(toGodown) ? ` AND csi.GoDown_Id = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND csi.Item_Id = @item ` : ''}
                ORDER BY cr.CR_Date ASC;
                -- filter values
                -- To godowns
                SELECT DISTINCT ta.GoDown_Id AS value, tg.Godown_Name AS label
                FROM tbl_Credit_Note_Stock_Info AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.GoDown_Id
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Item_Id AS value, p.Product_Name AS label
                FROM tbl_Credit_Note_Stock_Info AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodown: [],
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

    } catch (e) {
        servError(e, res);
    }
};

const postCreditNoteBatch = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        // Update credit note stock info batch names
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                IF EXISTS (SELECT 1 FROM #Parsed WHERE batch IS NULL OR item_id IS NULL OR godown_id IS NULL)
                THROW 50000, 'Invalid or missing fields in JSON input.', 1;
                UPDATE csi
                SET csi.Batch_Name = p.batch
                FROM tbl_Credit_Note_Stock_Info csi
                JOIN #Parsed p ON csi.CR_St_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch master upsert via centralized function (credit note = stock coming back IN)
        const batchResult = await insertMultipleBatch(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                rate: toNumber(item.rate),
                type: 'CREDIT_NOTE',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Batch creation failed');

        await transaction.commit();
        success(res, 'Credit note batch updated successfully');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

// debit note

const getUnAssignedBatchDebitNote = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const { toGodown = null, item = null } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('toGodown', sql.Int, toGodown)
            .input('item', sql.Int, item)
            .query(`
                SELECT 
                	dsi.DB_St_Id AS uniquId,
                	db.DB_Id AS moduleId,
                	db.DB_Date AS eventDate,
                    db.DB_Inv_No AS voucherNumber,
                	dsi.Item_Id AS productId,
                	p.Product_Name AS productNameGet,
                    dsi.GoDown_Id AS godownId, 
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(dsi.Bill_Qty, 0) AS quantity,
                	COALESCE(dsi.Item_Rate, 0) AS rate,
                	COALESCE(dsi.Final_Amo, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	db.Created_on AS createdAt,
                	'DEBIT_NOTE' AS moduleName
                FROM tbl_Debit_Note_Stock_Info AS dsi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = dsi.Item_Id
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = dsi.GoDown_Id
                JOIN tbl_Debit_Note_Gen_Info AS db ON db.DB_Id = dsi.DB_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = db.Created_by
                WHERE 
                	TRIM(COALESCE(dsi.Batch_Name, '')) = ''
                	AND db.DB_Date BETWEEN @Fromdate AND @Todate
                    AND db.Cancel_status <> 0
                    ${checkIsNumber(toGodown) ? ` AND dsi.GoDown_Id = @toGodown ` : ''}
                    ${checkIsNumber(item) ? ` AND dsi.Item_Id = @item ` : ''}
                ORDER BY db.DB_Date ASC;
                -- filter values
                -- To godowns
                SELECT DISTINCT ta.GoDown_Id AS value, tg.Godown_Name AS label
                FROM tbl_Debit_Note_Stock_Info AS ta
                JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ta.GoDown_Id
                ORDER BY tg.Godown_Name;
                -- items 
                SELECT DISTINCT ta.Item_Id AS value, p.Product_Name AS label
                FROM tbl_Debit_Note_Stock_Info AS ta
                JOIN tbl_Product_Master AS p ON p.Product_Id = ta.Item_Id
                ORDER BY p.Product_Name;`
            );

        const result = await request;

        const [outstanding, toGodowns, items] = result.recordsets;

        sentData(res, toArray(outstanding), {
            fromGodown: [],
            toGodowns: toArray(toGodowns),
            items: toArray(items)
        });

    } catch (e) {
        servError(e, res);
    }
};

const postDebitNoteUsage = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy))
            return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);
        await transaction.begin();

        // Update debit note stock info batch names
        await new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .query(`
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
                UPDATE dsi
                SET dsi.Batch_Name = p.batch
                FROM tbl_Debit_Note_Stock_Info dsi
                JOIN #Parsed p ON dsi.DB_St_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        // Batch usage via centralized function (debit note = stock going OUT)
        const batchResult = await insertMultipleBatchUsageDetails(
            transaction,
            itemBatch.map(item => ({
                batch: item.batch,
                trans_date: new Date(trans_date),
                item_id: toNumber(item.productId),
                godown_id: toNumber(item.godownId),
                quantity: toNumber(item.quantity),
                type: 'DEBIT_NOTE',
                reference_id: toNumber(item.moduleId),
                created_by: toNumber(createdBy)
            }))
        );
        if (!batchResult) throw new Error('Debit note batch usage failed');

        await transaction.commit();
        success(res, 'Debit note batch updated successfully');

    } catch (err) {
        if (!transaction._aborted) await transaction.rollback();
        servError(err, res);
    }
};

// stock balance - output

const getBatchStockBalance = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const { dateBased = 'no', Product_Id } = req.query;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Product_Id', sql.Int, Product_Id)
            .query(`
            --  opening date
                DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
	            DECLARE @openingDate DATE = (SELECT TOP (1) OB_Date FROM tbl_OB_ST_Date WHERE OB_Id = @openingId);
            -- only useable quantity details
                DECLARE @batchDetails TABLE (id uniqueidentifier, consumedQuantity DECIMAL(18, 2));
            -- filters
                INSERT INTO @batchDetails (id, consumedQuantity)
                SELECT 
                	bm.id, 
                	COALESCE(SUM(bt.quantity), 0) AS consumedQuantity
                FROM tbl_Batch_Master AS bm
                LEFT JOIN tbl_Batch_Transaction AS bt ON bt.batch_id = bm.id
                WHERE 
                    bm.id IS NOT NULL
                    AND bm.ob_id = @openingId
                    AND bm.batch IS NOT NULL
                    AND LTRIM(RTRIM(bm.batch)) <> '' 
                ${stringCompare(dateBased, 'yes') ? ` AND CONVERT(DATE, bm.trans_date) BETWEEN @Fromdate AND @Todate ` : ''}
                ${checkIsNumber(Product_Id) ? ` AND bm.item_id = @Product_Id ` : ''}
                GROUP BY bm.id, bm.quantity
                ${stringCompare(dateBased, 'no') ? ` HAVING COALESCE(SUM(bt.quantity), 0) < bm.quantity ` : ''};
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
                	bm.created_at,
                	COALESCE(cb.Name, 'Not found') AS createdByGet
                FROM tbl_Batch_Master AS bm 
                LEFT JOIN tbl_Godown_Master AS sg ON sg.Godown_Id = bm.godown_id
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = bm.item_id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = bm.created_by
                WHERE bm.id IN (SELECT id FROM @batchDetails);
            -- batch transaction
                SELECT bt.*, g.Godown_Name AS godownNameGet
                FROM tbl_Batch_Transaction AS bt
	            LEFT JOIN tbl_Godown_Master AS g ON g.Godown_Id = bt.godown_id
                WHERE bt.batch_id IN (SELECT id FROM @batchDetails)`
            );

        const result = await request;

        const bMaster = result.recordsets[0];
        const bTransaction = result.recordsets[1];

        const merged = bMaster.map(masterRow => {

            const transactionRows = bTransaction.filter(
                transactionRow => stringCompare(transactionRow.batch_id, masterRow.id)
            );

            const trans_date = masterRow?.trans_date ? ISOString(masterRow.trans_date) : ISOString();

            const stockDays = toNumber(masterRow?.trans_date ? getDaysBetween(trans_date, ISOString()) : '');

            const consumedQuantity = transactionRows.reduce((acc, curr) => acc + toNumber(curr.quantity), 0)

            const pendingQuantity = toNumber(masterRow?.totalQuantity) - consumedQuantity;

            return {
                ...masterRow,
                stockDays,
                consumedQuantity,
                pendingQuantity,
                transaction: transactionRows
            };
        });

        sentData(res, merged);

    } catch (e) {
        servError(e, res);
    }
}

const previousAndNextStages = async (req, res) => {
    try {
        const { item_id, batch_name, godown_id } = req.query;

        const request = new sql.Request()
            .input('reqItem', sql.Int, item_id)
            .input('batchName', sql.NVarChar, batch_name)
            .input('godown_id', sql.Int, godown_id)
            .query(`
                --DECLARE @reqItem INT = 340, @batchName NVARCHAR(50) = 'GULABI PRODUCTION';
                -- ****************************** batch details ******************************
                SELECT 
                	bm.id,
                	bm.item_id,
                	pm.Product_Name item_Name,
                	bm.batch,
                	bm.godown_id,
                	gm.Godown_Name godown_name,
                	bm.quantity,
                	COALESCE(bm.rate, 0) rate,
                	bm.created_at,
                	bm.created_by,
                	cb.Name creater_name,
                	bm.ob_id
                FROM tbl_Batch_Master as bm
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = bm.item_id
                LEFT JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = bm.godown_id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = bm.created_by
                WHERE bm.item_id = @reqItem AND bm.batch = @batchName
                ORDER BY bm.ob_id DESC, bm.created_at DESC
                -- ****************************** batch usage ******************************
                SELECT 
                	bt.batch_id,
                	bt.batch,
                	bt.trans_date,
                	bt.item_id,
                	bt.godown_id,
                	bt.quantity,
                	bt.type,
                	bt.reference_id,
                	bt.created_at,
                	bt.created_by,
                	cb.Name creater_name,
                	bt.ob_id
                FROM tbl_Batch_Transaction AS bt
                LEFT JOIN tbl_Users AS cb ON bt.created_by = cb.UserId
                WHERE bt.item_id = @reqItem AND batch = @batchName;
                -- ****************************** next stage ******************************
                SELECT *
                FROM dbo.getBatchAfterState(@reqItem, @batchName);
                -- ****************************** previous stage ******************************
                SELECT *
                FROM dbo.getBatchBeforeState(@reqItem, @batchName);    
            `);

        const result = await request;

        const [batch_master, batch_transaction, next_stage, previous_stage] = result.recordsets;

        const merged = batch_master.map(masterRow => {

            const transactionRows = batch_transaction.filter(
                transactionRow => stringCompare(transactionRow.batch_id, masterRow.id)
            );

            const nextStg = next_stage.filter(
                nexRow => isEqualNumber(nexRow.itemId, masterRow.item_id) && 
                isEqualNumber(nexRow.godownId, masterRow.godown_id)
            );

            const consumedQuantity = transactionRows.reduce((acc, curr) => Addition(acc, curr.quantity), 0)

            const pendingQuantity = Subraction(masterRow?.quantity, consumedQuantity);

            return {
                ...masterRow,
                consumedQuantity,
                pendingQuantity,
                transaction: transactionRows,
                prevStg: previous_stage,
                nextStg: next_stage
            };
        });

        sentData(res, merged);

    } catch (e) {
        servError(e, res);
    }
}

const previousBatchDetails = async (req, res) => {
    try {
        const { item_id, batch_name, godown_id } = req.query;

        const request = new sql.Request()
            .input('reqItem', sql.Int, item_id)
            .input('batchName', sql.NVarChar, batch_name)
            .input('godown_id', sql.Int, godown_id)
            .query(`
                SELECT *
                FROM dbo.getBatchBeforeState(@reqItem, @batchName);
            `);

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const nextBatchDetails = async (req, res) => {
    try {
        const { item_id, batch_name, godown_id } = req.query;

        const request = new sql.Request()
            .input('reqItem', sql.Int, item_id)
            .input('batchName', sql.NVarChar, batch_name)
            .input('godown_id', sql.Int, godown_id)
            .query(`
                SELECT *
                FROM dbo.getBatchAfterState(@reqItem, @batchName);
            `);

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const batchTransaction = async (req, res) => {
    try {
        const { batch_id } = req.query;

        const request = new sql.Request()
            .input('batch_id', sql.UniqueIdentifier, batch_id)
            .query(`
                DECLARE @batch_id UniqueIdentifier = '80340c87-485e-4984-9432-c632787f7a9f';
                SELECT * FROM tbl_Batch_Master bm WHERE bm.id = @batch_id;
                SELECT * FROM tbl_Batch_Transaction WHERE batch_id = @batch_id;
            `);

        const result = await request;

        
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getUnAssignedBatchFromMaterialInward,
    postBatchInMaterialInward,
    getUnAssignedBatchProcessingSource,
    postBatchInProcessingSource,
    getUnAssignedBatchProcessing,
    postBatchInProcessing,
    getUnAssignedBatchFromGodownTransfer,
    postOtherGodownTransfer,
    getUnAssignedBatchSales,
    postSalesUsage,
    getUnAssignedBatchPurchase,
    postPurchaseBatch,
    getUnAssignedBatchCreditNote,
    postCreditNoteBatch,
    getUnAssignedBatchDebitNote,
    postDebitNoteUsage,
    getBatchStockBalance,
    previousAndNextStages,
    previousBatchDetails,
    nextBatchDetails,
    batchTransaction
}