import sql from 'mssql';
import { servError, sentData, invalidInput, } from '../../res.mjs';
import { isEqualNumber, ISOString, stringCompare } from '../../helper_functions.mjs';

const ReceiptReport = () => {

    const getOutstadingAbove = async (req, res) => {
        try {
            const { reqDate } = req.query;
            if (!reqDate) return invalidInput(res, 'reqDate is required');

            const parsedDate = new Date(reqDate);
            if (isNaN(parsedDate.getTime())) {
                return invalidInput(res, 'Invalid reqDate format. Use YYYY-MM-DD.');
            }

            const request = new sql.Request();


            request.input('reqDate', sql.Date, parsedDate);


            const query = `EXEC Outstanding_Report_Days_RPT @reqDate`;

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

WITH ReceiptAgg AS (
    SELECT 
        pb.bill_id,
        pb.bill_name,
        SUM(pb.Credit_Amo) AS ReceiptAmount
    FROM tbl_Receipt_Bill_Info pb
    JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
    WHERE pgi.status <> 0
    GROUP BY pb.bill_id, pb.bill_name
),

PaymentAgg AS (
    SELECT 
        pb.pay_bill_id AS bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) AS Paid_Amount
    FROM tbl_Payment_Bill_Info pb
    JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
),

JournalAgg AS (
    SELECT 
        jr.RefId AS bill_id,
        jr.RefNo AS bill_name,
        jr.RefType,
        je.Acc_Id,
        je.DrCr,
        SUM(jr.Amount) AS JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je 
        ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh 
        ON jh.JournalAutoId = jr.JournalAutoId
    WHERE jh.JournalStatus <> 0
    GROUP BY jr.RefId, jr.RefNo, jr.RefType, je.Acc_Id, je.DrCr
),

ReceiptOutstanding AS (
    SELECT 
        rgi.receipt_id AS Bill_Id,
        rgi.receipt_invoice_no AS Bill_No,
        rgi.receipt_date AS Bill_Date,
        rgi.credit_ledger AS Retailer_Id,
        rm.Retailer_Name,
        rgi.credit_amount AS Amount,
        'RECEIPT' AS SourceType,
        'Cr' AS AccountSide,
        (
            SELECT COALESCE(SUM(Credit_Amo), 0)
            FROM tbl_Receipt_Bill_Info pbi
            WHERE pbi.receipt_id = rgi.receipt_id
            AND pbi.receipt_no = rgi.receipt_invoice_no
        ) + (
            SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
            FROM tbl_Payment_Bill_Info AS pb
            JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
            WHERE pgi.status <> 0
            AND pb.pay_bill_id = rgi.receipt_id
            AND pb.bill_name = rgi.receipt_invoice_no
        ) AS Paid_Amount,
        COALESCE((
            SELECT SUM(jr.Amount)
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            WHERE jh.JournalStatus <> 0
            AND je.Acc_Id = rgi.credit_ledger
            AND je.DrCr = 'Dr'
            AND jr.RefId = rgi.receipt_id 
            AND jr.RefNo = rgi.receipt_invoice_no
            AND jr.RefType = 'RECEIPT'
        ), 0) AS JournalAdjustment,
        ISNULL(ra.ReceiptAmount, 0) AS ReceiptAmount,
        (rgi.credit_amount - (
            SELECT COALESCE(SUM(Credit_Amo), 0)
            FROM tbl_Receipt_Bill_Info pbi
            WHERE pbi.receipt_id = rgi.receipt_id
            AND pbi.receipt_no = rgi.receipt_invoice_no
        ) - (
            SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
            FROM tbl_Payment_Bill_Info AS pb
            JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
            WHERE pgi.status <> 0
            AND pb.pay_bill_id = rgi.receipt_id
            AND pb.bill_name = rgi.receipt_invoice_no
        ) - COALESCE((
            SELECT SUM(jr.Amount)
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            WHERE jh.JournalStatus <> 0
            AND je.Acc_Id = rgi.credit_ledger
            AND je.DrCr = 'Dr'
            AND jr.RefId = rgi.receipt_id 
            AND jr.RefNo = rgi.receipt_invoice_no
            AND jr.RefType = 'RECEIPT'
        ), 0)) AS Balance
    FROM tbl_Receipt_General_Info rgi
    JOIN tbl_Account_Master am ON am.Acc_Id = rgi.credit_ledger
    JOIN tbl_Retailers_Master rm ON rm.ERP_Id = am.ERP_Id
    LEFT JOIN ReceiptAgg ra ON ra.bill_id = rgi.receipt_id AND ra.bill_name = rgi.receipt_invoice_no
    WHERE rgi.receipt_date BETWEEN @OB_Date AND @reqDate
    AND rgi.status <> 0
    AND rgi.credit_amount > (
        SELECT COALESCE(SUM(Credit_Amo), 0)
        FROM tbl_Receipt_Bill_Info pbi
        WHERE pbi.receipt_id = rgi.receipt_id
        AND pbi.receipt_no = rgi.receipt_invoice_no
    ) + (
        SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
        FROM tbl_Payment_Bill_Info AS pb
        JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
        WHERE pgi.status <> 0
        AND pb.pay_bill_id = rgi.receipt_id
        AND pb.bill_name = rgi.receipt_invoice_no
    ) + COALESCE((
        SELECT SUM(jr.Amount)
        FROM dbo.tbl_Journal_Bill_Reference jr
        JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
        JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
        WHERE jh.JournalStatus <> 0
        AND je.Acc_Id = rgi.credit_ledger
        AND je.DrCr = 'Dr'
        AND jr.RefId = rgi.receipt_id 
        AND jr.RefNo = rgi.receipt_invoice_no
        AND jr.RefType = 'RECEIPT'
    ), 0)
),

PaymentOutstanding AS (
    SELECT 
        pgi.pay_id AS Bill_Id,
        pgi.payment_invoice_no AS Bill_No,
        pgi.payment_date AS Bill_Date,
        pgi.debit_ledger AS Retailer_Id,
        rm.Retailer_Name,
        pgi.debit_amount AS Amount,
        'PAYMENT' AS SourceType,
        'Dr' AS AccountSide,
        (
            SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
            FROM tbl_Receipt_Bill_Info AS rbi
            JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
            WHERE rgi.status <> 0
            AND rbi.bill_id = pgi.pay_id
            AND rbi.bill_name = pgi.payment_invoice_no
        ) + (
            SELECT COALESCE(SUM(Debit_Amo), 0)
            FROM tbl_Payment_Bill_Info pbi
            WHERE pbi.payment_id = pgi.pay_id
        ) AS Paid_Amount,
        COALESCE((
            SELECT SUM(jr.Amount)
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            WHERE jh.JournalStatus <> 0
            AND je.Acc_Id = pgi.debit_ledger
            AND je.DrCr = 'Cr'
            AND jr.RefId = pgi.pay_id 
            AND jr.RefNo = pgi.payment_invoice_no
            AND jr.RefType = 'PAYMENT'
        ), 0) AS JournalAdjustment,
        0 AS ReceiptAmount,
        (pgi.debit_amount - (
            SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
            FROM tbl_Receipt_Bill_Info AS rbi
            JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
            WHERE rgi.status <> 0
            AND rbi.bill_id = pgi.pay_id
            AND rbi.bill_name = pgi.payment_invoice_no
        ) - (
            SELECT COALESCE(SUM(Debit_Amo), 0)
            FROM tbl_Payment_Bill_Info pbi
            WHERE pbi.payment_id = pgi.pay_id
        ) - COALESCE((
            SELECT SUM(jr.Amount)
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            WHERE jh.JournalStatus <> 0
            AND je.Acc_Id = pgi.debit_ledger
            AND je.DrCr = 'Cr'
            AND jr.RefId = pgi.pay_id 
            AND jr.RefNo = pgi.payment_invoice_no
            AND jr.RefType = 'PAYMENT'
        ), 0)) AS Balance
    FROM tbl_Payment_General_Info pgi
    JOIN tbl_Account_Master am ON am.Acc_Id = pgi.debit_ledger
    JOIN tbl_Retailers_Master rm ON rm.ERP_Id = am.ERP_Id
    WHERE pgi.payment_date BETWEEN @OB_Date AND @reqDate
    AND pgi.status <> 0
    AND pgi.debit_amount > (
        SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
        FROM tbl_Receipt_Bill_Info AS rbi
        JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
        WHERE rgi.status <> 0
        AND rbi.bill_id = pgi.pay_id
        AND rbi.bill_name = pgi.payment_invoice_no
    ) + (
        SELECT COALESCE(SUM(Debit_Amo), 0)
        FROM tbl_Payment_Bill_Info pbi
        WHERE pbi.payment_id = pgi.pay_id
    ) + COALESCE((
        SELECT SUM(jr.Amount)
        FROM dbo.tbl_Journal_Bill_Reference jr
        JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
        JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
        WHERE jh.JournalStatus <> 0
        AND je.Acc_Id = pgi.debit_ledger
        AND je.DrCr = 'Cr'
        AND jr.RefId = pgi.pay_id 
        AND jr.RefNo = pgi.payment_invoice_no
        AND jr.RefType = 'PAYMENT'
    ), 0)
),

RecentReceipts AS (
    -- receipts applied to invoices
    SELECT DISTINCT a.Acc_Id AS Retailer_Id
    FROM tbl_Receipt_General_Info rg
    JOIN tbl_Receipt_Bill_Info rb ON rb.receipt_id = rg.receipt_id
    JOIN tbl_Sales_Delivery_Gen_Info pig ON pig.Do_Id = rb.bill_id AND rb.bill_name = pig.Do_Inv_No
    JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.ERP_Id = rm.ERP_Id
    WHERE rg.status <> 0
      AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @reqDate) AND @reqDate

    UNION

    -- receipts applied to opening balances
    SELECT DISTINCT a.Acc_Id AS Retailer_Id
    FROM tbl_Receipt_General_Info rg
    JOIN tbl_Receipt_Bill_Info rb ON rb.receipt_id = rg.receipt_id
    JOIN tbl_Ledger_Opening_Balance cb ON cb.OB_Id = rb.bill_id AND rb.bill_name = cb.bill_no
    JOIN tbl_Account_Master a ON a.Acc_Id = cb.Retailer_id
    WHERE rg.status <> 0
      AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @reqDate) AND @reqDate

    UNION

    -- receipts applied to purchases
    SELECT DISTINCT a.Acc_Id AS Retailer_Id
    FROM tbl_Receipt_General_Info rg
    JOIN tbl_Receipt_Bill_Info rb ON rb.receipt_id = rg.receipt_id
    JOIN tbl_Purchase_Order_Inv_Gen_Info pig ON pig.PIN_Id = rb.bill_id AND rb.bill_name = pig.Po_Inv_No
    JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.ERP_Id = rm.ERP_Id
    WHERE rg.status <> 0
      AND rg.receipt_date BETWEEN DATEADD(DAY, -30, @reqDate) AND @reqDate
),

