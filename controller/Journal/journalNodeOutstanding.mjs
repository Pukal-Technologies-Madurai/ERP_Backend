import * as overall from './journalOverallOutstanding.mjs';

export const getBaseBillsQuery = `
    DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
    
    -- Temp tables for filtering
    ${overall.purchaseReturnQuery}
    ${overall.salesReturnQuery}
    
    ${overall.salesInvFilterQuery}
    ${overall.salesObFilterQuery}
    ${overall.receiptFilterQuery}
    ${overall.purchaseInvFilterQuery}
    ${overall.purchaseObFilterQuery}
    ${overall.paymentFilterQuery}
    ${overall.journalFilterQuery}
    ${overall.creditNoteFilterQuery}
    ${overall.debitNoteFilterQuery}

    -- 0: Sales Invoices
    SELECT 
        pig.Do_Id AS voucherId, pig.Do_Inv_No AS voucherNumber, pig.Do_Date AS eventDate,
        a.Acc_Id, pig.Total_Invoice_value AS totalValue,
        'SALES' AS dataSource, 'SALES' AS actualSource, 'Dr' AS accountSide, pig.Narration AS narration
    FROM @filteredSalesInv f
    JOIN tbl_Sales_Delivery_Gen_Info pig ON pig.Do_Id = f.voucherId AND pig.Do_Inv_No = f.voucherNumber
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.Acc_Id = r.AC_Id;

    -- 1: Sales OB
    SELECT 
        cb.OB_Id AS voucherId, cb.bill_no AS voucherNumber, cb.bill_date AS eventDate,
        cb.Retailer_id AS Acc_Id, cb.dr_amount AS totalValue,
        'SALES' AS dataSource, 'SALES-OB' AS actualSource, 'Dr' AS accountSide, '' AS narration
    FROM @filteredSalesOb f
    JOIN tbl_Ledger_Opening_Balance cb ON cb.OB_Id = f.voucherId AND cb.bill_no = f.voucherNumber;

    -- 2: Receipts
    SELECT 
        rgi.receipt_id AS voucherId, rgi.receipt_invoice_no AS voucherNumber, rgi.receipt_date AS eventDate,
        rgi.credit_ledger AS Acc_Id, rgi.credit_amount AS totalValue,
        'RECEIPT' AS dataSource, 'RECEIPT' AS actualSource, 'Cr' AS accountSide, rgi.remarks AS narration
    FROM @filteredReceipt f
    JOIN tbl_Receipt_General_Info rgi ON rgi.receipt_id = f.voucherId AND rgi.receipt_invoice_no = f.voucherNumber;

    -- 3: Purchase Invoices
    SELECT 
        pig.PIN_Id AS voucherId, pig.Po_Inv_No AS voucherNumber, pig.Po_Entry_Date AS eventDate,
        a.Acc_Id, pig.Total_Invoice_value AS totalValue,
        'PURCHASE' AS dataSource, 'PURCHASE' AS actualSource, 'Cr' AS accountSide, pig.Narration AS narration
    FROM @filteredPurchaseInv f
    JOIN tbl_Purchase_Order_Inv_Gen_Info pig ON pig.PIN_Id = f.voucherId AND pig.Po_Inv_No = f.voucherNumber
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.Acc_Id = r.AC_Id;

    -- 4: Purchase OB
    SELECT 
        cb.OB_Id AS voucherId, cb.bill_no AS voucherNumber, cb.bill_date AS eventDate,
        cb.Retailer_id AS Acc_Id, cb.cr_amount AS totalValue,
        'PURCHASE' AS dataSource, 'PURCHASE-OB' AS actualSource, 'Cr' AS accountSide, '' AS narration
    FROM @filteredPurchaseOb f
    JOIN tbl_Ledger_Opening_Balance cb ON cb.OB_Id = f.voucherId AND cb.bill_no = f.voucherNumber;

    -- 5: Payments
    SELECT 
        pgi.pay_id AS voucherId, pgi.payment_invoice_no AS voucherNumber, pgi.payment_date AS eventDate,
        pgi.debit_ledger AS Acc_Id, pgi.debit_amount AS totalValue,
        'PAYMENT' AS dataSource, 'PAYMENT' AS actualSource, 'Dr' AS accountSide, pgi.remarks AS narration
    FROM @filteredPayment f
    JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = f.voucherId AND pgi.payment_invoice_no = f.voucherNumber;

    -- 6: Credit Notes
    SELECT 
        cngi.CR_Id AS voucherId, cngi.CR_Inv_No AS voucherNumber, cngi.CR_Date AS eventDate,
        am.Acc_Id, cngi.Total_Invoice_value AS totalValue,
        'CREDIT_NOTE' AS dataSource, 'CREDIT_NOTE' AS actualSource, 'Cr' AS accountSide, cngi.Narration AS narration
    FROM @filteredCreditNote f
    JOIN tbl_Credit_Note_Gen_Info cngi ON cngi.CR_Id = f.voucherId AND cngi.CR_Inv_No = f.voucherNumber
    JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = cngi.Retailer_Id
    JOIN tbl_Account_Master am ON am.Acc_Id = rm.AC_Id;

    -- 7: Debit Notes
    SELECT 
        dngi.DB_Id AS voucherId, dngi.DB_Inv_No AS voucherNumber, dngi.DB_Date AS eventDate,
        am.Acc_Id, dngi.Total_Invoice_value AS totalValue,
        'DEBIT_NOTE' AS dataSource, 'DEBIT_NOTE' AS actualSource, 'Dr' AS accountSide, dngi.Narration AS narration
    FROM @filteredDebitNote f
    JOIN tbl_Debit_Note_Gen_Info dngi ON dngi.DB_Id = f.voucherId AND dngi.DB_Inv_No = f.voucherNumber
    JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = dngi.Retailer_Id
    JOIN tbl_Account_Master am ON am.Acc_Id = rm.AC_Id;

    -- 8: Journals
    SELECT 
        jgi.JournalId AS voucherId, jgi.JournalVoucherNo AS voucherNumber, jgi.JournalDate AS eventDate,
        jei.Acc_Id, jei.Amount AS totalValue,
        'JOURNAL' AS dataSource, 'JOURNAL' AS actualSource, jei.DrCr AS accountSide, jgi.Narration AS narration
    FROM @filteredJournal f
    JOIN tbl_Journal_General_Info jgi ON jgi.JournalId = f.voucherId AND jgi.JournalVoucherNo = f.voucherNumber
    JOIN tbl_Journal_Entries_Info jei ON jgi.JournalAutoId = jei.JournalAutoId AND jei.DrCr = f.DrCr;
`;

