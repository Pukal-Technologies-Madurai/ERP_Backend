export const purchaseReturnQuery = `
DECLARE @purchaseReturn TABLE (invoiceId NVARCHAR(20) NOT NULL);
INSERT INTO @purchaseReturn (invoiceId)
SELECT sales.Do_Inv_No 
FROM tbl_Sales_Delivery_Gen_Info AS sales 
JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON TRIM(purchase.Po_Inv_No) = TRIM(sales.Ref_Inv_Number)
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sales.Retailer_Id AND rm.AC_Id = @Acc_Id
WHERE 
    purchase.Po_Entry_Date >= @OB_Date AND 
    purchase.Cancel_status = 0 AND 
    sales.Cancel_status <> 0 AND 
    COALESCE(sales.Ref_Inv_Number, '') <> '';
`;

export const salesReturnQuery = `
DECLARE @salesReturn TABLE (invoiceId NVARCHAR(20) NOT NULL);
INSERT INTO @salesReturn (invoiceId)
SELECT sales.Do_Inv_No 
FROM tbl_Sales_Delivery_Gen_Info AS sales 
JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON TRIM(purchase.Ref_Po_Inv_No) = TRIM(sales.Do_Inv_No) 
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sales.Retailer_Id AND rm.AC_Id = @Acc_Id
WHERE 
    sales.Do_Date >= @OB_Date AND 
    sales.Cancel_status <> 0 AND 
    purchase.Cancel_status = 0 AND
    COALESCE(purchase.Ref_Po_Inv_No, '') <> '';
`;

export const salesInvFilterQuery = `
DECLARE @filteredSalesInv TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredSalesInv (voucherId, voucherNumber)
SELECT 
    pig.Do_Id,
    pig.Do_Inv_No
FROM tbl_Sales_Delivery_Gen_Info AS pig
JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pig.Retailer_Id
LEFT JOIN tbl_Account_Master AS a ON a.Acc_Id = r.AC_Id
WHERE 
    pig.Cancel_status <> 0
    AND a.Acc_Id = @Acc_Id
    AND pig.Do_Date >= @OB_Date
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = pig.Do_Inv_No)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = pig.Do_Inv_No);
`;

export const obFilterQuery = `
DECLARE @filteredOb TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredOb (voucherId, voucherNumber)
SELECT 
    cb.OB_Id,
    cb.bill_no
FROM tbl_Ledger_Opening_Balance cb
WHERE 
    cb.OB_date >= @OB_Date
    AND cb.Retailer_id = @Acc_Id
    AND cb.cr_amount = 0
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = cb.bill_no)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = cb.bill_no);
`;

export const paymentFilterQuery = `
DECLARE @filteredPayment TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredPayment (voucherId, voucherNumber)
SELECT 
    pgi.pay_id,
    pgi.payment_invoice_no
FROM tbl_Payment_General_Info AS pgi
WHERE 
    pgi.debit_ledger = @Acc_Id
    AND pgi.payment_date >= @OB_Date
    AND pgi.status <> 0;
`;

export const journalFilterQuery = `
DECLARE @filteredJournal TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredJournal (voucherId, voucherNumber)
SELECT 
    jgi.JournalId,
    jgi.JournalVoucherNo
FROM tbl_Journal_Entries_Info AS jei
LEFT JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
WHERE 
    jei.Acc_Id = @Acc_Id
    AND jgi.JournalDate >= @OB_Date
    AND jgi.JournalStatus <> 0
    AND jei.DrCr = 'Dr';
`;

export const debitNoteFilterQuery = `
DECLARE @filteredDebitNote TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredDebitNote (voucherId, voucherNumber)
SELECT 
    dngi.DB_Id,
    dngi.DB_Inv_No
FROM tbl_Debit_Note_Gen_Info AS dngi
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dngi.Retailer_Id
JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
WHERE 
    am.Acc_Id = @Acc_Id
    AND dngi.DB_Date >= @OB_Date
    AND dngi.Cancel_status <> 0
    AND COALESCE(dngi.Ref_Inv_Number, '') = '';
`;

