import sql from 'mssql';
import { servError, sentData,success } from '../../res.mjs';
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
            ORDER BY  i.invoice_no  desc
        `);


        const groupedMap = new Map();

        for (const row of result.recordset) {
            if (!groupedMap.has(row.Aj_id)) {
           
                groupedMap.set(row.Aj_id, {
                    Aj_id:       row.Aj_id,
                    invoice_no:  row.invoice_no,
                    Adj_date:    row.Adj_date,
                    godown_id:   row.godown_id,
                    godown_name: row.godown_name,
                    total_value: row.total_value,
                    narration:   row.narration,
                    Adjust_Type: row.Adjust_Type,
                    created_on:  row.created_on,
                    altered_on:  row.altered_on,
                    godown_name:row.godown_name,
                    details: []
                });
            }


            if (row.Aj_A_id) {
                groupedMap.get(row.Aj_id).details.push({
                    Aj_A_id:      row.Aj_A_id,
                    Aj_id:        row.Aj_id,
                    name_item_id: row.name_item_id,
                    Item_Id:      row.Item_Id,      
                    Product_Name: row.Product_Name,
                    bill_qty:     row.bill_qty,
                    act_qty:      row.act_qty,
                    rate:         row.rate,
                    amount:       row.amount,
                    Adj_Payment:  row.Adj_Payment,
                });
            }
        }

        const adjustments = Array.from(groupedMap.values());

        return res.status(200).json({
            success: true,
            message: 'Stock adjustments fetched successfully',
            adjustments
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
        
        transaction = new sql.Transaction();
        await transaction.begin();

        // Get new ID
        const Led_OB_ID = (await new sql.Request(transaction).query(`
            SELECT ISNULL(MAX(Led_OB_ID), 0) + 1 AS Led_OB_ID FROM tbl_Ledger_OB
        `)).recordset[0].Led_OB_ID;
        
        const formattedOBDate = new Date(ob_date);
        
        // Insert into tbl_Ledger_OB
        await new sql.Request(transaction)
            .input('Led_OB_ID', sql.Int, Led_OB_ID)
            .input('Led_OB_DATE', sql.DateTime, formattedOBDate)
            .query(`INSERT INTO tbl_Ledger_OB (Led_OB_ID, Led_OB_DATE) VALUES (@Led_OB_ID, @Led_OB_DATE)`);

        // Delete existing OB_Date
        await new sql.Request(transaction)
            .input('OB_Id', sql.Int, Led_OB_ID)
            .query(`DELETE FROM tbl_OB_Date WHERE Id = @OB_Id`);

        // Insert new OB_Date
        await new sql.Request(transaction)
            .input('Id', sql.Int, Led_OB_ID)
            .input('OB_Date', sql.DateTime, formattedOBDate)
            .input('Is_Active', sql.Int, 1)
            .query(`INSERT INTO tbl_OB_Date (Id, OB_Date, Is_Active) VALUES (@Id, @OB_Date, @Is_Active)`);

        // Account lookup (batched)
        const uniqueNames = [...new Set(ledger_data.map(l => l.ledger_name).filter(Boolean))];
        const accountMap = {};

        if (uniqueNames.length > 0) {
            for (let i = 0; i < uniqueNames.length; i += 100) {
                const batch = uniqueNames.slice(i, i + 100);
                const accRequest = new sql.Request(transaction);
                
                batch.forEach((name, idx) => {
                    accRequest.input(`name${idx}`, sql.NVarChar(255), name);
                });
                
                const placeholders = batch.map((_, idx) => `@name${idx}`).join(',');
                const result = await accRequest.query(`
                    SELECT Acc_Id, Account_name 
                    FROM tbl_Account_Master 
                    WHERE Account_name IN (${placeholders})
                `);
                
                result.recordset.forEach(row => accountMap[row.Account_name] = row.Acc_Id);
            }
        }

        // Prepare valid records
        const validRecords = [];
        let skippedCount = 0;

        ledger_data.forEach(ledger => {
            const accId = accountMap[ledger.ledger_name];
            if (accId) {
                validRecords.push({
                    Retailer_id: accId,
                    ledger_name: ledger.ledger_name || '',
                    OB_date: formattedOBDate,
                    bill_date: ledger.bill_date ? new Date(ledger.bill_date) : null,
                    due_date: ledger.due_date ? new Date(ledger.due_date) : null,
                    bill_no: ledger.bill_no || '',
                    amount: Number(ledger.amount || 0),
                    dr_amount: Number(ledger.dr_amount || 0),
                    cr_amount: Number(ledger.cr_amount || 0),
                    Bill_Company: ledger.bill_company || null,
                    OB_Id: Led_OB_ID
                });
            } else {
                skippedCount++;
             
            }
        });

        if (validRecords.length === 0) {
            throw new Error('No valid records found. Please check ledger names in Account Master.');
        }

        // BULK INSERT using raw SQL (no parameter limit issue)
        const BATCH_SIZE = 500; // Smaller batch size to avoid query length limits
        
        for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
            const batch = validRecords.slice(i, i + BATCH_SIZE);
            
            // Build raw INSERT query without parameters
            let insertQuery = `
                INSERT INTO tbl_Ledger_Opening_Balance (
                    Retailer_id, ledger_name, OB_date, bill_date, bill_no,
                    amount, dr_amount, cr_amount, Bill_Company, OB_Id
                )
                VALUES 
            `;
            
            const valueStrings = batch.map(record => {
                // Escape single quotes in strings
                const ledgerName = record.ledger_name.replace(/'/g, "''");
                const billNo = record.bill_no.replace(/'/g, "''");
                const billCompany = record.Bill_Company ? record.Bill_Company.replace(/'/g, "''") : null;
                
                return `(
                    ${record.Retailer_id}, 
                    '${ledgerName}', 
                    '${record.OB_date.toISOString().slice(0, 19).replace('T', ' ')}', 
                    ${record.bill_date ? `'${record.bill_date.toISOString().slice(0, 19).replace('T', ' ')}'` : 'NULL'},
                    '${billNo}', 
                    ${record.amount}, 
                    ${record.dr_amount}, 
                    ${record.cr_amount}, 
                    ${billCompany ? `'${billCompany}'` : 'NULL'},
                    ${record.OB_Id}
                )`;
            }).join(',');
            
            insertQuery += valueStrings;
            
            // Execute the raw query
            await new sql.Request(transaction).query(insertQuery);
      
        }

        await transaction.commit();

        res.json({
            success: true,
            message: `✅ Successfully inserted ${validRecords.length} out of ${ledger_data.length} records. ${skippedCount} records skipped (ledger not found).`,
            data: { 
                Led_OB_ID, 
                inserted: validRecords.length, 
                skipped: skippedCount,
                total: ledger_data.length 
            }
        });

    } catch (error) {
       
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        res.status(500).json({ success: false, message: error.message });
    }
};


export default { getInventoryReport,getStockAdjustment,createStockJournalAdjustment,updateStockJournalAdjustment,createLedgerOpeningBalance };
