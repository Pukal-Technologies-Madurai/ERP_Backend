import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, getDaysBetween, ISOString, stringCompare, toNumber } from '../../helper_functions.mjs';

// material inward

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

const postBatchInMaterialInward = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        const request = new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .input('trans_date', sql.Date, trans_date)
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
                    INSERT (batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                    VALUES (source.batch, source.item_id, source.godown_id, @trans_date, source.quantity, source.rate, @createdBy);
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

// consumption stock-journal

const getUnAssignedBatchProcessingSource = async (req, res) => {
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
                ORDER BY pr.Process_date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
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
                SELECT batch_id, batch, @trans_date, item_id, to_godown, quantity, 'SALES', moduleId, @createdBy
                FROM #Parsed;
            -- Update Sales
                UPDATE pr
                SET pr.Sour_Batch_Lot_No = p.batch
                FROM tbl_Processing_Source_Details pr
                JOIN #Parsed p ON pr.PRS_Id = p.uniquId;
                DROP TABLE #Parsed;`
            );

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

const postBatchInProcessing = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const { itemBatch = [], createdBy = '' } = req.body;

        const trans_date = req.body.trans_date ? ISOString(req.body.trans_date) : ISOString();

        if (!itemBatch.length || !checkIsNumber(createdBy)) return invalidInput(res);

        const jsonData = JSON.stringify(itemBatch);

        await transaction.begin();

        const request = new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .input('trans_date', sql.Date, trans_date)
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
                    INSERT (batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                    VALUES (source.batch, source.item_id, source.godown_id, @trans_date, source.quantity, source.rate, @createdBy);
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

// godown transfer

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

// sales invoice

const getUnAssignedBatchSales = async (req, res) => {
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
                ORDER BY sd.Do_Date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
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
                SELECT batch_id, batch, @trans_date, item_id, to_godown, quantity, 'SALES', moduleId, @createdBy
                FROM #Parsed;
            -- Update Sales
                UPDATE s
                SET s.Batch_Name = p.batch
                FROM tbl_Sales_Delivery_Stock_Info s
                JOIN #Parsed p ON s.DO_St_Id = p.uniquId;
                DROP TABLE #Parsed;`
            );

        await transaction.commit();
        success(res, 'Godown transfer completed successfully');

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

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
                SELECT 
                	TOP (200)
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
                ORDER BY pui.Po_Entry_Date ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
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

        const request = new sql.Request(transaction)
            .input('jsonData', sql.NVarChar(sql.MAX), jsonData)
            .input('createdBy', sql.Int, createdBy)
            .input('trans_date', sql.Date, trans_date)
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
                    INSERT (batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                    VALUES (source.batch, source.item_id, source.godown_id, @trans_date, source.quantity, source.rate, @createdBy);
            -- Update Trip Arrival
                UPDATE pid
                SET pid.Batch_No = p.batch
                FROM tbl_Purchase_Order_Inv_Stock_Info pid
                JOIN #Parsed p ON pid.POI_St_Id = p.uniquId;
                DROP TABLE #Parsed;`);

        await request;

        await transaction.commit();
        success(res, 'Changes saved');

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

        const { dateBased = 'no' } = req.query;

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
                ${stringCompare(dateBased, 'yes') ? ` WHERE CONVERT(DATE, bm.trans_date) BETWEEN @Fromdate AND @Todate ` : ''}
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
                LEFT JOIN tbl_Users AS cb ON cb.UserId = bm.created_by;
            -- batch transaction
                SELECT bt.*, g.Godown_Name AS godownNameGet
                FROM tbl_Batch_Transaction AS bt
	            LEFT JOIN tbl_Godown_Master AS g ON g.Godown_Id = bt.godown_id
                WHERE bt.batch_id IN (SELECT batch_id FROM @batchDetails)`
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
    getBatchStockBalance,
}