import sql from 'mssql';
import { servError, sentData,success } from '../../res.mjs';
import { isEqualNumber, ISOString } from '../../helper_functions.mjs';

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
            ORDER BY i.Adj_date DESC, i.Aj_id asc, d.name_item_id
        `);

        // ✅ Group flat rows into adjustments with nested details array
        const groupedMap = new Map();

        for (const row of result.recordset) {
            if (!groupedMap.has(row.Aj_id)) {
                // First time seeing this Aj_id — create the parent object
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
                    details: []
                });
            }

            // Push detail row if it has a valid product
            if (row.Aj_A_id) {
                groupedMap.get(row.Aj_id).details.push({
                    Aj_A_id:      row.Aj_A_id,
                    Aj_id:        row.Aj_id,
                    name_item_id: row.name_item_id,
                    Item_Id:      row.Item_Id,       // ✅ frontend needs this
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



export default { getInventoryReport,getStockAdjustment,createStockJournalAdjustment,updateStockJournalAdjustment };
