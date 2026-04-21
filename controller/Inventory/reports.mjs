import sql from 'mssql';
import { servError, sentData,success,dataFound } from '../../res.mjs';
import { isEqualNumber, ISOString,randomNumber,checkIsNumber } from '../../helper_functions.mjs';

const getInventoryReport = async (req, res) => {
    try {

        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const fromDateObj = new Date(Fromdate);
        const yesterdayObj = new Date(fromDateObj);
        yesterdayObj.setDate(fromDateObj.getDate() - 1);
        const oneWeekAgoObj = new Date(fromDateObj);
        oneWeekAgoObj.setDate(fromDateObj.getDate() - 7);
        const oneMonthAgoObj = new Date(fromDateObj);
        oneMonthAgoObj.setMonth(fromDateObj.getMonth() - 1);

        const stockRequest = new sql.Request()
            .input('Fromdate', sql.DateTime, Fromdate)
            .input('Todate', sql.DateTime, Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0);
        const stockResult = await stockRequest.execute('Stock_Summarry_Search');

        const filteredData = stockResult.recordset.filter(
            row =>
                !(
                    isEqualNumber(row?.OB_Act_Qty, 0) &&
                    isEqualNumber(row?.Pur_Act_Qty, 0) &&
                    isEqualNumber(row?.Sal_Act_Qty, 0) &&
                    isEqualNumber(row?.Bal_Act_Qty, 0) &&
                    isEqualNumber(row?.OB_Bal_Qty, 0) &&
                    isEqualNumber(row?.Pur_Qty, 0) &&
                    isEqualNumber(row?.Sal_Qty, 0) &&
                    isEqualNumber(row?.Bal_Qty, 0)
                )
        );

        const uniqueItemGroupIdArray = [...new Set(filteredData.map(row => row?.Item_Group_Id).filter(Boolean))];


        const productLosQuery = `
      WITH FilteredProducts AS (
        SELECT TRY_CAST(value AS INT) AS Product_Id
        FROM STRING_SPLIT(@filterItems, ',')
        WHERE TRY_CAST(value AS INT) IS NOT NULL
      ),
      LOS_Ranked AS (
        SELECT los.*,
               ROW_NUMBER() OVER (PARTITION BY los.Stock_Tally_Id ORDER BY los.Stock_Tally_Id) AS rn
        FROM tbl_Stock_LOS AS los
      )
      SELECT
        p.Product_Id,
        p.Product_Name,
        p.ERP_Id,
        p.Product_Rate,
        COALESCE(los.Stock_Item, '-') AS Stock_Item,
        COALESCE(los.Group_ST, '-') AS Group_ST,
        COALESCE(los.Bag, '-') AS Bag,
        COALESCE(los.Stock_Group, '-') AS Stock_Group,
        COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
        COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
        COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified
      FROM tbl_Product_Master AS p
      LEFT JOIN LOS_Ranked AS los
        ON los.Stock_Tally_Id = p.ERP_Id AND los.rn = 1
      WHERE (@filterItems IS NULL OR LTRIM(RTRIM(@filterItems)) = '' OR p.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts))
    `;

        const productLosData = await new sql.Request()
            .input('filterItems', sql.NVarChar('max'), uniqueItemGroupIdArray.join(','))
            .query(productLosQuery);

        const losMap = {};
        productLosData.recordset.forEach(p => {
            losMap[p.Product_Id] = p;
        });


        const uniqueProductIds = [...new Set(filteredData.map(r => parseInt(r.Product_Id, 10)).filter(Boolean))];
        const deliverySumMap = {};
        if (uniqueProductIds.length > 0) {
            const deliveryQuery = `
        SELECT
          Item_Id AS Product_Id,
          SUM(CASE WHEN Do_Date >= @monthStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 30.0 AS OneMonth_Act_Qty,
          SUM(CASE WHEN Do_Date >= @weekStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 7.0 AS OneWeek_Act_Qty,
          SUM(CASE WHEN Do_Date = @yesterday THEN Act_Qty ELSE 0 END) AS Yesterday_Act_Qty
        FROM tbl_Sales_Delivery_Stock_Info
        WHERE Item_Id IN (${uniqueProductIds.join(',')})
        GROUP BY Item_Id
      `;
            const deliveryData = await new sql.Request()
                .input('monthStart', sql.DateTime, oneMonthAgoObj)
                .input('weekStart', sql.DateTime, oneWeekAgoObj)
                .input('yesterday', sql.DateTime, yesterdayObj)
                .input('today', sql.DateTime, fromDateObj)
                .query(deliveryQuery);

            deliveryData.recordset.forEach(d => {
                deliverySumMap[d.Product_Id] = d;
            });
        }

        const mergedMap = new Map();
        filteredData.forEach(row => {
            const productId = parseInt(row.Product_Id, 10);
            if (!mergedMap.has(productId)) {
                const los = losMap[productId] || {};
                const delivery = deliverySumMap[productId] || {};
                mergedMap.set(productId, {
                    ...row,
                    Product_Rate: los.Product_Rate || 0,
                    Stock_Item: los.Stock_Item || '',
                    Group_ST: los.Group_ST || '',
                    Bag: los.Bag || '',
                    Stock_Group: los.Stock_Group || '',
                    S_Sub_Group_1: los.S_Sub_Group_1 || '',
                    Grade_Item_Group: los.Grade_Item_Group || '',
                    Item_Name_Modified: los.Item_Name_Modified || '',
                    OneMonth_Act_Qty: Number(delivery.OneMonth_Act_Qty) || 0,
                    OneWeek_Act_Qty: Number(delivery.OneWeek_Act_Qty) || 0,
                    Yesterday_Act_Qty: Number(delivery.Yesterday_Act_Qty) || 0
                });
            }
        });

        sentData(res, Array.from(mergedMap.values()));
    } catch (e) {
        servError(e, res);
    }
};



