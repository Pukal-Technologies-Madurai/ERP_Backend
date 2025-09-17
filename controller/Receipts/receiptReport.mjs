import sql from 'mssql';
import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, randomNumber, toArray, toNumber } from '../../helper_functions.mjs';

const ReceiptReport = () => {

   const getOutstadingAbove = async (req, res) => {
  try {
    const { reqDate } = req.query;

    if (!reqDate) return invalidInput(res, 'reqDate is required');

    const parsedDate = new Date(reqDate);
    if (isNaN(parsedDate.getTime())) {
      return invalidInput(res, 'Invalid reqDate format. Use YYYY-MM-DD.');
    }

    const request = new sql.Request()
      .input('reqDate', sql.Date, parsedDate);

    const query = `
      DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
    

      WITH Combined AS (
        -- Invoices
        SELECT 
            pig.Do_Id AS Bill_Id,
            pig.Do_Inv_No AS Bill_No,
            pig.Do_Date AS Bill_Date,
            a.Acc_Id AS Retailer_Id,
            r.Retailer_Name,
            pig.Total_Invoice_value,
            'INV' AS SourceType,
            COALESCE(
              (SELECT SUM(pb.Credit_Amo)
               FROM tbl_Receipt_Bill_Info pb
               JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
               WHERE pgi.status <> 0
                 AND pb.bill_id = pig.Do_Id
                 AND pb.bill_name = pig.Do_Inv_No), 0
            ) AS Paid_Amount,
            COALESCE(
              (SELECT SUM(jr.Amount)
               FROM dbo.tbl_Journal_Bill_Reference jr
               JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
               JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
               WHERE jh.JournalStatus <> 0
                 AND je.Acc_Id = a.Acc_Id
                 AND je.DrCr = 'Cr'
                 AND jr.RefId = pig.Do_Id
                 AND jr.RefNo = pig.Do_Inv_No
                 AND jr.RefType = 'SALES'), 0
            ) AS JournalAdjustment
        FROM tbl_Sales_Delivery_Gen_Info pig
        JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
        LEFT JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
        WHERE pig.Cancel_status <> 0
          AND pig.Do_Date >= @OB_Date

        UNION ALL

        -- Opening Balance
        SELECT 
            cb.OB_Id,
            cb.bill_no,
            cb.bill_date,
            cb.Retailer_id,
            r.Retailer_Name,
            cb.dr_amount,
            'OB',
            COALESCE(
              (SELECT SUM(pb.Credit_Amo)
               FROM tbl_Receipt_Bill_Info pb
               JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
               WHERE pgi.status <> 0
                 AND pb.bill_id = cb.OB_Id
                 AND pb.bill_name = cb.bill_no), 0
            ) AS Paid_Amount,
            COALESCE(
              (SELECT SUM(jr.Amount)
               FROM dbo.tbl_Journal_Bill_Reference jr
               JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
               JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
               WHERE jh.JournalStatus <> 0
                 AND je.Acc_Id = cb.Retailer_id
                 AND je.DrCr = 'Cr'
                 AND jr.RefId = cb.OB_Id
                 AND jr.RefNo = cb.bill_no
                 AND jr.RefType = 'SALES-OB'), 0
            ) AS JournalAdjustment
        FROM tbl_Ledger_Opening_Balance cb
        JOIN tbl_Account_Master a ON a.Acc_Id = cb.Retailer_id
        JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
        WHERE cb.OB_date >= @OB_Date
          AND cb.cr_amount = 0

        UNION ALL

        -- Payments (treated as possible outstanding items)
        SELECT
            pgi.pay_id,
            pgi.payment_invoice_no,
            pgi.payment_date,
            pgi.debit_ledger,
            r.Retailer_Name,
            pgi.debit_amount,
            'PAYMENT',
            (
              SELECT COALESCE(SUM(rbi.Credit_Amo), 0)
              FROM tbl_Receipt_Bill_Info rbi
              JOIN tbl_Receipt_General_Info rgi ON rgi.receipt_id = rbi.receipt_id
              WHERE rgi.status <> 0
                AND rbi.bill_id = pgi.pay_id
                AND rbi.bill_name = pgi.payment_invoice_no
            ) + (
              SELECT COALESCE(SUM(pb.Debit_Amo), 0)
              FROM tbl_Payment_Bill_Info pb
              WHERE pb.payment_id = pgi.pay_id
                AND pb.payment_no = pgi.payment_invoice_no
            ) AS Paid_Amount,
            COALESCE(
              (SELECT SUM(jr.Amount)
               FROM dbo.tbl_Journal_Bill_Reference jr
               JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
               JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
               WHERE jh.JournalStatus <> 0
                 AND je.Acc_Id = pgi.debit_ledger
                 AND je.DrCr = 'Cr'
                 AND jr.RefId = pgi.pay_id
                 AND jr.RefNo = pgi.payment_invoice_no), 0
            ) AS JournalAdjustment
        FROM tbl_Payment_General_Info pgi
        JOIN tbl_Account_Master a ON a.Acc_Id = pgi.debit_ledger
        JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
        WHERE pgi.payment_date >= @OB_Date
          AND pgi.status <> 0
      ),

      -- Find retailers which had receipts in the last 30 days from @ReqDate (against invoices or OB)
      RecentReceipts AS (
        -- receipts applied to invoices
        SELECT DISTINCT a.Acc_Id AS Retailer_Id
        FROM tbl_Receipt_General_Info rg
        JOIN tbl_Receipt_Bill_Info rb ON rb.receipt_id = rg.receipt_id
        JOIN tbl_Sales_Delivery_Gen_Info pig ON pig.Do_Id = rb.bill_id AND rb.bill_name = pig.Do_Inv_No
        JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = pig.Retailer_Id
        JOIN tbl_Account_Master a ON a.ERP_Id = rm.ERP_Id
        WHERE rg.status <> 0
          AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @ReqDate) AND @ReqDate

        UNION

        -- receipts applied to opening balances
        SELECT DISTINCT a.Acc_Id AS Retailer_Id
        FROM tbl_Receipt_General_Info rg
        JOIN tbl_Receipt_Bill_Info rb ON rb.receipt_id = rg.receipt_id
        JOIN tbl_Ledger_Opening_Balance cb ON cb.OB_Id = rb.bill_id AND rb.bill_name = cb.bill_no
        JOIN tbl_Account_Master a ON a.Acc_Id = cb.Retailer_id
        WHERE rg.status <> 0
          AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @ReqDate) AND @ReqDate
      ),

      WithCalc AS (
        SELECT 
          c.Retailer_Name,
          c.Retailer_Id,
          c.Total_Invoice_value - (c.Paid_Amount + c.JournalAdjustment) AS Balance,
          DATEDIFF(DAY, c.Bill_Date, @ReqDate) AS OverdueDays
        FROM Combined c
        WHERE c.Paid_Amount + c.JournalAdjustment < c.Total_Invoice_value
      )

  SELECT 
    wc.Retailer_Id,
    wc.Retailer_Name,
    erp.QPay, lol.Ref_Owners,
    lol.Ref_Brokers,
    lol.File_No,
    SUM(CASE WHEN wc.OverdueDays > 30 THEN wc.Balance ELSE 0 END) AS [Above 30 Pending Amt],
    COUNT(CASE WHEN wc.OverdueDays > 30 THEN 1 END) AS [Sum of Nos],
    MAX(CASE WHEN wc.OverdueDays > 30 THEN wc.OverdueDays END) AS [Max of Overdue],
    SUM(wc.Balance) AS [Overall Outstanding Amt]
FROM WithCalc wc
INNER JOIN tbl_Account_Master am ON am.Acc_Id = wc.Retailer_Id
LEFT JOIN tbl_Ledger_LOL lol ON am.ERP_Id = lol.Ledger_Tally_Id
-- Join Retailers_Master using ERP_Id from Account_Master
LEFT JOIN tbl_Retailers_Master rm ON rm.ERP_Id = am.ERP_Id
-- Join ERP_POS_Master using Retailer_Id from Retailers_Master
LEFT JOIN tbl_ERP_POS_Master erp ON erp.Retailer_Id = rm.Retailer_Id
WHERE wc.Retailer_Id IN (SELECT Retailer_Id FROM RecentReceipts)
GROUP BY wc.Retailer_Id, wc.Retailer_Name, lol.Ref_Owners, lol.Ref_Brokers, erp.QPay,lol.File_No
ORDER BY [Above 30 Pending Amt] DESC
    `;

    const result = await request.query(query);
    sentData(res, result.recordset);

  } catch (e) {
    servError(e, res);
  }
};


    const getoutstandingOver = async (req, res) => {
        const { reqDate } = req.query;

        if (!reqDate) return invalidInput(res, 'reqDate is required');

        const parsedDate = new Date(reqDate);
        if (isNaN(parsedDate.getTime())) {
            return invalidInput(res, 'Invalid reqDate format. Use YYYY-MM-DD.');
        }

        try {
            const request = new sql.Request()
                .input('reqDate', sql.Date, parsedDate);

            const query = `
  DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);


WITH Combined AS (
    -- Invoices
    SELECT 
        pig.Do_Id AS Bill_Id,
        pig.Do_Inv_No AS Bill_No,
        pig.Do_Date AS Bill_Date,
        CAST(a.Acc_Id AS BIGINT) AS Retailer_Id,
        r.Retailer_Name,
        pig.Total_Invoice_value,
        'INV' AS SourceType,
        COALESCE(
          (SELECT SUM(pb.Credit_Amo)
           FROM tbl_Receipt_Bill_Info pb
           JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
           WHERE pgi.status <> 0
             AND pb.bill_id = pig.Do_Id
             AND pb.bill_name = pig.Do_Inv_No), 0
        ) AS Paid_Amount,
        COALESCE(
          (SELECT SUM(jr.Amount)
           FROM dbo.tbl_Journal_Bill_Reference jr
           JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
           JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
           WHERE jh.JournalStatus <> 0
             AND je.Acc_Id = a.Acc_Id
             AND je.DrCr = 'Cr'
             AND jr.RefId = pig.Do_Id
             AND jr.RefNo = pig.Do_Inv_No
             AND jr.RefType = 'SALES'), 0
        ) AS JournalAdjustment
    FROM tbl_Sales_Delivery_Gen_Info pig
    JOIN tbl_Retailers_Master r ON CAST(r.Retailer_Id AS BIGINT) = CAST(pig.Retailer_Id AS BIGINT)
    LEFT JOIN tbl_Account_Master a ON CAST(a.ERP_Id AS BIGINT) = CAST(r.ERP_Id AS BIGINT)
    WHERE pig.Cancel_status <> 0
      AND pig.Do_Date >= @OB_Date

    UNION ALL

    -- Opening Balance
    SELECT 
        cb.OB_Id,
        cb.bill_no,
        cb.bill_date,
        CAST(cb.Retailer_id AS BIGINT) AS Retailer_Id,
        r.Retailer_Name,
        cb.dr_amount,
        'OB',
        COALESCE(
          (SELECT SUM(pb.Credit_Amo)
           FROM tbl_Receipt_Bill_Info pb
           JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
           WHERE pgi.status <> 0
             AND pb.bill_id = cb.OB_Id
             AND pb.bill_name = cb.bill_no), 0
        ) AS Paid_Amount,
        COALESCE(
          (SELECT SUM(jr.Amount)
           FROM dbo.tbl_Journal_Bill_Reference jr
           JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
           JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
           WHERE jh.JournalStatus <> 0
             AND je.Acc_Id = cb.Retailer_id
             AND je.DrCr = 'Cr'
             AND jr.RefId = cb.OB_Id
             AND jr.RefNo = cb.bill_no
             AND jr.RefType = 'SALES-OB'), 0
        ) AS JournalAdjustment
    FROM tbl_Ledger_Opening_Balance cb
    JOIN tbl_Account_Master a ON CAST(a.Acc_Id AS BIGINT) = CAST(cb.Retailer_id AS BIGINT)
    JOIN tbl_Retailers_Master r ON CAST(r.ERP_Id AS BIGINT) = CAST(a.ERP_Id AS BIGINT)
    WHERE cb.OB_date >= @OB_Date
      AND cb.cr_amount = 0
),

-- Recent receipts in last 30 days
RecentReceipts AS (
    SELECT DISTINCT CAST(a.Acc_Id AS BIGINT) AS Retailer_Id
    FROM tbl_Receipt_General_Info rg
    JOIN tbl_Receipt_Bill_Info rb ON CAST(rb.bill_id AS BIGINT) = CAST(rb.bill_id AS BIGINT)
    JOIN tbl_Retailers_Master rm ON CAST(rm.Retailer_Id AS BIGINT) = CAST(rm.Retailer_Id AS BIGINT)
    JOIN tbl_Account_Master a ON CAST(a.Acc_Id AS BIGINT) = CAST(rm.ERP_Id AS BIGINT)
    WHERE rg.status <> 0
      AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @ReqDate) AND @ReqDate
),

WithCalc AS (
    SELECT 
        c.Retailer_Name,
        c.Retailer_Id,
        c.Total_Invoice_value - (c.Paid_Amount + c.JournalAdjustment) AS Balance,
        DATEDIFF(DAY, c.Bill_Date, @ReqDate) AS OverdueDays
    FROM Combined c
    WHERE c.Paid_Amount + c.JournalAdjustment < c.Total_Invoice_value
)

SELECT 
    wc.Retailer_Id,
    wc.Retailer_Name,
    erp.QPay, lol.Ref_Owners,
    lol.Ref_Brokers,
    lol.File_No,
    SUM(CASE WHEN wc.OverdueDays > 30 THEN wc.Balance ELSE 0 END) AS [Above 30 Pending Amt],
    COUNT(CASE WHEN wc.OverdueDays > 30 THEN 1 END) AS [Sum of Nos],
    MAX(CASE WHEN wc.OverdueDays > 30 THEN wc.OverdueDays END) AS [Max of Overdue],
    SUM(wc.Balance) AS [Overall Outstanding Amt]
FROM WithCalc wc
INNER JOIN tbl_Account_Master am ON am.Acc_Id = wc.Retailer_Id
LEFT JOIN tbl_Ledger_LOL lol ON am.ERP_Id = lol.Ledger_Tally_Id
-- Join Retailers_Master using ERP_Id from Account_Master
LEFT JOIN tbl_Retailers_Master rm ON rm.ERP_Id = am.ERP_Id
-- Join ERP_POS_Master using Retailer_Id from Retailers_Master
LEFT JOIN tbl_ERP_POS_Master erp ON erp.Retailer_Id = rm.Retailer_Id
WHERE wc.Retailer_Id NOT IN (SELECT Retailer_Id FROM RecentReceipts)
GROUP BY wc.Retailer_Id, wc.Retailer_Name, lol.Ref_Owners, lol.Ref_Brokers, erp.QPay,lol.File_No
ORDER BY [Above 30 Pending Amt] DESC       
    `;

            const result = await request.query(query);
            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getOutstadingAbove,
        getoutstandingOver
    }
}

export default ReceiptReport();