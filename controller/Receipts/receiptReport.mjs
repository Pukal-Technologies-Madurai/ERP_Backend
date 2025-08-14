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
      DECLARE @Acc_Id NVARCHAR(MAX) = NULL;
      DECLARE @RecentDays INT = 30;

      WITH 
      LedgerList AS (
          SELECT TRY_CAST(value AS INT) AS LedgerId
          FROM STRING_SPLIT(@Acc_Id, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
      ),
      LatestOBDate AS (
          SELECT MAX(OB_Date) AS max_ob_date 
          FROM tbl_OB_Date
      ),
      LedgerDetails AS (
          SELECT 
              lol.Ledger_Tally_Id,
              lol.Ledger_Name,
              lol.Ref_Brokers,
              r.ERP_Id,
              a.Acc_Id
          FROM tbl_Ledger_LOL lol
          JOIN tbl_Retailers_Master r ON r.ERP_Id = lol.Ledger_Tally_Id
          JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
          WHERE (
              @Acc_Id IS NULL 
              OR LTRIM(RTRIM(@Acc_Id)) = '' 
              OR a.Acc_Id IN (SELECT LedgerId FROM LedgerList)
          ) 
      ),
      Sales_Invoice AS (
          SELECT 
              pig.Do_Id AS tally_id,
              pig.Do_Inv_No AS invoice_no,
              pig.Do_Date AS invoice_date,
              a.Acc_Id AS Retailer_Id,
              pig.Total_Invoice_value,
              'INV' AS dataSource,
              COALESCE((
                  SELECT SUM(pb.Credit_Amo)
                  FROM tbl_Receipt_Bill_Info pb
                  JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                  WHERE 
                      pgi.status <> 0
                      AND pgi.receipt_bill_type = 1
                      AND pb.bill_id = pig.Do_Id
                      AND pb.bill_name = pig.Do_Inv_No
              ), 0) AS Paid_Amount,
              b.BranchName AS Bill_Company
          FROM tbl_Sales_Delivery_Gen_Info pig
          JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
          JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
          JOIN tbl_Branch_Master AS b ON b.BranchId = pig.Branch_Id
          WHERE 
              pig.Cancel_status <> 0
              AND pig.Do_Date >= (SELECT max_ob_date FROM LatestOBDate)
              AND pig.Do_Date <= @reqDate
              AND a.Acc_Id IN (SELECT DISTINCT Acc_Id FROM LedgerDetails)
      ),
      Opening_Balance AS (
          SELECT 
              0 AS tally_id,
              cb.bill_no AS invoice_no,
              cb.bill_date AS invoice_date,
              cb.Retailer_id AS Retailer_Id,
              cb.dr_amount AS Total_Invoice_value,
              'OB' AS dataSource,
              COALESCE((
                  SELECT SUM(pb.Credit_Amo)
                  FROM tbl_Receipt_Bill_Info pb
                  JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                  WHERE 
                      pgi.status <> 0
                      AND pgi.receipt_bill_type = 1
                      AND pb.bill_id = 0
                      AND pb.bill_name = cb.bill_no
              ), 0) AS Paid_Amount,
              cb.Bill_Company
          FROM tbl_Ledger_Opening_Balance cb
          WHERE 
              cb.OB_date >= (SELECT max_ob_date FROM LatestOBDate)
              AND cb.OB_date <= @reqDate
              AND cb.cr_amount = 0
              AND cb.Retailer_id IN (SELECT Acc_Id FROM LedgerDetails)
      ),
      Combined_Invoice AS (
          SELECT * FROM Sales_Invoice
          UNION ALL
          SELECT * FROM Opening_Balance
      ),
      LastBillDate AS (
          SELECT 
              Retailer_Id,
              MAX(invoice_date) AS LastInvoiceDate
          FROM Combined_Invoice
          GROUP BY Retailer_Id
      ),
      WithOverdue AS (
          SELECT 
              inv.invoice_no,
              inv.Retailer_Id,
              r.Retailer_Name,
              inv.Total_Invoice_value,
              inv.Paid_Amount,
              COALESCE(inv.Total_Invoice_value - inv.Paid_Amount, 0) AS Bal_Amount,
              DATEDIFF(DAY, inv.invoice_date, @reqDate) AS OverdueDays,
              lbd.LastInvoiceDate
          FROM Combined_Invoice inv
          JOIN tbl_Account_Master a ON a.Acc_Id = inv.Retailer_Id
          JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
          JOIN LastBillDate lbd ON lbd.Retailer_Id = inv.Retailer_Id
          WHERE inv.Paid_Amount < inv.Total_Invoice_value
      )
      SELECT 
          'Regular Billing' AS Category,
          Retailer_Name,
          SUM(CASE WHEN OverdueDays > 30 THEN Bal_Amount ELSE 0 END) AS [Above 30 Pending Amt],
          COUNT(CASE WHEN OverdueDays > 30 THEN 1 ELSE NULL END) AS [Sum of Nos],
          MAX(CASE WHEN OverdueDays > 30 THEN OverdueDays ELSE NULL END) AS [Max of Overdue],
          SUM(Bal_Amount) AS [Overall Outstanding Amt],
          MAX(LastInvoiceDate) AS [Last Bill Date]
      FROM WithOverdue
      WHERE LastInvoiceDate >= DATEADD(DAY, -@RecentDays, @reqDate)
      GROUP BY Retailer_Name
      ORDER BY [Above 30 Pending Amt] DESC;
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
      DECLARE @Acc_Id NVARCHAR(MAX) = NULL;
      DECLARE @RecentDays INT = 30;

      WITH 
      LedgerList AS (
          SELECT TRY_CAST(value AS INT) AS LedgerId
          FROM STRING_SPLIT(@Acc_Id, ',')
          WHERE TRY_CAST(value AS INT) IS NOT NULL
      ),
      LatestOBDate AS (
          SELECT MAX(OB_Date) AS max_ob_date 
          FROM tbl_OB_Date
      ),
      LedgerDetails AS (
          SELECT 
              lol.Ledger_Tally_Id,
              lol.Ledger_Name,
              lol.Ref_Brokers,
              r.ERP_Id,
              a.Acc_Id
          FROM tbl_Ledger_LOL lol
          JOIN tbl_Retailers_Master r ON r.ERP_Id = lol.Ledger_Tally_Id
          JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
          WHERE (
              @Acc_Id IS NULL 
              OR LTRIM(RTRIM(@Acc_Id)) = '' 
              OR a.Acc_Id IN (SELECT LedgerId FROM LedgerList)
          ) 
      ),
      Sales_Invoice AS (
          SELECT 
              pig.Do_Id AS tally_id,
              pig.Do_Inv_No AS invoice_no,
              pig.Do_Date AS invoice_date,
              a.Acc_Id AS Retailer_Id,
              pig.Total_Invoice_value,
              'INV' AS dataSource,
              COALESCE((
                  SELECT SUM(pb.Credit_Amo)
                  FROM tbl_Receipt_Bill_Info pb
                  JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                  WHERE 
                      pgi.status <> 0
                      AND pgi.receipt_bill_type = 1
                      AND pb.bill_id = pig.Do_Id
                      AND pb.bill_name = pig.Do_Inv_No
              ), 0) AS Paid_Amount,
              b.BranchName AS Bill_Company
          FROM tbl_Sales_Delivery_Gen_Info pig
          JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
          JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
          JOIN tbl_Branch_Master AS b ON b.BranchId = pig.Branch_Id
          WHERE 
              pig.Cancel_status <> 0
              AND pig.Do_Date >= (SELECT max_ob_date FROM LatestOBDate)
              AND pig.Do_Date <= @reqDate
              AND a.Acc_Id IN (SELECT DISTINCT Acc_Id FROM LedgerDetails)
      ),
      Opening_Balance AS (
          SELECT 
              0 AS tally_id,
              cb.bill_no AS invoice_no,
              cb.bill_date AS invoice_date,
              cb.Retailer_id AS Retailer_Id,
              cb.dr_amount AS Total_Invoice_value,
              'OB' AS dataSource,
              COALESCE((
                  SELECT SUM(pb.Credit_Amo)
                  FROM tbl_Receipt_Bill_Info pb
                  JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                  WHERE 
                      pgi.status <> 0
                      AND pgi.receipt_bill_type = 1
                      AND pb.bill_id = 0
                      AND pb.bill_name = cb.bill_no
              ), 0) AS Paid_Amount,
              cb.Bill_Company
          FROM tbl_Ledger_Opening_Balance cb
          WHERE 
              cb.OB_date >= (SELECT max_ob_date FROM LatestOBDate)
              AND cb.OB_date <= @reqDate
              AND cb.cr_amount = 0
              AND cb.Retailer_id IN (SELECT Acc_Id FROM LedgerDetails)
      ),
      Combined_Invoice AS (
          SELECT * FROM Sales_Invoice
          UNION ALL
          SELECT * FROM Opening_Balance
      ),
      LastBillDate AS (
          SELECT 
              Retailer_Id,
              MAX(invoice_date) AS LastInvoiceDate
          FROM Combined_Invoice
          GROUP BY Retailer_Id
      ),
      WithOverdue AS (
          SELECT 
              inv.invoice_no,
              inv.Retailer_Id,
              r.Retailer_Name,
              inv.Total_Invoice_value,
              inv.Paid_Amount,
              COALESCE(inv.Total_Invoice_value - inv.Paid_Amount, 0) AS Bal_Amount,
              DATEDIFF(DAY, inv.invoice_date, @reqDate) AS OverdueDays,
              lbd.LastInvoiceDate
          FROM Combined_Invoice inv
          JOIN tbl_Account_Master a ON a.Acc_Id = inv.Retailer_Id
          JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
          JOIN LastBillDate lbd ON lbd.Retailer_Id = inv.Retailer_Id
          WHERE inv.Paid_Amount < inv.Total_Invoice_value
      )
      SELECT 
          'No Recent Billing' AS Category,
          Retailer_Name,
          SUM(CASE WHEN OverdueDays > 30 THEN Bal_Amount ELSE 0 END) AS [Above 30 Pending Amt],
          COUNT(CASE WHEN OverdueDays > 30 THEN 1 ELSE NULL END) AS [Sum of Nos],
          MAX(CASE WHEN OverdueDays > 30 THEN OverdueDays ELSE NULL END) AS [Max of Overdue],
          SUM(Bal_Amount) AS [Overall Outstanding Amt],
          MAX(LastInvoiceDate) AS [Last Bill Date]
      FROM WithOverdue
      WHERE LastInvoiceDate < DATEADD(DAY, -@RecentDays, @reqDate)
      GROUP BY Retailer_Name
      ORDER BY [Above 30 Pending Amt] DESC;
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