// const getStockAdjustment = async (req, res) => {
//     try {
//         const result = await sql.query(`
//             SELECT 
//                 i.Aj_id,
//                 i.invoice_no,
//                 i.Adj_date,
//                 i.Adj_ledger_id AS godown_id,
//                 ISNULL(g.Godown_Name, 'Unassigned') AS godown_name,
//                 i.total_value,
//                 i.narration,
//                 i.Adjust_Type,
//                 i.created_on,
//                 i.altered_on,
//                 d.Aj_A_id,
//                 d.name_item_id,
//                 d.name_item_id AS Item_Id,
//                 pm.Product_Name,
//                 d.bill_qty,
//                 d.rate,
//                 d.amount,
//                 d.act_qty,
//                 d.Adj_Payment
//             FROM [dbo].[tbl_Stock_Adjustment_Info] i
//             LEFT JOIN [dbo].[tbl_Godown_Master] g 
//                 ON i.Adj_ledger_id = g.Godown_Id
//             LEFT JOIN [dbo].[tbl_Stock_Adjustment_Details] d 
//                 ON i.Aj_id = d.Aj_id
//             LEFT JOIN [dbo].[tbl_Product_Master] pm
//                 ON d.name_item_id = pm.Product_Id
//             ORDER BY  i.invoice_no  desc
//         `);


//         const groupedMap = new Map();

//         for (const row of result.recordset) {
//             if (!groupedMap.has(row.Aj_id)) {
           
//                 groupedMap.set(row.Aj_id, {
//                     Aj_id:       row.Aj_id,
//                     invoice_no:  row.invoice_no,
//                     Adj_date:    row.Adj_date,
//                     godown_id:   row.godown_id,
//                     godown_name: row.godown_name,
//                     total_value: row.total_value,
//                     narration:   row.narration,
//                     Adjust_Type: row.Adjust_Type,
//                     created_on:  row.created_on,
//                     altered_on:  row.altered_on,
//                     godown_name:row.godown_name,
//                     details: []
//                 });
//             }


//             if (row.Aj_A_id) {
//                 groupedMap.get(row.Aj_id).details.push({
//                     Aj_A_id:      row.Aj_A_id,
//                     Aj_id:        row.Aj_id,
//                     name_item_id: row.name_item_id,
//                     Item_Id:      row.Item_Id,      
//                     Product_Name: row.Product_Name,
//                     bill_qty:     row.bill_qty,
//                     act_qty:      row.act_qty,
//                     rate:         row.rate,
//                     amount:       row.amount,
//                     Adj_Payment:  row.Adj_Payment,
//                 });
//             }
//         }

//         const adjustments = Array.from(groupedMap.values());

//         return res.status(200).json({
//             success: true,
//             message: 'Stock adjustments fetched successfully',
//             adjustments
//         });

//     } catch (e) {
//         servError(e, res);
//     }
// };


