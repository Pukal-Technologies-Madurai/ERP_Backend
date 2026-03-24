export const purchaseReturnQuery = `
DECLARE @purchaseReturn TABLE (invoiceId NVARCHAR(20) NOT NULL);
INSERT INTO @purchaseReturn (invoiceId)
SELECT purchase.Po_Inv_No 
FROM tbl_Sales_Delivery_Gen_Info AS sales 
JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON TRIM(purchase.Po_Inv_No) = TRIM(sales.Ref_Inv_Number)
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = purchase.Retailer_Id AND rm.AC_Id = @Acc_Id
WHERE 
    purchase.Po_Entry_Date >= @OB_Date AND 
    purchase.Cancel_status = 0 AND 
    sales.Cancel_status <> 0 AND 
    COALESCE(sales.Ref_Inv_Number, '') <> '';
`;

export const salesReturnQuery = `
DECLARE @salesReturn TABLE (invoiceId NVARCHAR(20) NOT NULL);
INSERT INTO @salesReturn (invoiceId)
SELECT purchase.Po_Inv_No 
FROM tbl_Sales_Delivery_Gen_Info AS sales 
JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON TRIM(purchase.Ref_Po_Inv_No) = TRIM(sales.Do_Inv_No) 
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = purchase.Retailer_Id AND rm.AC_Id = @Acc_Id
WHERE 
    sales.Do_Date >= @OB_Date AND 
    sales.Cancel_status <> 0 AND 
    purchase.Cancel_status = 0 AND
    COALESCE(purchase.Ref_Po_Inv_No, '') <> '';
`;

export const purchaseInvFilterQuery = `
DECLARE @filteredPurchaseInv TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredPurchaseInv (voucherId, voucherNumber)
SELECT 
    pig.PIN_Id,
    pig.Po_Inv_No
FROM tbl_Purchase_Order_Inv_Gen_Info AS pig
JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pig.Retailer_Id
LEFT JOIN tbl_Account_Master AS a ON a.ERP_Id = r.ERP_Id
WHERE 
    pig.Cancel_status = 0
    AND a.Acc_Id = @Acc_Id
    AND pig.Po_Entry_Date >= @OB_Date
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = pig.Po_Inv_No)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = pig.Po_Inv_No);
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
    AND cb.dr_amount = 0
    AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = cb.bill_no)
    AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = cb.bill_no);
`;

export const receiptFilterQuery = `
DECLARE @filteredReceipt TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredReceipt (voucherId, voucherNumber)
SELECT 
    rgi.receipt_id,
    rgi.receipt_invoice_no
FROM tbl_Receipt_General_Info AS rgi
WHERE 
    rgi.credit_ledger = @Acc_Id
    AND rgi.receipt_date >= @OB_Date
    AND rgi.status <> 0;
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
    AND jei.DrCr = 'Cr';
`;

export const creditNoteFilterQuery = `
DECLARE @filteredCreditNote TABLE (voucherId INT, voucherNumber NVARCHAR(20));
INSERT INTO @filteredCreditNote (voucherId, voucherNumber)
SELECT 
    cngi.CR_Id,
    cngi.CR_Inv_No
FROM tbl_Credit_Note_Gen_Info AS cngi
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = cngi.Retailer_Id
JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
WHERE 
    am.Acc_Id = @Acc_Id
    AND cngi.CR_Date >= @OB_Date
    AND cngi.Cancel_status <> 0
    AND COALESCE(cngi.Ref_Inv_Number, '') = '';
`;

export const getPurchaseInvOutstanding = () => `
SELECT 
    pig.PIN_Id AS PIN_Id,
    pig.Po_Inv_No AS Po_Inv_No,
    pig.Po_Entry_Date AS Po_Inv_Date,
    a.Acc_Id AS Retailer_Id,
    pig.Total_Before_Tax AS Total_Before_Tax,
    pig.Total_Tax AS Total_Tax, 
    pig.Total_Invoice_value AS Total_Invoice_value,
    'INV' AS dataSource,
    COALESCE(pig.Ref_Po_Inv_No, '') AS bill_ref_number,
    ISNULL(pb.Paid_Amount, 0) AS Paid_Amount,
    ISNULL(jr.journalAdjustment, 0) AS journalAdjustment,
    ISNULL(cn.debitNoteAdjustment, 0) AS debitNoteAdjustment,
    pig.Total_Invoice_value
        - ISNULL(pb.Paid_Amount, 0)
        - ISNULL(jr.journalAdjustment, 0)
        - ISNULL(cn.debitNoteAdjustment, 0) AS BalanceAmount
FROM @filteredPurchaseInv AS fp
JOIN tbl_Purchase_Order_Inv_Gen_Info AS pig ON fp.voucherId = pig.PIN_Id AND fp.voucherNumber = pig.Po_Inv_No
JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pig.Retailer_Id
LEFT JOIN tbl_Account_Master AS a ON a.ERP_Id = r.ERP_Id
-- ************************* PAYMENT *************************
LEFT JOIN (
    SELECT 
        pb.pay_bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) Paid_Amount
    FROM tbl_Payment_Bill_Info AS pb
    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
    JOIN @filteredPurchaseInv AS fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
) pb ON pb.pay_bill_id = pig.PIN_Id AND pb.bill_name = pig.Po_Inv_No
-- ************************* JOURNAL *************************
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) journalAdjustment
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredPurchaseInv AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Dr'
        AND jr.RefType = 'PURCHASE'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = pig.PIN_Id AND jr.RefNo = pig.Po_Inv_No
-- ************************* DEBIT NOTE *************************
LEFT JOIN (
    SELECT 
        Ref_Inv_Number,
        SUM(Total_Invoice_value) debitNoteAdjustment
    FROM tbl_Debit_Note_Gen_Info
    JOIN @filteredPurchaseInv AS fil ON fil.voucherNumber = Ref_Inv_Number
    WHERE Cancel_status <> 0
    GROUP BY Ref_Inv_Number
) cn ON cn.Ref_Inv_Number = pig.Po_Inv_No
`;