Combined AS (
    -- SALES section
    SELECT 
        pig.Do_Id AS Bill_Id,
        pig.Do_Inv_No AS Bill_No,
        pig.Do_Date AS Bill_Date,
        a.Acc_Id AS Retailer_Id,
        r.Retailer_Name,
        pig.Total_Invoice_value AS Amount,
        'SALES' AS SourceType,
        'Dr' AS AccountSide,
        ISNULL(pa.Paid_Amount,0) AS Paid_Amount,
        ISNULL(ja.JournalAmount,0) AS JournalAdjustment,
        ISNULL(ra.ReceiptAmount,0) AS ReceiptAmount,
        (pig.Total_Invoice_value - ISNULL(pa.Paid_Amount,0) - ISNULL(ja.JournalAmount,0) - ISNULL(ra.ReceiptAmount,0)) AS Balance
    FROM tbl_Sales_Delivery_Gen_Info pig
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    LEFT JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
    LEFT JOIN PaymentAgg pa ON pa.bill_id = pig.Do_Id AND pa.bill_name = pig.Do_Inv_No
    LEFT JOIN ReceiptAgg ra ON ra.bill_id = pig.Do_Id AND ra.bill_name = pig.Do_Inv_No
    LEFT JOIN JournalAgg ja 
        ON ja.bill_id = pig.Do_Id 
        AND ja.bill_name = pig.Do_Inv_No 
        AND ja.RefType = 'SALES' 
        AND ja.Acc_Id = a.Acc_Id 
        AND ja.DrCr = 'Cr'
    WHERE pig.Cancel_status <> 0
      AND pig.Do_Date BETWEEN @OB_Date AND @reqDate

    UNION ALL

    -- OB-SALES section
    SELECT 
        cb.OB_Id,
        cb.bill_no,
        cb.bill_date,
        cb.Retailer_id,
        r.Retailer_Name,
        cb.dr_amount,
        'OB-SALES',
        'Dr',
        ISNULL(pa.Paid_Amount,0),
        ISNULL(ja.JournalAmount,0),
        ISNULL(ra.ReceiptAmount,0),
        (cb.dr_amount - ISNULL(pa.Paid_Amount,0) - ISNULL(ja.JournalAmount,0) - ISNULL(ra.ReceiptAmount,0))
    FROM tbl_Ledger_Opening_Balance cb
    JOIN tbl_Account_Master a ON a.Acc_Id = cb.Retailer_id
    JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
    LEFT JOIN PaymentAgg pa ON pa.bill_id = cb.OB_Id AND pa.bill_name = cb.bill_no
    LEFT JOIN ReceiptAgg ra ON ra.bill_id = cb.OB_Id AND ra.bill_name = cb.bill_no
    LEFT JOIN JournalAgg ja 
        ON ja.bill_id = cb.OB_Id 
        AND ja.bill_name = cb.bill_no
        AND ja.RefType = 'SALES-OB' 
        AND ja.Acc_Id = cb.Retailer_id 
        AND ja.DrCr = 'Cr'
    WHERE cb.OB_date BETWEEN @OB_Date AND @reqDate
      AND cb.cr_amount = 0

    UNION ALL

    -- PURCHASE section
    SELECT 
        pig.PIN_Id,
        pig.Po_Inv_No,
        pig.Po_Entry_Date,
        a.Acc_Id,
        r.Retailer_Name,
        pig.Total_Invoice_value,
        'PURCHASE',
        'Cr',
        ISNULL(pa.Paid_Amount,0),
        ISNULL(ja.JournalAmount,0),
        ISNULL(ra.ReceiptAmount,0),
        (pig.Total_Invoice_value - ISNULL(pa.Paid_Amount,0) - ISNULL(ja.JournalAmount,0) - ISNULL(ra.ReceiptAmount,0))
    FROM tbl_Purchase_Order_Inv_Gen_Info pig
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    LEFT JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
    LEFT JOIN PaymentAgg pa ON pa.bill_id = pig.PIN_Id AND pa.bill_name = pig.Po_Inv_No
    LEFT JOIN ReceiptAgg ra ON ra.bill_id = pig.PIN_Id AND ra.bill_name = pig.Po_Inv_No
    LEFT JOIN JournalAgg ja 
        ON ja.bill_id = pig.PIN_Id 
        AND ja.bill_name = pig.Po_Inv_No 
        AND ja.RefType = 'PURCHASE' 
        AND ja.Acc_Id = a.Acc_Id 
        AND ja.DrCr = 'Dr'
    WHERE pig.Cancel_status = 0
      AND pig.Po_Entry_Date BETWEEN @OB_Date AND @reqDate

    UNION ALL

    -- OB-PURCHASE section
    SELECT 
        cb.OB_Id,
        cb.bill_no,
        cb.bill_date,
        cb.Retailer_id,
        r.Retailer_Name,
        cb.cr_amount,
        'OB-PURCHASE',
        'Cr',
        ISNULL(pa.Paid_Amount,0),
        ISNULL(ja.JournalAmount,0),
        ISNULL(ra.ReceiptAmount,0),
        (cb.cr_amount - ISNULL(pa.Paid_Amount,0) - ISNULL(ja.JournalAmount,0) - ISNULL(ra.ReceiptAmount,0))
    FROM tbl_Ledger_Opening_Balance cb
    JOIN tbl_Account_Master a ON a.Acc_Id = cb.Retailer_id
    JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
    LEFT JOIN PaymentAgg pa ON pa.bill_id = cb.OB_Id AND pa.bill_name = cb.bill_no
    LEFT JOIN ReceiptAgg ra ON ra.bill_id = cb.OB_Id AND ra.bill_name = cb.bill_no
    LEFT JOIN JournalAgg ja 
        ON ja.bill_id = cb.OB_Id 
        AND ja.bill_name = cb.bill_no 
        AND ja.RefType = 'PURCHASE-OB' 
        AND ja.Acc_Id = cb.Retailer_id 
        AND ja.DrCr = 'Dr'
    WHERE cb.OB_date BETWEEN @OB_Date AND @reqDate
      AND cb.dr_amount = 0

    UNION ALL

    -- RECEIPT Outstanding section
    SELECT 
        Bill_Id,
        Bill_No,
        Bill_Date,
        Retailer_Id,
        Retailer_Name,
        Amount,
        SourceType,
        AccountSide,
        Paid_Amount,
        JournalAdjustment,
        ReceiptAmount,
        Balance
    FROM ReceiptOutstanding

    UNION ALL

    -- PAYMENT Outstanding section
    SELECT 
        Bill_Id,
        Bill_No,
        Bill_Date,
        Retailer_Id,
        Retailer_Name,
        Amount,
        SourceType,
        AccountSide,
        Paid_Amount,
        JournalAdjustment,
        ReceiptAmount,
        Balance
    FROM PaymentOutstanding
),