export const getInvOutstanding = () => `
SELECT 
    pig.Do_Id AS Do_Id,
    pig.Do_Inv_No AS Do_Inv_No,
    pig.Do_Date AS Do_Date,
    COALESCE(a.Acc_Id,0) AS Retailer_Id,
    pig.Total_Before_Tax AS Total_Before_Tax,
    pig.Total_Tax AS Total_Tax,
    pig.Total_Invoice_value AS Total_Invoice_value,
    'INV' AS dataSource,
    ISNULL(pig.Ref_Inv_Number, pig.Do_Inv_No) AS bill_ref_number,
    ISNULL(rp.ReceiptAmount,0) AS Paid_Amount,
    ISNULL(jr.JournalAmount,0) AS journalAdjustment,
    ISNULL(cn.CreditNoteAmount,0) AS creditNoteAdjustment,
    pig.Total_Invoice_value
        - ISNULL(rp.ReceiptAmount,0)
        - ISNULL(jr.JournalAmount,0)
        - ISNULL(cn.CreditNoteAmount,0) AS BalanceAmount
FROM tbl_Sales_Delivery_Gen_Info pig
JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
LEFT JOIN tbl_Account_Master a ON a.Acc_Id = r.AC_Id
-- ************************* RECEIPT *************************
LEFT JOIN (
    SELECT 
        pb.bill_id,
        pb.bill_name,
        SUM(pb.Credit_Amo) ReceiptAmount
    FROM tbl_Receipt_Bill_Info pb
    JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
    JOIN @filteredSalesInv AS fil ON fil.voucherId = pb.bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.bill_id, pb.bill_name
) rp ON rp.bill_id = pig.Do_Id AND rp.bill_name = pig.Do_Inv_No
-- ************************* JOURNAL *************************
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredSalesInv AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Cr'
        AND jr.RefType = 'SALES'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = pig.Do_Id AND jr.RefNo = pig.Do_Inv_No
-- ************************* CREDIT NOTE *************************
LEFT JOIN (
    SELECT 
        Ref_Inv_Number,
        SUM(Total_Invoice_value) CreditNoteAmount
    FROM tbl_Credit_Note_Gen_Info
    JOIN @filteredSalesInv AS fil ON fil.voucherNumber = Ref_Inv_Number
    WHERE Cancel_status <> 0
    GROUP BY Ref_Inv_Number
) cn ON cn.Ref_Inv_Number = pig.Do_Inv_No
WHERE 
    pig.Cancel_status <> 0
    AND a.Acc_Id = @Acc_Id
    AND pig.Do_Date >= @OB_Date
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = pig.Do_Inv_No)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = pig.Do_Inv_No)
`;

export const getObOutstanding = () => `
SELECT 
    cb.OB_Id AS Do_Id,
    cb.bill_no AS Do_Inv_No,
    cb.bill_date AS Do_Date,
    cb.Retailer_id AS Retailer_Id,
    0 AS Total_Before_Tax,
    0 AS Total_Tax,
    cb.dr_amount AS Total_Invoice_value,
    'OB' AS dataSource,
    cb.bill_no AS bill_ref_number,
    ISNULL(rp.Paid_Amount,0) AS Paid_Amount,
    ISNULL(jr.JournalAmount,0) AS journalAdjustment,
    ISNULL(cn.CreditNoteAmount,0) AS creditNoteAdjustment,
    cb.dr_amount
        - ISNULL(rp.Paid_Amount,0)
        - ISNULL(jr.JournalAmount,0)
        - ISNULL(cn.CreditNoteAmount,0) AS BalanceAmount
FROM tbl_Ledger_Opening_Balance cb
-- ************************* RECEIPT TOTAL *************************
LEFT JOIN (
    SELECT 
        pb.bill_id,
        pb.bill_name,
        SUM(pb.Credit_Amo) AS Paid_Amount
    FROM tbl_Receipt_Bill_Info pb
    JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
    JOIN @filteredOb AS fil ON fil.voucherId = pb.bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.bill_id, pb.bill_name
) rp ON rp.bill_id = cb.OB_Id AND rp.bill_name = cb.bill_no
-- JOURNAL TOTAL
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) AS JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredOb AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.DrCr = 'Cr'
        AND jr.RefType = 'SALES-OB'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = cb.OB_Id AND jr.RefNo = cb.bill_no
-- ************************* CREDIT NOTE TOTAL *************************
LEFT JOIN (
    SELECT 
        Ref_Inv_Number,
        SUM(Total_Invoice_value) AS CreditNoteAmount
    FROM tbl_Credit_Note_Gen_Info
    JOIN @filteredOb AS fil ON fil.voucherNumber = Ref_Inv_Number
    WHERE Cancel_status <> 0
    GROUP BY Ref_Inv_Number
) cn ON cn.Ref_Inv_Number = cb.bill_no
WHERE 
    cb.OB_date >= @OB_Date
    AND cb.Retailer_id = @Acc_Id
    AND cb.cr_amount = 0
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = cb.bill_no)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = cb.bill_no)
`;