export const getAdjustmentsQuery = `
    DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);

    -- 9: Receipt Adjustments
    SELECT pb.bill_id AS targetVoucherId, pb.bill_name AS targetVoucherNumber, SUM(pb.Credit_Amo) AS amount
    FROM tbl_Receipt_Bill_Info pb
    JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
    WHERE pgi.status <> 0 AND pgi.receipt_date >= @OB_Date
    GROUP BY pb.bill_id, pb.bill_name;

    -- 10: Payment Adjustments
    SELECT pb.pay_bill_id AS targetVoucherId, pb.bill_name AS targetVoucherNumber, SUM(pb.Debit_Amo) AS amount
    FROM tbl_Payment_Bill_Info pb
    JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
    WHERE pgi.status <> 0 AND pgi.payment_date >= @OB_Date
    GROUP BY pb.pay_bill_id, pb.bill_name;

    -- 11: Credit Note Adjustments
    SELECT TRIM(Ref_Inv_Number) AS targetVoucherNumber, SUM(Total_Invoice_value) AS amount
    FROM tbl_Credit_Note_Gen_Info
    WHERE Cancel_status <> 0 AND Ref_Inv_Number IS NOT NULL AND LTRIM(RTRIM(Ref_Inv_Number)) <> '' AND CR_Date >= @OB_Date
    GROUP BY Ref_Inv_Number;

    -- 12: Journal Adjustments
    SELECT jr.RefId AS targetVoucherId, jr.RefNo AS targetVoucherNumber, je.DrCr AS sourceSide, SUM(jr.Amount) AS amount
    FROM dbo.tbl_Journal_Bill_Reference jr
    JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
    JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
    WHERE jh.JournalStatus <> 0 AND jh.JournalDate >= @OB_Date
    GROUP BY jr.RefId, jr.RefNo, je.DrCr;
`;