export const getPurchaseObOutstanding = () => `
SELECT 
    cb.OB_Id AS bill_id, 
    cb.bill_no AS bill_no, 
    cb.bill_date AS bill_date, 
    cb.Retailer_id AS Retailer_id,  
    0 AS bef_tax, 
    0 AS tot_tax, 
    cb.cr_amount AS Total_Invoice_value, 
    'OB' AS dataSource,
    cb.bill_no AS bill_ref_number,
    ISNULL(pb.Paid_Amount, 0) AS Paid_Amount,
    ISNULL(jr.journalAdjustment, 0) AS journalAdjustment,
    ISNULL(cn.debitNoteAdjustment, 0) AS debitNoteAdjustment,
    cb.cr_amount
        - ISNULL(pb.Paid_Amount, 0)
        - ISNULL(jr.journalAdjustment, 0)
        - ISNULL(cn.debitNoteAdjustment, 0) AS BalanceAmount
FROM @filteredOb AS fo
JOIN tbl_Ledger_Opening_Balance AS cb ON fo.voucherId = cb.OB_Id AND fo.voucherNumber = cb.bill_no
-- ************************* PAYMENT *************************
LEFT JOIN (
    SELECT 
        pb.pay_bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) Paid_Amount
    FROM tbl_Payment_Bill_Info AS pb
    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
    JOIN @filteredOb AS fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
) pb ON pb.pay_bill_id = cb.OB_Id AND pb.bill_name = cb.bill_no
-- ************************* JOURNAL *************************
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) journalAdjustment
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredOb AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Dr'
        AND jr.RefType = 'PURCHASE-OB'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = cb.OB_Id AND jr.RefNo = cb.bill_no
-- ************************* CREDIT NOTE *************************
LEFT JOIN (
    SELECT 
        Ref_Inv_Number,
        SUM(Total_Invoice_value) debitNoteAdjustment
    FROM tbl_Debit_Note_Gen_Info
    JOIN @filteredOb AS fil ON fil.voucherNumber = Ref_Inv_Number
    WHERE Cancel_status <> 0
    GROUP BY Ref_Inv_Number
) cn ON cn.Ref_Inv_Number = cb.bill_no
`;

export const getReceiptOutstanding = () => `
SELECT 
    rgi.receipt_id AS PIN_Id,
    rgi.receipt_invoice_no AS Po_Inv_No,
    rgi.receipt_date AS Po_Inv_Date,
    rgi.credit_ledger AS Retailer_Id,
    0 AS Total_Before_Tax, 
    0 AS Total_Tax,
    rgi.credit_amount AS Total_Invoice_value,
    'RECEIPT' AS dataSource,
    rgi.receipt_invoice_no AS bill_ref_number,
    ISNULL(rp.Paid_Amount, 0) + ISNULL(pb.PayAmount, 0) AS Paid_Amount,
    ISNULL(jr.journalAdjustment, 0) AS journalAdjustment,
    0 AS debitNoteAdjustment,
    rgi.credit_amount - (ISNULL(rp.Paid_Amount, 0) + ISNULL(pb.PayAmount, 0)) - ISNULL(jr.journalAdjustment, 0) AS BalanceAmount
FROM @filteredReceipt AS fr
JOIN tbl_Receipt_General_Info AS rgi ON fr.voucherId = rgi.receipt_id AND fr.voucherNumber = rgi.receipt_invoice_no
-- ************************* RECEIPT (Applied in other places) *************************
LEFT JOIN (
    SELECT 
        rbi.receipt_id,
        rbi.receipt_no,
        SUM(rbi.Credit_Amo) Paid_Amount
    FROM tbl_Receipt_Bill_Info AS rbi
    JOIN @filteredReceipt AS fil ON fil.voucherId = rbi.receipt_id AND fil.voucherNumber = rbi.receipt_no
    GROUP BY rbi.receipt_id, rbi.receipt_no
) rp ON rp.receipt_id = rgi.receipt_id AND rp.receipt_no = rgi.receipt_invoice_no
-- ************************* PAYMENT (Applied against receipt) *************************
LEFT JOIN (
    SELECT 
        pb.pay_bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) PayAmount
    FROM tbl_Payment_Bill_Info AS pb
    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
    JOIN @filteredReceipt AS fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
) pb ON pb.pay_bill_id = rgi.receipt_id AND pb.bill_name = rgi.receipt_invoice_no
-- ************************* JOURNAL *************************
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) journalAdjustment
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredReceipt AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Dr'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = rgi.receipt_id AND jr.RefNo = rgi.receipt_invoice_no
`;