export const getPaymentOutstanding = () => `
SELECT
    pgi.pay_id AS Do_Id,
    pgi.payment_invoice_no AS Do_Inv_No,
    pgi.payment_date AS Do_Date,
    pgi.debit_ledger AS Retailer_Id,
    0 AS Total_Before_Tax,
    0 AS Total_Tax,
    pgi.debit_amount AS Total_Invoice_value,
    'PAYMENT' AS dataSource,
    pgi.payment_invoice_no AS bill_ref_number,
    ISNULL(rp.ReceiptAmount, 0) + ISNULL(pb.PayAmount, 0) AS Paid_Amount,
    ISNULL(jr.JournalAmount, 0) AS journalAdjustment,
    0 AS creditNoteAdjustment,
    pgi.debit_amount - (ISNULL(rp.ReceiptAmount, 0) + ISNULL(pb.PayAmount, 0)) - ISNULL(jr.JournalAmount, 0) AS BalanceAmount
FROM tbl_Payment_General_Info AS pgi
LEFT JOIN (
    SELECT 
        rbi.bill_id,
        rbi.bill_name,
        SUM(rbi.Credit_Amo) AS ReceiptAmount 
    FROM tbl_Receipt_Bill_Info AS rbi
    JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
    JOIN @filteredPayment AS fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name
    WHERE rgi.status <> 0
    GROUP BY rbi.bill_id, rbi.bill_name
) rp ON rp.bill_id = pgi.pay_id AND rp.bill_name = pgi.payment_invoice_no
LEFT JOIN (
    SELECT 
        pb.payment_id,
        pb.payment_no,
        SUM(pb.Debit_Amo) AS PayAmount 
    FROM tbl_Payment_Bill_Info AS pb
    JOIN @filteredPayment AS fil ON fil.voucherId = pb.payment_id AND fil.voucherNumber = pb.payment_no
    GROUP BY pb.payment_id, pb.payment_no
) pb ON pb.payment_id = pgi.pay_id AND pb.payment_no = pgi.payment_invoice_no
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredPayment AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Cr'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = pgi.pay_id AND jr.RefNo = pgi.payment_invoice_no
WHERE 
    pgi.debit_ledger     = @Acc_Id
    AND pgi.payment_date >= @OB_Date
    AND pgi.status       <> 0
`;

export const getJournalOutstanding = () => `
SELECT
    jgi.JournalId AS Do_Id,
    jgi.JournalVoucherNo AS Do_Inv_No,
    jgi.JournalDate AS Do_Date,
    jei.Acc_Id AS Retailer_Id,
    0 AS Total_Before_Tax,
    0 AS Total_Tax,
    jei.Amount AS Total_Invoice_value,
    'JOURNAL' AS dataSource,
    Jgi.JournalVoucherNo AS bill_ref_number,
    ISNULL(rp.ReceiptAmount, 0) AS Paid_Amount,
    ISNULL(jr.JournalAmount, 0) AS journalAdjustment,
    0 AS creditNoteAdjustment,
    jei.Amount - ISNULL(rp.ReceiptAmount, 0) - ISNULL(jr.JournalAmount, 0) AS BalanceAmount
FROM tbl_Journal_Entries_Info AS jei
LEFT JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
LEFT JOIN (
    SELECT 
        rbi.bill_id,
        rbi.bill_name,
        SUM(rbi.Credit_Amo) ReceiptAmount 
    FROM tbl_Receipt_Bill_Info AS rbi
    JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
    JOIN @filteredJournal AS fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name
    WHERE rgi.status <> 0
    GROUP BY rbi.bill_id, rbi.bill_name
) rp ON rp.bill_id = jgi.JournalId AND rp.bill_name = jgi.JournalVoucherNo
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredJournal AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Dr'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = jgi.JournalId AND jr.RefNo = jgi.JournalVoucherNo
WHERE 
    jei.Acc_Id				= @Acc_Id
    AND jgi.JournalDate		>= @OB_Date
    AND jgi.JournalStatus	<> 0
    AND jei.DrCr			= 'Dr'
`;

export const getDebitNoteOutstanding = () => `
SELECT
    dngi.DB_Id AS Do_Id,
    dngi.DB_Inv_No AS Do_Inv_No,
    dngi.DB_Date AS Do_Date,
    am.Acc_Id AS Retailer_Id,
    dngi.Total_Before_Tax AS Total_Before_Tax,
    dngi.Total_Tax AS Total_Tax,
    dngi.Total_Invoice_value AS Total_Invoice_value,
    'DEBIT_NOTE' AS dataSource,
    dngi.DB_Inv_No AS bill_ref_number,
    ISNULL(rp.ReceiptAmount, 0) AS Paid_Amount,
    ISNULL(jr.JournalAmount, 0) AS journalAdjustment,
    0 AS creditNoteAdjustment,
    dngi.Total_Invoice_value - ISNULL(rp.ReceiptAmount, 0) - ISNULL(jr.JournalAmount, 0) AS BalanceAmount
FROM tbl_Debit_Note_Gen_Info AS dngi
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dngi.Retailer_Id
JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
LEFT JOIN (
    SELECT 
        rbi.bill_id,
        rbi.bill_name,
        SUM(rbi.Credit_Amo) ReceiptAmount 
    FROM tbl_Receipt_Bill_Info AS rbi
    JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
    JOIN @filteredDebitNote AS fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name
    WHERE rgi.status <> 0
    GROUP BY rbi.bill_id, rbi.bill_name
) rp ON rp.bill_id = dngi.DB_Id AND rp.bill_name = dngi.DB_Inv_No
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) JournalAmount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredDebitNote AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Cr'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = dngi.DB_Id AND jr.RefNo = dngi.DB_Inv_No
WHERE 
    am.Acc_Id				= @Acc_Id
    AND dngi.DB_Date		>= @OB_Date
    AND dngi.Cancel_status  <> 0
    AND COALESCE(dngi.Ref_Inv_Number, '') = ''
`;