const getStockAdjustment = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT 
                i.Aj_id,
                i.invoice_no,
                i.Adj_date,
                i.Adj_ledger_id AS godown_id,
                ISNULL(g.Godown_Name, 'Unassigned') AS godown_name,
                i.total_value,
                i.narration,
                i.Adjust_Type,
                i.created_on,
                i.altered_on,
                d.Aj_A_id,
                d.name_item_id,
                d.name_item_id AS Item_Id,
                pm.Product_Name,
                d.bill_qty,
                d.rate,
                d.amount,
                d.act_qty,
                d.Adj_Payment
            FROM [dbo].[tbl_Stock_Adjustment_Info] i
            LEFT JOIN [dbo].[tbl_Godown_Master] g 
                ON i.Adj_ledger_id = g.Godown_Id
            LEFT JOIN [dbo].[tbl_Stock_Adjustment_Details] d 
                ON i.Aj_id = d.Aj_id
            LEFT JOIN [dbo].[tbl_Product_Master] pm
                ON d.name_item_id = pm.Product_Id
            ORDER BY i.invoice_no DESC, d.Aj_A_id
        `);

        const adjustments = result.recordset.map(row => ({
            Aj_id: row.Aj_id,
            invoice_no: row.invoice_no,
            Adj_date: row.Adj_date,
            godown_id: row.godown_id,
            godown_name: row.godown_name,
            total_value: row.total_value,
            narration: row.narration,
            Adjust_Type: row.Adjust_Type,
            created_on: row.created_on,
            altered_on: row.altered_on,
            Aj_A_id: row.Aj_A_id || null,
            name_item_id: row.name_item_id || null,
            Item_Id: row.Item_Id || null,
            Product_Name: row.Product_Name || null,
            bill_qty: row.bill_qty || null,
            act_qty: row.act_qty || null,
            rate: row.rate || null,
            amount: row.amount || null,
            Adj_Payment: row.Adj_Payment || null
        }));

        return res.status(200).json({
            success: true,
            message: 'Stock adjustments fetched successfully',
            data: adjustments,
            totalRecords: adjustments.length
        });

    } catch (e) {
        servError(e, res);
    }
};

const createStockJournalAdjustment = async (req, res) => {
    try {
        const { adjustmentDetails, Product_Array } = req.body;
        const { godownId, adjustmentType,Adj_date } = adjustmentDetails;


        if (!Product_Array || Product_Array.length === 0) {
            return res.status(400).json({ success: false, message: 'Product details are required' });
        }

        
        const maxIdResult = await sql.query(`
            SELECT ISNULL(MAX(Aj_id), 0) + 1 AS Next_Id 
            FROM tbl_Stock_Adjustment_Info
        `);
        const nextAjId = maxIdResult.recordset[0].Next_Id;

        const invoiceNo = `STAJ${String(nextAjId).padStart(4, '0')}`;

        const totalValue = Product_Array.reduce((sum, item) => sum + (parseFloat(item.Amount) || 0), 0);
    

        await sql.query(`
            INSERT INTO tbl_Stock_Adjustment_Info 
                (Aj_id, invoice_no, Adj_date, Adj_ledger_id, total_value, narration, created_on, altered_on, Adjust_Type)
            VALUES 
                (
                    ${nextAjId},
                    '${invoiceNo}',
                    '${Adj_date}',
                    ${godownId || 0},
                    ${totalValue},
                    '${(req.body.narration || '').replace(/'/g, "''")}',
                    GETDATE(),
                    GETDATE(),
                    ${adjustmentType}
                )
        `);

       
        const maxDetailIdResult = await sql.query(`
            SELECT ISNULL(MAX(Aj_A_id), 0) + 1 AS Next_Detail_Id 
            FROM tbl_Stock_Adjustment_Details
        `);
        let nextDetailId = maxDetailIdResult.recordset[0].Next_Detail_Id;


        for (const item of Product_Array) {
    await sql.query(`
        INSERT INTO tbl_Stock_Adjustment_Details 
            (Aj_id, name_item_id, bill_qty, rate, amount, act_qty, Adj_Payment)
        VALUES 
            (
                ${nextAjId},
                ${item.Item_Id || 0},
                ${parseFloat(item.Bill_Qty) || 0},
                ${parseFloat(item.Item_Rate) || 0},
                ${parseFloat(item.Amount) || 0},
                ${parseFloat(item.Act_Qty) || 0},
                ${parseFloat(item.Adj_Payment) || 0}
            )
    `);
}

        return res.status(200).json({
            success: true,
            message: 'Stock adjustment created successfully',
            others: {
                Id: nextAjId,
                Invoice_No: invoiceNo
            }
        });

    } catch (e) {
        servError(e, res);
    }
};

const updateStockJournalAdjustment = async (req, res) => {
    try {
        const { adjustmentDetails, Product_Array, Aj_id, narration,invoiceNo } = req.body;
        const { godownId, adjustmentType } = adjustmentDetails;
        

        const existCheck = await sql.query(`
            SELECT Aj_id, created_on, invoice_no 
            FROM tbl_Stock_Adjustment_Info 
            WHERE Aj_id = ${Aj_id}
        `);

       
        const existingRecord = existCheck.recordset[0];

        
        const totalValue = Product_Array.reduce((sum, item) => {
            return sum + (parseFloat(item.Amount) || 0);
        }, 0);

       
        

      
        const updateInfoQuery = `
            UPDATE tbl_Stock_Adjustment_Info 
            SET 
                invoice_no = '${invoiceNo}',
                Adj_date = GETDATE(),
                Adj_ledger_id = ${godownId},
                total_value = ${totalValue},
                narration = '${(narration || '').replace(/'/g, "''")}',
                altered_on = GETDATE(),
                Adjust_Type = ${adjustmentType}
            WHERE Aj_id = ${Aj_id}
        `;
        
        await sql.query(updateInfoQuery);


        const deleteDetailsQuery = `
            DELETE FROM tbl_Stock_Adjustment_Details 
            WHERE Aj_id = ${Aj_id}
        `;
        
        await sql.query(deleteDetailsQuery);

        
        for (const item of Product_Array) {
     
            if (!item.Item_Id) {
                console.warn("Skipping item without Item_Id:", item);
                continue;
            }

            const insertDetailsQuery = `
                INSERT INTO tbl_Stock_Adjustment_Details 
                    (Aj_id, name_item_id, bill_qty, rate, amount, act_qty, Adj_Payment)
                VALUES 
                    (
                        ${Aj_id},
                        ${item.Item_Id},
                        ${parseFloat(item.Bill_Qty) || 0},
                        ${parseFloat(item.Item_Rate) || 0},
                        ${parseFloat(item.Amount) || 0},
                        ${parseFloat(item.Act_Qty) || 0},
                        ${parseFloat(item.Adj_Payment) || 0}
                    )
            `;
            
       
            await sql.query(insertDetailsQuery);
        }

         return success(res, 'Journal Updated Successfully');

    }  catch (e) {
        servError(e, res);
    }
};




const createLedgerOpeningBalance = async (req, res) => {
    let transaction = null;

    try {
        const { ob_date, ledger_data = [] } = req.body;
        
      
        if (!ob_date || !Array.isArray(ledger_data) || ledger_data.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        
        const pool = await sql.connect();
        transaction = new sql.Transaction();
        await transaction.begin();

        const formattedOBDate = new Date(ob_date);
        const dateOnly = formattedOBDate.toISOString().split('T')[0];
        
       
        await new sql.Request(transaction).query(`TRUNCATE TABLE tbl_OB_Date`);
        
       
        const existingRecord = await new sql.Request(transaction)
            .input('Led_OB_DATE', sql.DateTime, formattedOBDate)
            .query(`
                SELECT Led_OB_ID, Led_OB_DATE 
                FROM tbl_Ledger_OB 
                WHERE CAST(Led_OB_DATE AS DATE) = CAST(@Led_OB_DATE AS DATE)
            `);
        
        let Led_OB_ID;
        let isExisting = false;
        
        if (existingRecord.recordset.length > 0) {
            Led_OB_ID = existingRecord.recordset[0].Led_OB_ID;
            isExisting = true;
            
            const deleteResult = await new sql.Request(transaction)
                .input('OB_Id', sql.Int, Led_OB_ID)
                .query(`DELETE FROM tbl_Ledger_Opening_Balance WHERE OB_Id = @OB_Id`);
            
           
             await new sql.Request(transaction)
                .input('Id', sql.Int, Led_OB_ID)
                .input('OB_Date', sql.DateTime, formattedOBDate)
                .input('Is_Active', sql.Int, 1)
                .query(`INSERT INTO tbl_OB_Date (Id, OB_Date, Is_Active) VALUES (@Id, @OB_Date, @Is_Active)`);
           
            
        } else {
       
            const idResult = await new sql.Request(transaction).query(`
                SELECT ISNULL(MAX(Led_OB_ID), 0) + 1 AS Led_OB_ID FROM tbl_Ledger_OB
            `);
            Led_OB_ID = idResult.recordset[0].Led_OB_ID;
       
            

            await new sql.Request(transaction)
                .input('Led_OB_ID', sql.Int, Led_OB_ID)
                .input('Led_OB_DATE', sql.DateTime, formattedOBDate)
                .query(`INSERT INTO tbl_Ledger_OB (Led_OB_ID, Led_OB_DATE) VALUES (@Led_OB_ID, @Led_OB_DATE)`);
            
        
            await new sql.Request(transaction)
                .input('Id', sql.Int, Led_OB_ID)
                .input('OB_Date', sql.DateTime, formattedOBDate)
                .input('Is_Active', sql.Int, 1)
                .query(`INSERT INTO tbl_OB_Date (Id, OB_Date, Is_Active) VALUES (@Id, @OB_Date, @Is_Active)`);
         }
        
        
        const uniqueNames = [...new Set(ledger_data.map(l => l.ledger_name).filter(Boolean))];
       
        const accountMap = {};
        const missingLedgers = [];

        if (uniqueNames.length > 0) {
           for (let i = 0; i < uniqueNames.length; i += 500) {
                const batch = uniqueNames.slice(i, i + 500);
                const placeholders = batch.map((_, idx) => `@name${idx}`).join(',');
                const accRequest = new sql.Request(transaction);
                
                batch.forEach((name, idx) => {
                    accRequest.input(`name${idx}`, sql.NVarChar(255), name);
                });
                
                const result = await accRequest.query(`
                    SELECT Acc_Id, Account_name 
                    FROM tbl_Account_Master 
                    WHERE Account_name IN (${placeholders})
                `);
                
                result.recordset.forEach(row => {
                    accountMap[row.Account_name] = row.Acc_Id;
                });
            }
            
            for (const name of uniqueNames) {
                if (!accountMap[name]) {
                    missingLedgers.push(name);
                }
            }
            
        }


        
        const validRecords = [];
        const skippedRecords = [];
        let skippedCount = 0;
        let duplicateCount = 0;
        
        const seenBills = new Map();

        for (let idx = 0; idx < ledger_data.length; idx++) {
            const ledger = ledger_data[idx];
            const rowNumber = idx + 2;
            
 
            const accId = accountMap[ledger.ledger_name];
            if (!accId) {
                skippedCount++;
                skippedRecords.push({
                    row: rowNumber,
                    ledger_name: ledger.ledger_name,
                    reason: 'Ledger name not found in Account Master'
                });
                continue;
            }
            
 
            const billKey = `${accId}_${ledger.bill_no}`;
            if (seenBills.has(billKey)) {
                duplicateCount++;
                skippedRecords.push({
                    row: rowNumber,
                    ledger_name: ledger.ledger_name,
                    bill_no: ledger.bill_no,
                    reason: 'Duplicate bill number for same retailer in this upload'
                });
                continue;
            }
            seenBills.set(billKey, rowNumber);
            
         
            let billDate = null;
            try {
                if (ledger.bill_date) {
                    billDate = new Date(ledger.bill_date);
                    if (isNaN(billDate.getTime())) {
                        billDate = null;
                    }
                }
            } catch (dateErr) {
                billDate = null;
            }
            
           
            validRecords.push({
                Retailer_id: accId,
                ledger_name: (ledger.ledger_name || '').substring(0, 255),
                OB_date: formattedOBDate,
                bill_date: billDate,
                bill_no: (ledger.bill_no || '').substring(0, 100),
                amount: Number(ledger.amount) || 0,
                dr_amount: Number(ledger.dr_amount) || 0,
                cr_amount: Number(ledger.cr_amount) || 0,
                Bill_Company: ledger.bill_company ? String(ledger.bill_company).substring(0, 255) : null,
                OB_Id: Led_OB_ID
            });
        }

    
        if (validRecords.length === 0) {
            throw new Error(`No valid records found. ${skippedCount} records were skipped.`);
        }

       const BATCH_SIZE = 150;
        let insertedCount = 0;
        
        for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
            const batch = validRecords.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);
           
          
            let insertQuery = `
                INSERT INTO tbl_Ledger_Opening_Balance (
                    Retailer_id, ledger_name, OB_date, bill_date, bill_no,
                    amount, dr_amount, cr_amount, Bill_Company, OB_Id
                )
                VALUES 
            `;
            
            const valueStrings = batch.map((record) => {
                const ledgerName = record.ledger_name.replace(/'/g, "''");
                const billNo = record.bill_no.replace(/'/g, "''");
                const billCompany = record.Bill_Company ? record.Bill_Company.replace(/'/g, "''") : null;
                
                const obDateStr = record.OB_date.toISOString().slice(0, 19).replace('T', ' ');
                const billDateStr = record.bill_date ? record.bill_date.toISOString().slice(0, 19).replace('T', ' ') : 'NULL';
                
                return `(
                    ${record.Retailer_id}, 
                    '${ledgerName}', 
                    '${obDateStr}', 
                    ${billDateStr === 'NULL' ? 'NULL' : `'${billDateStr}'`},
                    '${billNo}', 
                    ${record.amount}, 
                    ${record.dr_amount}, 
                    ${record.cr_amount}, 
                    ${billCompany ? `'${billCompany}'` : 'NULL'},
                    ${record.OB_Id}
                )`;
            }).join(',');
            
            insertQuery += valueStrings;
            
            try {
                await new sql.Request(transaction).query(insertQuery);
                insertedCount += batch.length;
      
            } catch (batchError) {
                console.error(`   ❌ Batch ${batchNumber} failed:`, batchError.message);
                throw new Error(`Batch ${batchNumber} failed: ${batchError.message}`);
            }
        }

        await transaction.commit();
        
        const responseMessage = {
            success: true,
            message: `${isExisting ? 'Updated' : 'Created'} opening balance: ${insertedCount} out of ${ledger_data.length} records. ${skippedCount} records skipped.`
        };

        res.json(responseMessage);

    } catch (error) {
        console.error('Database error:', error);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        res.status(500).json({ 
            success: false, 
            message: error.message
        });
    }
};



const createStockOpeningBalance = async (req, res) => {
    let transaction = null;

    try {
        const { ob_date, st_item_name = [], goodown_name = [], batch_no = [], st_qty = [], st_alt_qty = [], rate = [], amount = [] } = req.body;
        
      
        if (!ob_date || !Array.isArray(st_item_name) || st_item_name.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        
        // Combine data into array of objects
        const ledger_data = st_item_name.map((item, index) => ({
            st_item_name: item,
            goodown_name: goodown_name[index] || '',
            batch_no: batch_no[index] || '',
            st_qty: st_qty[index] || 0,
            st_alt_qty: st_alt_qty[index] || 0,
            rate: rate[index] || 0,
            amount: amount[index] || 0
        }));
        
        const pool = await sql.connect();
        transaction = new sql.Transaction();
        await transaction.begin();

    
        const dateObj = new Date(ob_date);
        const formattedOBDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        
      
        await new sql.Request(transaction).query(`TRUNCATE TABLE tbl_OB_ST_Date`);
        

        const existingRecord = await new sql.Request(transaction)
            .input('STCK_DATE', sql.Date, formattedOBDate)
            .query(`
                SELECT STCK_ID, STCK_DATE 
                FROM tbl_Stock_OB 
                WHERE CAST(STCK_DATE AS DATE) = CAST(@STCK_DATE AS DATE)
            `);
        
        let STCK_ID;
        let isExisting = false;
        
        if (existingRecord.recordset.length > 0) {
          
            STCK_ID = existingRecord.recordset[0].STCK_ID;
            isExisting = true;
            
         
            await new sql.Request(transaction)
                .input('OB_Id', sql.Int, STCK_ID)
                .query(`DELETE FROM tbl_Stock_Opening_Balance WHERE OB_Id = @OB_Id`);
            
        
            await new sql.Request(transaction)
                .input('OB_Id', sql.Int, STCK_ID)
                .input('OB_Date', sql.Date, formattedOBDate)
                .query(`INSERT INTO tbl_OB_ST_Date (OB_Id, OB_Date) VALUES (@OB_Id, @OB_Date)`);
            
        } else {
           
            const idResult = await new sql.Request(transaction).query(`
                SELECT ISNULL(MAX(STCK_ID), 0) + 1 AS STCK_ID FROM tbl_Stock_OB
            `);
            STCK_ID = idResult.recordset[0].STCK_ID;
            
           
            await new sql.Request(transaction)
                .input('STCK_ID', sql.Int, STCK_ID)
                .input('STCK_DATE', sql.Date, formattedOBDate)
                .query(`INSERT INTO tbl_Stock_OB (STCK_ID, STCK_DATE) VALUES (@STCK_ID, @STCK_DATE)`);
            
        
            await new sql.Request(transaction)
                .input('OB_Id', sql.Int, STCK_ID)
                .input('OB_Date', sql.Date, formattedOBDate)
                .query(`INSERT INTO tbl_OB_ST_Date (OB_Id, OB_Date) VALUES (@OB_Id, @OB_Date)`);
        }
        
        
        const uniqueProductNames = [...new Set(ledger_data.map(l => l.st_item_name).filter(Boolean))];
        const uniqueGodownNames = [...new Set(ledger_data.map(l => l.goodown_name).filter(Boolean))];
        
 
        const productMap = {};
        const missingProducts = [];
        
        if (uniqueProductNames.length > 0) {
            for (let i = 0; i < uniqueProductNames.length; i += 500) {
                const batch = uniqueProductNames.slice(i, i + 500);
                const placeholders = batch.map((_, idx) => `@name${idx}`).join(',');
                const prodRequest = new sql.Request(transaction);
                
                batch.forEach((name, idx) => {
                    prodRequest.input(`name${idx}`, sql.NVarChar(255), name);
                });
                
                const result = await prodRequest.query(`
                    SELECT Product_Id, Product_Name 
                    FROM tbl_Product_Master 
                    WHERE Product_Name IN (${placeholders})
                `);
                
                result.recordset.forEach(row => {
                    productMap[row.Product_Name] = row.Product_Id;
                });
            }
            
            for (const name of uniqueProductNames) {
                if (!productMap[name]) {
                    missingProducts.push(name);
                }
            }
        }
        
   
        const godownMap = {};
        const missingGodowns = [];
        
        if (uniqueGodownNames.length > 0) {
            for (let i = 0; i < uniqueGodownNames.length; i += 500) {
                const batch = uniqueGodownNames.slice(i, i + 500);
                const placeholders = batch.map((_, idx) => `@name${idx}`).join(',');
                const godownRequest = new sql.Request(transaction);
                
                batch.forEach((name, idx) => {
                    godownRequest.input(`name${idx}`, sql.NVarChar(255), name);
                });
                
                const result = await godownRequest.query(`
                    SELECT Godown_Id, Godown_Name 
                    FROM tbl_Godown_Master 
                    WHERE Godown_Name IN (${placeholders})
                `);
                
                result.recordset.forEach(row => {
                    godownMap[row.Godown_Name] = row.Godown_Id;
                });
            }
            
            for (const name of uniqueGodownNames) {
                if (!godownMap[name]) {
                    missingGodowns.push(name);
                }
            }
        }
        

        const validRecords = [];
        const skippedRecords = [];
        let skippedCount = 0;
        let missingProductCount = 0;
        let missingGodownCount = 0;
        
  
        const obDateForRecords = new Date(formattedOBDate);
        
        for (let idx = 0; idx < ledger_data.length; idx++) {
            const item = ledger_data[idx];
            const rowNumber = idx + 2;
            
         
            const productId = productMap[item.st_item_name];
            if (!productId) {
                skippedCount++;
                missingProductCount++;
                skippedRecords.push({
                    row: rowNumber,
                    product_name: item.st_item_name,
                    reason: 'Product name not found in Product Master'
                });
                continue;
            }
            
          
            const godownId = godownMap[item.goodown_name];
            if (!godownId) {
                skippedCount++;
                missingGodownCount++;
                skippedRecords.push({
                    row: rowNumber,
                    godown_name: item.goodown_name,
                    reason: 'Godown name not found in Godown Master'
                });
                continue;
            }
            
        
            const batchNo = (item.batch_no || 'Primary Batch').substring(0, 100);
            
         
            validRecords.push({
                Product_Id: productId,
                Godown_Id: godownId,
                OB_date: obDateForRecords,
                batch_no: batchNo,
                st_qty: Number(item.st_qty) || 0,
                st_alt_qty: Number(item.st_alt_qty) || 0,
                rate: Number(item.rate) || 0,
                amount: Number(item.amount) || 0,
                OB_Id: STCK_ID
            });
        }
        
        if (validRecords.length === 0) {
            throw new Error(`No valid records found. ${skippedCount} records were skipped. Missing products: ${missingProductCount}, Missing godowns: ${missingGodownCount}`);
        }
        
  
        const BATCH_SIZE = 150;
        let insertedCount = 0;
        
        for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
            const batch = validRecords.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);
            
            let insertQuery = `
                INSERT INTO tbl_Stock_Opening_Balance (
                    Product_Id, Godown_Id, OB_date, batch_no,
                    st_qty, st_alt_qty, rate, amount, OB_Id
                )
                VALUES 
            `;
            
            const valueStrings = batch.map((record) => {
                const batchNo = record.batch_no.replace(/'/g, "''");
           
                const dateStr = record.OB_date.toISOString().split('T')[0];
                
                return `(
                    ${record.Product_Id}, 
                    ${record.Godown_Id}, 
                    '${dateStr}', 
                    '${batchNo}',
                    ${record.st_qty}, 
                    ${record.st_alt_qty}, 
                    ${record.rate}, 
                    ${record.amount},
                    ${record.OB_Id}
                )`;
            }).join(',');
            
            insertQuery += valueStrings;
            
            try {
                await new sql.Request(transaction).query(insertQuery);
                insertedCount += batch.length;
            } catch (batchError) {
                console.error(`Batch ${batchNumber} failed:`, batchError.message);
                throw new Error(`Batch ${batchNumber} failed: ${batchError.message}`);
            }
        }
        

        await transaction.commit();
        
        const responseMessage = {
            success: true,
            message: `${isExisting ? 'Updated' : 'Created'} opening balance: ${insertedCount} out of ${ledger_data.length} records inserted. ${skippedCount} records skipped.`,
            details: {
                stck_id: STCK_ID,
                ob_date: formattedOBDate,
                inserted: insertedCount,
                skipped: skippedCount,
                missing_products: missingProductCount,
                missing_godowns: missingGodownCount,
                skipped_records: skippedRecords.slice(0, 50)
            }
        };
        
        res.json(responseMessage);
        
    } catch (error) {
        console.error('Database error:', error);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        res.status(500).json({ 
            success: false, 
            message: error.message
        });
    }
};


const stockOpeningDetails = async (req, res) => {
    let transaction = null;
    
    try {
        const { OB_date } = req.query;
        
        if (!OB_date) {
            return res.status(400).json({ 
                success: false, 
                message: 'OB_date is required' 
            });
        }


        const formattedDate = new Date(OB_date);
        const dateOnly = formattedDate.toISOString().split('T')[0];


        const obIdResult = await new sql.Request()
            .input('OB_date', sql.Date, formattedDate)
            .query(`
                SELECT *
                FROM tbl_OB_ST_Date 
                WHERE CAST(OB_Date AS DATE) = CAST(@OB_Date AS DATE)
            `);
        
     
        const stockQuery = `
            SELECT 
                sob.stock_opening_balance_id,
                sob.Product_Id,
                pm.Product_Name,
                pm.HSN_Code,
                sob.Godown_Id,
                gm.Godown_Name,
                sob.OB_date,
                sob.batch_no,
                sob.st_qty,
                sob.st_alt_qty,
                sob.rate,
                sob.amount,
                sob.OB_Id
            FROM tbl_Stock_Opening_Balance sob
            LEFT JOIN tbl_Product_Master pm ON sob.Product_Id = pm.Product_Id
            LEFT JOIN tbl_Godown_Master gm ON sob.Godown_Id = gm.Godown_Id
            WHERE sob.OB_date = @OB_Date
        `;
        
        const stockResult = await new sql.Request()
            .input('OB_date', sql.Date, formattedDate)
            .query(stockQuery);

        const ledgerQuery = `
            SELECT 
               
                am.Account_Name as ledger_name,
                lob.OB_date,
                lob.bill_date,
                lob.bill_no,
                lob.amount,
                lob.dr_amount,
                lob.cr_amount,
                lob.Bill_Company,
                lob.OB_Id
            FROM tbl_Ledger_Opening_Balance lob
            LEFT JOIN tbl_Account_Master am ON lob.Retailer_id = am.Acc_Id
            WHERE lob.OB_date = @OB_date
        `;
        
        const ledgerResult = await new sql.Request()
            .input('OB_date', sql.Date, formattedDate)
            .query(ledgerQuery);
        
        // Calculate summary statistics for Stock
        const stockSummary = {
            total_records: stockResult.recordset.length,
            total_quantity: stockResult.recordset.reduce((sum, item) => sum + (parseFloat(item.st_qty) || 0), 0),
            total_alt_quantity: stockResult.recordset.reduce((sum, item) => sum + (parseFloat(item.st_alt_qty) || 0), 0),
            total_amount: stockResult.recordset.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
            unique_products: new Set(stockResult.recordset.map(item => item.Product_Id)).size,
            unique_godowns: new Set(stockResult.recordset.map(item => item.Godown_Id)).size
        };
        
        // Calculate summary statistics for Ledger
        const ledgerSummary = {
            total_records: ledgerResult.recordset.length,
            total_amount: ledgerResult.recordset.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
            total_dr_amount: ledgerResult.recordset.reduce((sum, item) => sum + (parseFloat(item.dr_amount) || 0), 0),
            total_cr_amount: ledgerResult.recordset.reduce((sum, item) => sum + (parseFloat(item.cr_amount) || 0), 0),
            unique_ledgers: new Set(ledgerResult.recordset.map(item => item.Retailer_id)).size
        };
        
        // Group stock data by Godown
        const stockByGodown = {};
        stockResult.recordset.forEach(item => {
            const godownKey = item.Godown_Id;
            if (!stockByGodown[godownKey]) {
                stockByGodown[godownKey] = {
                    godown_id: item.Godown_Id,
                    godown_name: item.Godown_Name,
                    godown_code: item.Godown_Code,
                    records: [],
                    total_quantity: 0,
                    total_amount: 0
                };
            }
            stockByGodown[godownKey].records.push(item);
            stockByGodown[godownKey].total_quantity += parseFloat(item.st_qty) || 0;
            stockByGodown[godownKey].total_amount += parseFloat(item.amount) || 0;
        });
        
        // Group ledger data by Group
        const ledgerByGroup = {};
        ledgerResult.recordset.forEach(item => {
            const groupKey = item.Group_Name || 'Uncategorized';
            if (!ledgerByGroup[groupKey]) {
                ledgerByGroup[groupKey] = {
                    group_name: groupKey,
                    records: [],
                    total_amount: 0,
                    total_dr_amount: 0,
                    total_cr_amount: 0
                };
            }
            ledgerByGroup[groupKey].records.push(item);
            ledgerByGroup[groupKey].total_amount += parseFloat(item.amount) || 0;
            ledgerByGroup[groupKey].total_dr_amount += parseFloat(item.dr_amount) || 0;
            ledgerByGroup[groupKey].total_cr_amount += parseFloat(item.cr_amount) || 0;
        });
        
        const response = {
            success: true,
            data: {
                ob_info: {
                    formatted_date: dateOnly
                },
                stock_opening: {
                    summary: stockSummary,
                    details: stockResult.recordset,
                    grouped_by_godown: Object.values(stockByGodown)
                },
                ledger_opening: {
                    summary: ledgerSummary,
                    details: ledgerResult.recordset,
                    grouped_by_group: Object.values(ledgerByGroup)
                }
            }
        };
        
         dataFound(res, response);
        
    } catch (error) {
        console.error('Error in stockOpeningDetails:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

const getLastObDate = async (req, res) => {
    try {
        const { type } = req.query; // 'ledger' or 'stock'
        
        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'Type parameter is required (ledger or stock)'
            });
        }
        
        let query = '';
        let result = null;
        
        if (type === 'ledger') {
           
            query = `
                SELECT DISTINCT(Led_OB_DATE)
                     as ob_date
                FROM tbl_Ledger_OB
                WHERE Led_OB_DATE IS NOT NULL
                ORDER BY Led_OB_DATE DESC
            `;
            
            result = await new sql.Request().query(query);
            
        } else if (type === 'stock') {
            // Get the latest OB date from tbl_Stock_OB
            query = `
                SELECT distinct( STCK_DATE)
                     as ob_date
                FROM tbl_Stock_OB
                WHERE STCK_DATE IS NOT NULL
                ORDER BY STCK_DATE DESC
            `;
            
            result = await new sql.Request().query(query);
            
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid type parameter. Use "ledger" or "stock"'
            });
        }
        
        if (result.recordset && result.recordset.length > 0) {
            const obDate = result.recordset[0];
            

            let details = [];
            if (type === 'ledger') {
                const detailsQuery = `
                    SELECT DISTINCT(Led_OB_DATE)
                         as ob_date
                    FROM tbl_Ledger_OB
                `;
                
                const detailsResult = await new sql.Request()
                    .input('ob_date', sql.Date, new Date(obDate.ob_date))
                    .query(detailsQuery);
                    
                details = detailsResult.recordset;
                
            } else if (type === 'stock') {
                const detailsQuery = `
                    SELECT distinct(STCK_DATE) as ob_date
                    FROM tbl_Stock_OB
                    ORDER BY ob_date desc
                `;
                
                const detailsResult = await new sql.Request()
                    .input('ob_date', sql.Date, new Date(obDate.ob_date))
                    .query(detailsQuery);
                    
                details = detailsResult.recordset;
            }
            
            return res.status(200).json({
                success: true,
                data: {
                    ob_date: obDate.ob_date,
                    total_records: details.length,
                    type: type,
                    preview_details: details || []
                }
            });
        } else {
            return res.status(404).json({
                success: false,
                message: `No ${type} opening balance records found`
            });
        }
        
    } catch (error) {
        console.error('Error in getLastObDate:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Internal server error'
        });
    }
};

export default { getInventoryReport,getStockAdjustment,createStockJournalAdjustment,updateStockJournalAdjustment,createLedgerOpeningBalance,createStockOpeningBalance,stockOpeningDetails,getLastObDate };