WithCalc AS (
    SELECT 
        c.Retailer_Id,
        c.Retailer_Name,
        c.SourceType,
        c.AccountSide,
        c.Balance,
        DATEDIFF(DAY, c.Bill_Date, @reqDate) AS OverdueDays
    FROM Combined c
    WHERE c.Balance > 0
),

NetOutstanding AS (
    SELECT 
        Retailer_Id,
        Retailer_Name,
        SUM(CASE 
            WHEN AccountSide = 'Dr' THEN Balance
            WHEN AccountSide = 'Cr' THEN -Balance
            ELSE 0 
        END) AS NetBalance
    FROM WithCalc
    GROUP BY Retailer_Id, Retailer_Name
)

SELECT 
    wc.Retailer_Id,
    wc.Retailer_Name,
    erp.QPay, 
    lol.Ref_Owners,
    lol.Ref_Brokers,
    lol.File_No,
    
    -- Breakdown by Source Type
    SUM(CASE WHEN wc.SourceType IN ('SALES', 'OB-SALES') AND wc.AccountSide = 'Dr' THEN wc.Balance ELSE 0 END) AS [Sales Outstanding],
    SUM(CASE WHEN wc.SourceType = 'RECEIPT' AND wc.AccountSide = 'Cr' THEN wc.Balance ELSE 0 END) AS [Receipt Outstanding],
    SUM(CASE WHEN wc.SourceType = 'PAYMENT' AND wc.AccountSide = 'Dr' THEN wc.Balance ELSE 0 END) AS [Payment Outstanding],
    
    -- Overdue calculations
    SUM(CASE WHEN wc.OverdueDays > 30 THEN 
        CASE WHEN wc.AccountSide = 'Dr' THEN wc.Balance ELSE -wc.Balance END 
        ELSE 0 END) AS [Above 30 Pending Amt],
        
    COUNT(CASE WHEN wc.OverdueDays > 30 THEN 1 END) AS [Sum of Nos],
    MAX(CASE WHEN wc.OverdueDays > 30 THEN wc.OverdueDays END) AS [Max of Overdue],
    
    -- NET BALANCE
    no.NetBalance AS [Overall Outstanding Amt],
    
    -- Detailed breakdown
    SUM(CASE WHEN wc.SourceType = 'SALES' AND wc.AccountSide = 'Dr' THEN wc.Balance ELSE 0 END) AS [Sales Only],
    SUM(CASE WHEN wc.SourceType = 'OB-SALES' AND wc.AccountSide = 'Dr' THEN wc.Balance ELSE 0 END) AS [OB Sales Only],
    SUM(CASE WHEN wc.SourceType = 'RECEIPT' AND wc.AccountSide = 'Cr' THEN wc.Balance ELSE 0 END) AS [Receipt Only],
    SUM(CASE WHEN wc.SourceType = 'PAYMENT' AND wc.AccountSide = 'Dr' THEN wc.Balance ELSE 0 END) AS [Payment Only]