export const getJournalOutstanding = () => `
SELECT
    jgi.JournalId AS PIN_Id,
    jgi.JournalVoucherNo AS Po_Inv_No,
    jgi.JournalDate AS Po_Inv_Date,
    jei.Acc_Id AS Retailer_Id,
    0 AS Total_Before_Tax,
    0 AS Total_Tax,
    jei.Amount AS Total_Invoice_value,
    'JOURNAL' AS dataSource,
    jgi.JournalVoucherNo AS bill_ref_number,
    ISNULL(pb.Paid_Amount, 0) AS Paid_Amount,
    ISNULL(jr.journalAdjustment, 0) AS journalAdjustment,
    0 AS debitNoteAdjustment,
    jei.Amount - ISNULL(pb.Paid_Amount, 0) - ISNULL(jr.journalAdjustment, 0) AS BalanceAmount
FROM @filteredJournal AS fj
JOIN tbl_Journal_General_Info AS jgi ON fj.voucherId = jgi.JournalId AND fj.voucherNumber = jgi.JournalVoucherNo
JOIN tbl_Journal_Entries_Info AS jei ON jgi.JournalAutoId = jei.JournalAutoId AND jei.Acc_Id = @Acc_Id AND jei.DrCr = 'Cr'
LEFT JOIN (
    SELECT 
        pb.pay_bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) Paid_Amount
    FROM tbl_Payment_Bill_Info AS pb
    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
    JOIN @filteredJournal AS fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
) pb ON pb.pay_bill_id = jgi.JournalId AND pb.bill_name = jgi.JournalVoucherNo
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) journalAdjustment
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
`;

export const getCreditNoteOutstanding = () => `
SELECT
    cngi.CR_Id AS PIN_Id,
    cngi.CR_Inv_No AS Po_Inv_No,
    cngi.CR_Date AS Po_Inv_Date,
    am.Acc_Id AS Retailer_Id,
    cngi.Total_Before_Tax AS Total_Before_Tax,
    cngi.Total_Tax AS Total_Tax,
    cngi.Total_Invoice_value AS Total_Invoice_value,
    'CREDIT_NOTE' AS dataSource,
    cngi.CR_Inv_No AS bill_ref_number,
    ISNULL(pb.Paid_Amount, 0) AS Paid_Amount,
    ISNULL(jr.journalAdjustment, 0) AS journalAdjustment,
    0 AS debitNoteAdjustment,
    cngi.Total_Invoice_value - ISNULL(pb.Paid_Amount, 0) - ISNULL(jr.journalAdjustment, 0) AS BalanceAmount
FROM @filteredCreditNote AS fc
JOIN tbl_Credit_Note_Gen_Info AS cngi ON fc.voucherId = cngi.CR_Id AND fc.voucherNumber = cngi.CR_Inv_No
JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = cngi.Retailer_Id
JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
LEFT JOIN (
    SELECT 
        pb.pay_bill_id,
        pb.bill_name,
        SUM(pb.Debit_Amo) Paid_Amount
    FROM tbl_Payment_Bill_Info AS pb
    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
    JOIN @filteredCreditNote AS fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
    WHERE pgi.status <> 0
    GROUP BY pb.pay_bill_id, pb.bill_name
) pb ON pb.pay_bill_id = cngi.CR_Id AND pb.bill_name = cngi.CR_Inv_No
LEFT JOIN (
    SELECT 
        jr.RefId,
        jr.RefNo,
        SUM(jr.Amount) journalAdjustment
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    JOIN @filteredCreditNote AS fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
    WHERE 
        jh.JournalStatus <> 0
        AND je.Acc_Id = @Acc_Id
        AND je.DrCr = 'Dr'
    GROUP BY jr.RefId, jr.RefNo
) jr ON jr.RefId = cngi.CR_Id AND jr.RefNo = cngi.CR_Inv_No
`;