FROM WithCalc wc
INNER JOIN NetOutstanding no ON no.Retailer_Id = wc.Retailer_Id
INNER JOIN tbl_Account_Master am ON am.Acc_Id = wc.Retailer_Id
LEFT JOIN tbl_Ledger_LOL lol ON lol.Ledger_Tally_Id = am.ERP_Id
LEFT JOIN tbl_Retailers_Master rm ON rm.ERP_Id = am.ERP_Id
LEFT JOIN tbl_ERP_POS_Master erp ON erp.Retailer_Id = rm.Retailer_Id
WHERE wc.Retailer_Id NOT IN (SELECT Retailer_Id FROM RecentReceipts)
GROUP BY wc.Retailer_Id, wc.Retailer_Name, lol.Ref_Owners, lol.Ref_Brokers, 
         erp.QPay, lol.File_No, no.NetBalance
ORDER BY [Above 30 Pending Amt] ASC
            `;

            const result = await request.query(query);
            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    };

    const getChequeTransction = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                -- *********************************  RECEIPT FILTERS *********************************
                    DECLARE @receiptFilter TABLE (receipt_id BIGINT PRIMARY KEY, receipt_number NVARCHAR(20));
                    INSERT INTO @receiptFilter (receipt_id, receipt_number)
                    SELECT DISTINCT rgi.receipt_id, rgi.receipt_invoice_no
                    FROM tbl_Receipt_General_Info AS rgi
                    JOIN tbl_Receipt_Bill_Info AS rbi ON rbi.receipt_id = rgi.receipt_id
                    JOIN tbl_Account_Master AS debAcc ON debAcc.Acc_Id = rgi.debit_ledger
                    WHERE 
                    	rgi.receipt_date BETWEEN @Fromdate AND @Todate 
                    	AND rgi.status <> 0
                    	AND (debAcc.Group_Id = 11 OR debAcc.Group_Id = 22)
                    	AND rbi.JournalBillType = 'SALES RECEIPT';
                -- ********************************* getting receipts *********************************
                    SELECT
                    	rgi.receipt_id,
                    	rgi.receipt_invoice_no,
                    	rgi.receipt_date,
                    	rgi.receipt_voucher_type_id,
                    	rgi.debit_ledger,
                    	rgi.credit_ledger,
                    	rgi.check_no,
                    	rgi.check_date,
                    	rgi.bank_date,
                    	rgi.debit_amount,
                    	rgi.credit_amount,
                    	vm.Voucher_Type AS voucherTypeGet,
                    	debAcc.Account_name AS debitAccountGet,
                    	creAcc.Account_name AS creditAccountGet
                    FROM tbl_Receipt_General_Info AS rgi
                    LEFT JOIN tbl_Voucher_Type AS vm ON vm.Vocher_Type_Id = rgi.receipt_voucher_type_id
                    LEFT JOIN tbl_Account_Master AS debAcc ON debAcc.Acc_Id = rgi.debit_ledger
                    LEFT JOIN tbl_Account_Master AS creAcc ON creAcc.Acc_Id = rgi.credit_ledger
                    JOIN @receiptFilter AS rfltr ON rfltr.receipt_id = rgi.receipt_id;
                -- ********************************* receipt references *********************************
                    SELECT 
                    	rbi.receipt_id,
                    	sdgi.Do_Date AS billDate,
                    	sdgi.Do_Inv_No AS invoiceVoucherNumber,
                    	sdgi.Total_Invoice_value AS invoiceValue,
                    	rbi.Credit_Amo AS paidAmount
                    FROM tbl_Receipt_Bill_Info AS rbi
                    JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                    JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON sdgi.Do_Id = rbi.bill_id AND sdgi.Do_Inv_No = rbi.bill_name
                    JOIN @receiptFilter AS rfil ON rfil.receipt_id = rbi.receipt_id AND rfil.receipt_number = rbi.receipt_no
                -- ********************************* contra references *********************************
                    SELECT
                    	cgi.ContraId,
                    	cgi.ContraVoucherNo AS contraVoucherNumber,
                    	cgi.ContraDate AS contraDate,
                    	cbi.bill_id AS refrenceId,
                    	cbi.bill_no AS refrenceVoucherNumber,
                    	cgi.Amount AS contraAmount,
                    	cgi.CreditAccount AS creditAmount,
                    	debtAcc.Account_name AS debitAccountGet,
                    	creAcc.Account_name AS creditAccountGet,
                    	cgi.Chequeno AS chequeNumber,
                    	cgi.ChequeDate AS chequeDate,
                    	cgi.BankDate AS bankDate,
                    	cgi.Narration AS narration
                    FROM tbl_Contra_Bill_Info AS cbi
                    JOIN tbl_Contra_General_Info AS cgi ON cgi.ContraId = cbi.contra_id
                    JOIN @receiptFilter AS rf ON rf.receipt_id = cbi.bill_id AND rf.receipt_number = cbi.bill_no
                    JOIN tbl_Account_Master AS debtAcc ON debtAcc.Acc_Id = cgi.DebitAccount
                    JOIN tbl_Account_Master AS creAcc ON creAcc.Acc_Id = cgi.CreditAccount
                    WHERE cgi.ContraStatus <> 0;`
                );

            const result = await request;

            const [receipt, billInfo, contra] = result.recordsets;

            const output = receipt.map((row) => {
                const billRef = billInfo.filter(bill => isEqualNumber(bill.receipt_id, row.receipt_id));
                const contraRef = contra.filter(c => (
                    isEqualNumber(c.refrenceId, row.receipt_id) 
                    && stringCompare(c.refrenceVoucherNumber, row.receipt_invoice_no)
                ));

                return {
                    ...row,
                    billRef,
                    contraRef
                }
            });

            sentData(res, output);

        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getOutstadingAbove,
        getoutstandingOver,
        getChequeTransction
    }
}

export default ReceiptReport();