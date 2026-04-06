export const purchaseReturnQuery = `
    DECLARE @purchaseReturn TABLE (purchaseInvoiceId NVARCHAR(20) NOT NULL, salesInvoiceId NVARCHAR(20) NOT NULL);
    INSERT INTO @purchaseReturn (purchaseInvoiceId, salesInvoiceId)
    SELECT purchase.Po_Inv_No, sales.Do_Inv_No 
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
    DECLARE @salesReturn TABLE (purchaseInvoiceId NVARCHAR(20) NOT NULL, salesInvoiceId NVARCHAR(20) NOT NULL);
    INSERT INTO @salesReturn (purchaseInvoiceId, salesInvoiceId)
    SELECT purchase.Po_Inv_No, sales.Do_Inv_No
    FROM tbl_Sales_Delivery_Gen_Info AS sales 
    JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON TRIM(purchase.Ref_Po_Inv_No) = TRIM(sales.Do_Inv_No) 
    JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = purchase.Retailer_Id AND rm.AC_Id = @Acc_Id
    WHERE 
        sales.Do_Date >= @OB_Date AND 
        sales.Cancel_status <> 0 AND 
        purchase.Cancel_status = 0 AND
        COALESCE(purchase.Ref_Po_Inv_No, '') <> '';
`;

export const salesInvFilterQuery = `
    DECLARE @filteredSalesInv TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredSalesInv (voucherId, voucherNumber)
    SELECT pig.Do_Id, pig.Do_Inv_No
    FROM tbl_Sales_Delivery_Gen_Info pig
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
    WHERE 
        pig.Cancel_status <> 0
        AND a.Acc_Id = @Acc_Id
        AND pig.Do_Date >= @OB_Date
        AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.salesInvoiceId = pig.Do_Inv_No)
        AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.salesInvoiceId = pig.Do_Inv_No);
`;

export const salesObFilterQuery = `
    DECLARE @filteredSalesOb TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredSalesOb (voucherId, voucherNumber)
    SELECT cb.OB_Id, cb.bill_no
    FROM tbl_Ledger_Opening_Balance cb
    WHERE 
        cb.OB_date >= @OB_Date
        AND cb.Retailer_id = @Acc_Id
        AND cb.cr_amount = 0
        AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.salesInvoiceId = cb.bill_no)
        AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.salesInvoiceId = cb.bill_no);
`;

export const receiptFilterQuery = `
    DECLARE @filteredReceipt TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredReceipt (voucherId, voucherNumber)
    SELECT rgi.receipt_id, rgi.receipt_invoice_no
    FROM tbl_Receipt_General_Info rgi
    WHERE 
        rgi.credit_ledger = @Acc_Id
        AND rgi.receipt_date >= @OB_Date
        AND rgi.status <> 0;
`;

export const purchaseInvFilterQuery = `
    DECLARE @filteredPurchaseInv TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredPurchaseInv (voucherId, voucherNumber)
    SELECT pig.PIN_Id, pig.Po_Inv_No
    FROM tbl_Purchase_Order_Inv_Gen_Info pig
    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
    JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
    WHERE 
        pig.Cancel_status = 0
        AND a.Acc_Id = @Acc_Id
        AND pig.Po_Entry_Date >= @OB_Date
        AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.purchaseInvoiceId = pig.Po_Inv_No)
        AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.purchaseInvoiceId = pig.Po_Inv_No);
`;

export const purchaseObFilterQuery = `
    DECLARE @filteredPurchaseOb TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredPurchaseOb (voucherId, voucherNumber)
    SELECT cb.OB_Id, cb.bill_no
    FROM tbl_Ledger_Opening_Balance cb
    WHERE 
        cb.OB_date >= @OB_Date
        AND cb.Retailer_id = @Acc_Id
        AND cb.dr_amount = 0
        AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.purchaseInvoiceId = cb.bill_no)
        AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.purchaseInvoiceId = cb.bill_no);
`;

export const paymentFilterQuery = `
    DECLARE @filteredPayment TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredPayment (voucherId, voucherNumber)
    SELECT pgi.pay_id, pgi.payment_invoice_no
    FROM tbl_Payment_General_Info pgi
    WHERE 
        pgi.debit_ledger = @Acc_Id
        AND pgi.payment_date >= @OB_Date
        AND pgi.status <> 0;
`;

export const journalFilterQuery = `
DECLARE @filteredJournal TABLE (voucherId INT, voucherNumber NVARCHAR(20), DrCr NVARCHAR(5));
INSERT INTO @filteredJournal (voucherId, voucherNumber, DrCr)
SELECT jgi.JournalId, jgi.JournalVoucherNo, jei.DrCr
FROM tbl_Journal_Entries_Info AS jei
JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
WHERE 
    jgi.JournalStatus <> 0
    AND jei.Acc_Id = @Acc_Id;
`;

export const creditNoteFilterQuery = `
    DECLARE @filteredCreditNote TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredCreditNote (voucherId, voucherNumber)
    SELECT cngi.CR_Id, cngi.CR_Inv_No
    FROM tbl_Credit_Note_Gen_Info AS cngi
    JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = cngi.Retailer_Id
    JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
    WHERE 
        am.Acc_Id = @Acc_Id
        AND cngi.CR_Date >= @OB_Date
        AND cngi.Cancel_status <> 0
        AND COALESCE(cngi.Ref_Inv_Number, '') = '';
`;

export const debitNoteFilterQuery = `
    DECLARE @filteredDebitNote TABLE (voucherId INT, voucherNumber NVARCHAR(20));
    INSERT INTO @filteredDebitNote (voucherId, voucherNumber)
    SELECT dngi.DB_Id, dngi.DB_Inv_No
    FROM tbl_Debit_Note_Gen_Info AS dngi
    JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dngi.Retailer_Id
    JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
    WHERE 
        am.Acc_Id = @Acc_Id
        AND dngi.DB_Date >= @OB_Date
        AND dngi.Cancel_status <> 0
        AND COALESCE(dngi.Ref_Inv_Number, '') = '';
`;

export const getSalesInvOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            pig.Do_Id                  AS voucherId,
            pig.Do_Inv_No              AS voucherNumber,
            pig.Do_Date                AS eventDate,
            a.Acc_Id                   AS Acc_Id,
            pig.Total_Invoice_value    AS totalValue,
            'SALES'                    AS dataSource,
            'SALES'                    AS actualSource,
            COALESCE(rp.againstAmount, 0) + COALESCE(cn.creditNoteAdjustment, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Dr'                       AS accountSide,
            pig.Do_Inv_No              AS BillRefNo,
            pig.Total_Invoice_value - (COALESCE(rp.againstAmount, 0) + COALESCE(cn.creditNoteAdjustment, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredSalesInv fs
        JOIN tbl_Sales_Delivery_Gen_Info pig ON fs.voucherId = pig.Do_Id AND fs.voucherNumber = pig.Do_Inv_No
        JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
        JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
        LEFT JOIN (
            SELECT 
                pb.bill_id,
                pb.bill_name,
                SUM(pb.Credit_Amo) AS againstAmount
            FROM tbl_Receipt_Bill_Info pb
            JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
            JOIN @filteredSalesInv fil ON fil.voucherId = pb.bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.bill_id, pb.bill_name
        ) rp ON rp.bill_id = pig.Do_Id AND rp.bill_name = pig.Do_Inv_No
        LEFT JOIN (
            SELECT 
                Ref_Inv_Number,
                SUM(Total_Invoice_value) AS creditNoteAdjustment
            FROM tbl_Credit_Note_Gen_Info
            JOIN @filteredSalesInv AS fil ON fil.voucherNumber = TRIM(Ref_Inv_Number)
            WHERE Cancel_status <> 0
            GROUP BY Ref_Inv_Number
        ) cn ON cn.Ref_Inv_Number = pig.Do_Inv_No
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredSalesInv fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Cr'
                AND jr.RefType = 'SALES'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = pig.Do_Id AND jr.RefNo = pig.Do_Inv_No
    ) S WHERE S.totalValue > S.againstAmount + S.journalAdjustment
`;

export const getSalesObOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            cb.OB_Id		  AS voucherId, 
            cb.bill_no        AS voucherNumber, 
            cb.bill_date      AS eventDate, 
            cb.Retailer_id    AS Acc_Id,  
            cb.dr_amount      AS totalValue, 
            'SALES'           AS dataSource,
            'SALES-OB'        AS actualSource,
            COALESCE(rp.againstAmount, 0) + COALESCE(cn.creditNoteAdjustment, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Dr'              AS accountSide,
            cb.bill_no        AS BillRefNo,
            cb.dr_amount - (COALESCE(rp.againstAmount, 0) + COALESCE(cn.creditNoteAdjustment, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredSalesOb fo
        JOIN tbl_Ledger_Opening_Balance cb ON fo.voucherId = cb.OB_Id AND fo.voucherNumber = cb.bill_no
        LEFT JOIN (
            SELECT 
                pb.bill_id,
                pb.bill_name,
                SUM(pb.Credit_Amo) AS againstAmount
            FROM tbl_Receipt_Bill_Info pb
            JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
            JOIN @filteredSalesOb fil ON fil.voucherId = pb.bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.bill_id, pb.bill_name
        ) rp ON rp.bill_id = cb.OB_Id AND rp.bill_name = cb.bill_no
        LEFT JOIN (
            SELECT 
                Ref_Inv_Number,
                SUM(Total_Invoice_value) AS creditNoteAdjustment
            FROM tbl_Credit_Note_Gen_Info
            JOIN @filteredSalesOb AS fil ON fil.voucherNumber = TRIM(Ref_Inv_Number)
            WHERE Cancel_status <> 0
            GROUP BY Ref_Inv_Number
        ) cn ON cn.Ref_Inv_Number = cb.bill_no
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredSalesOb fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Cr'
                AND jr.RefType = 'SALES-OB'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = cb.OB_Id AND jr.RefNo = cb.bill_no
    ) S WHERE S.totalValue > S.againstAmount + S.journalAdjustment
`;

export const getReceiptOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            rgi.receipt_id            AS voucherId,
            rgi.receipt_invoice_no    AS voucherNumber,
            rgi.receipt_date          AS eventDate,
            rgi.credit_ledger         AS Acc_Id,
            rgi.credit_amount         AS totalValue,
            'RECEIPT'                 AS dataSource,
            'RECEIPT'                 AS actualSource,
            COALESCE(rp.againstAmount, 0) + COALESCE(pba.againstAmount, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Cr'                      AS accountSide,
            rgi.receipt_invoice_no    AS BillRefNo,
            rgi.credit_amount - (COALESCE(rp.againstAmount, 0) + COALESCE(pba.againstAmount, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredReceipt fr
        JOIN tbl_Receipt_General_Info rgi ON fr.voucherId = rgi.receipt_id AND fr.voucherNumber = rgi.receipt_invoice_no
        LEFT JOIN (
            SELECT 
                pbi.receipt_id,
                pbi.receipt_no,
                SUM(pbi.Credit_Amo) AS againstAmount
            FROM tbl_Receipt_Bill_Info pbi
            JOIN @filteredReceipt fil ON fil.voucherId = pbi.receipt_id AND fil.voucherNumber = pbi.receipt_no
            GROUP BY pbi.receipt_id, pbi.receipt_no
        ) rp ON rp.receipt_id = rgi.receipt_id AND rp.receipt_no = rgi.receipt_invoice_no
        LEFT JOIN (
            SELECT 
                pb.pay_bill_id,
                pb.bill_name,
                SUM(pb.Debit_Amo) AS againstAmount
            FROM tbl_Payment_Bill_Info pb
            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
            JOIN @filteredReceipt fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.pay_bill_id, pb.bill_name
        ) pba ON pba.pay_bill_id = rgi.receipt_id AND pba.bill_name = rgi.receipt_invoice_no
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredReceipt fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Dr'
                AND jr.RefType = 'RECEIPT'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = rgi.receipt_id AND jr.RefNo = rgi.receipt_invoice_no
    ) R WHERE R.totalValue > R.againstAmount + R.journalAdjustment
`;

export const getPurchaseInvOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            pig.PIN_Id               AS voucherId,
            pig.Po_Inv_No            AS voucherNumber,
            pig.Po_Entry_Date        AS eventDate,
            a.Acc_Id                 AS Acc_Id,
            pig.Total_Invoice_value  AS totalValue,
            'PURCHASE'               AS dataSource,
            'PURCHASE'               AS actualSource,
            COALESCE(pb.againstAmount, 0) + COALESCE(dn.debitNoteAdjustment, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Cr'                     AS accountSide,
            pig.Ref_Po_Inv_No        AS BillRefNo,
            pig.Total_Invoice_value - (COALESCE(pb.againstAmount, 0) + COALESCE(dn.debitNoteAdjustment, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredPurchaseInv fp
        JOIN tbl_Purchase_Order_Inv_Gen_Info pig ON fp.voucherId = pig.PIN_Id AND fp.voucherNumber = pig.Po_Inv_No
        JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
        JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
        LEFT JOIN (
            SELECT 
                pb.pay_bill_id,
                pb.bill_name,
                SUM(pb.Debit_Amo) AS againstAmount
            FROM tbl_Payment_Bill_Info pb
            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
            JOIN @filteredPurchaseInv fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.pay_bill_id, pb.bill_name
        ) pb ON pb.pay_bill_id = pig.PIN_Id AND pb.bill_name = pig.Po_Inv_No
        LEFT JOIN (
            SELECT 
                Ref_Inv_Number,
                SUM(Total_Invoice_value) AS debitNoteAdjustment
            FROM tbl_Debit_Note_Gen_Info
            JOIN @filteredPurchaseInv AS fil ON fil.voucherNumber = TRIM(Ref_Inv_Number)
            WHERE Cancel_status <> 0
            GROUP BY Ref_Inv_Number
        ) dn ON dn.Ref_Inv_Number = pig.Po_Inv_No
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredPurchaseInv fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Dr'
                AND jr.RefType = 'PURCHASE'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = pig.PIN_Id AND jr.RefNo = pig.Po_Inv_No
    ) P WHERE P.totalValue > P.againstAmount + P.journalAdjustment
`;

export const getPurchaseObOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            cb.OB_Id		AS voucherId, 
            cb.bill_no      AS voucherNumber, 
            cb.bill_date    AS eventDate, 
            cb.Retailer_id  AS Acc_Id,  
            cb.cr_amount    AS totalValue, 
            'PURCHASE'      AS dataSource,
            'PURCHASE-OB'   AS actualSource,
            COALESCE(pb.againstAmount, 0) + COALESCE(dn.debitNoteAdjustment, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Cr'            AS accountSide,
            cb.bill_no      AS BillRefNo,
            cb.cr_amount - (COALESCE(pb.againstAmount, 0) + COALESCE(dn.debitNoteAdjustment, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredPurchaseOb fo
        JOIN tbl_Ledger_Opening_Balance cb ON fo.voucherId = cb.OB_Id AND fo.voucherNumber = cb.bill_no
        LEFT JOIN (
            SELECT 
                pb.pay_bill_id,
                pb.bill_name,
                SUM(pb.Debit_Amo) AS againstAmount
            FROM tbl_Payment_Bill_Info pb
            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
            JOIN @filteredPurchaseOb fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.pay_bill_id, pb.bill_name
        ) pb ON pb.pay_bill_id = cb.OB_Id AND pb.bill_name = cb.bill_no
        LEFT JOIN (
            SELECT 
                Ref_Inv_Number,
                SUM(Total_Invoice_value) AS debitNoteAdjustment
            FROM tbl_Debit_Note_Gen_Info
            JOIN @filteredPurchaseOb AS fil ON fil.voucherNumber = TRIM(Ref_Inv_Number)
            WHERE Cancel_status <> 0
            GROUP BY Ref_Inv_Number
        ) dn ON dn.Ref_Inv_Number = cb.bill_no
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredPurchaseOb fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Dr'
                AND jr.RefType = 'PURCHASE-OB'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = cb.OB_Id AND jr.RefNo = cb.bill_no
    ) P WHERE P.totalValue > P.againstAmount + P.journalAdjustment
`;

export const getPaymentOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT 
            pgi.pay_id               AS voucherId,
            pgi.payment_invoice_no   AS voucherNumber,
            pgi.payment_date         AS eventDate,
            pgi.debit_ledger         AS Acc_Id,
            pgi.debit_amount         AS totalValue,
            'PAYMENT'                AS dataSource,
            'PAYMENT'                AS actualSource,
            COALESCE(rp.againstAmount, 0) + COALESCE(pb.againstAmount, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Dr'                     AS accountSide,
            pgi.payment_invoice_no   AS BillRefNo,
            pgi.debit_amount - (COALESCE(rp.againstAmount, 0) + COALESCE(pb.againstAmount, 0)) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredPayment fp
        JOIN tbl_Payment_General_Info pgi ON fp.voucherId = pgi.pay_id AND fp.voucherNumber = pgi.payment_invoice_no
        LEFT JOIN (
            SELECT 
                rbi.bill_id,
                rbi.bill_name,
                SUM(rbi.Credit_Amo) AS againstAmount
            FROM tbl_Receipt_Bill_Info rbi
            JOIN tbl_Receipt_General_Info rgi ON rgi.receipt_id = rbi.receipt_id
            JOIN @filteredPayment fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name
            WHERE rgi.status <> 0
            GROUP BY rbi.bill_id, rbi.bill_name
        ) rp ON rp.bill_id = pgi.pay_id AND rp.bill_name = pgi.payment_invoice_no
        LEFT JOIN (
            SELECT 
                pbi.payment_id,
                SUM(pbi.Debit_Amo) AS againstAmount
            FROM tbl_Payment_Bill_Info pbi
            JOIN @filteredPayment fil ON fil.voucherId = pbi.payment_id
            GROUP BY pbi.payment_id
        ) pb ON pb.payment_id = pgi.pay_id
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredPayment fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Cr'
                AND jr.RefType = 'PAYMENT'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = pgi.pay_id AND jr.RefNo = pgi.payment_invoice_no
    ) PMT WHERE PMT.totalValue > PMT.againstAmount + PMT.journalAdjustment
`;

export const getJournalOutstanding = (JournalAutoId) => `
SELECT * FROM (
    SELECT 
        jgi.JournalId			 AS voucherId,
        jgi.JournalVoucherNo	 AS voucherNumber,
        jgi.JournalDate          AS eventDate,
        jei.Acc_Id		         AS Acc_Id,
        jei.Amount		         AS totalValue,
        'JOURNAL'                AS dataSource,
        'JOURNAL'                AS actualSource,
        COALESCE(rp.againstAmount, 0) + COALESCE(pb.againstAmount, 0) AS againstAmount,
        COALESCE(jr1.Amount, 0) + COALESCE(jr2.Amount, 0) AS journalAdjustment,
        jei.DrCr                 AS accountSide,
        jgi.JournalVoucherNo     AS BillRefNo,
        jei.Amount - (COALESCE(rp.againstAmount, 0) + COALESCE(pb.againstAmount, 0)) - (COALESCE(jr1.Amount, 0) + COALESCE(jr2.Amount, 0)) AS BalanceAmount
    FROM @filteredJournal fj
    JOIN tbl_Journal_General_Info jgi ON fj.voucherId = jgi.JournalId AND fj.voucherNumber = jgi.JournalVoucherNo
    JOIN tbl_Journal_Entries_Info jei ON jgi.JournalAutoId = jei.JournalAutoId AND fj.DrCr = jei.DrCr AND jei.Acc_Id = @Acc_Id
    LEFT JOIN (
        SELECT 
            rbi.bill_id,
            rbi.bill_name,
            SUM(rbi.Credit_Amo) AS againstAmount
        FROM tbl_Receipt_Bill_Info rbi
        JOIN tbl_Receipt_General_Info rgi ON rgi.receipt_id = rbi.receipt_id
        JOIN @filteredJournal fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name AND fil.DrCr = 'Cr'
        WHERE rgi.status <> 0
        GROUP BY rbi.bill_id, rbi.bill_name
    ) rp ON rp.bill_id = jgi.JournalId AND rp.bill_name = jgi.JournalVoucherNo AND jei.DrCr = 'Cr'
    LEFT JOIN (
        SELECT 
            pb.pay_bill_id,
            pb.bill_name,
            SUM(pb.Debit_Amo) AS againstAmount
        FROM tbl_Payment_Bill_Info pb
        JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
        JOIN @filteredJournal fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name AND fil.DrCr = 'Dr'
        WHERE pgi.status <> 0
        GROUP BY pb.pay_bill_id, pb.bill_name
    ) pb ON pb.pay_bill_id = jgi.JournalId AND pb.bill_name = jgi.JournalVoucherNo AND jei.DrCr = 'Dr'
    LEFT JOIN (
        SELECT 
            jr.RefId,
            jr.RefNo,
            je.DrCr,
            SUM(jr.Amount) AS Amount
        FROM dbo.tbl_Journal_Bill_Reference jr
        JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
        JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
        JOIN @filteredJournal fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo /* and fil.DrCr mapped by reverse logic */
        WHERE 
            jh.JournalStatus <> 0
            AND je.Acc_Id = @Acc_Id
            AND jr.RefType = 'JOURNAL'
            /* we must match where the offset reverses the original DrCr */
            AND fil.DrCr = CASE WHEN je.DrCr = 'Dr' THEN 'Cr' ELSE 'Dr' END
            ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
        GROUP BY jr.RefId, jr.RefNo, je.DrCr
    ) jr1 ON 
        jr1.RefId = jgi.JournalId AND 
        jr1.RefNo = jgi.JournalVoucherNo AND 
        jr1.DrCr = CASE WHEN jei.DrCr = 'Dr' THEN 'Cr' ELSE 'Dr' END
    LEFT JOIN (
        SELECT 
            jbr.JournalAutoId,
            jbr.LineId,
            jbr.Acc_Id,
            jbr.DrCr,
            SUM(jbr.Amount) AS Amount
        FROM dbo.tbl_Journal_Bill_Reference jbr
        WHERE 1=1 ${JournalAutoId ? " AND jbr.JournalAutoId <> @JournalAutoId " : ""}
        GROUP BY jbr.JournalAutoId, jbr.LineId, jbr.Acc_Id, jbr.DrCr
    ) jr2 ON jr2.JournalAutoId = jei.JournalAutoId AND jr2.LineId = jei.LineId AND jr2.Acc_Id = jei.Acc_Id AND jr2.DrCr = jei.DrCr
) JO WHERE JO.totalValue > JO.againstAmount + JO.journalAdjustment
`;

export const getCreditNoteOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT
            cngi.CR_Id               AS voucherId,
            cngi.CR_Inv_No           AS voucherNumber,
            cngi.CR_Date             AS eventDate,
            am.Acc_Id                AS Acc_Id,
            cngi.Total_Invoice_value AS totalValue,
            'CREDIT_NOTE'            AS dataSource,
            'CREDIT_NOTE'            AS actualSource,
            COALESCE(pb.againstAmount, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Dr'                     AS accountSide,
            cngi.CR_Inv_No           AS BillRefNo,
            cngi.Total_Invoice_value - COALESCE(pb.againstAmount, 0) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredCreditNote fc
        JOIN tbl_Credit_Note_Gen_Info cngi ON fc.voucherId = cngi.CR_Id AND fc.voucherNumber = cngi.CR_Inv_No
        JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = cngi.Retailer_Id
        JOIN tbl_Account_Master am ON am.Acc_Id = rm.AC_Id
        LEFT JOIN (
            SELECT 
                pb.pay_bill_id,
                pb.bill_name,
                SUM(pb.Debit_Amo) AS againstAmount
            FROM tbl_Payment_Bill_Info pb
            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
            JOIN @filteredCreditNote fil ON fil.voucherId = pb.pay_bill_id AND fil.voucherNumber = pb.bill_name
            WHERE pgi.status <> 0
            GROUP BY pb.pay_bill_id, pb.bill_name
        ) pb ON pb.pay_bill_id = cngi.CR_Id AND pb.bill_name = cngi.CR_Inv_No
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredCreditNote fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Cr'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = cngi.CR_Id AND jr.RefNo = cngi.CR_Inv_No
    ) C WHERE C.totalValue > C.againstAmount + C.journalAdjustment
`;

export const getDebitNoteOutstanding = (JournalAutoId) => `
    SELECT * FROM (
        SELECT
            dngi.DB_Id               AS voucherId,
            dngi.DB_Inv_No           AS voucherNumber,
            dngi.DB_Date             AS eventDate,
            am.Acc_Id                AS Acc_Id,
            dngi.Total_Invoice_value AS totalValue,
            'DEBIT_NOTE'             AS dataSource,
            'DEBIT_NOTE'             AS actualSource,
            COALESCE(rp.againstAmount, 0) AS againstAmount,
            COALESCE(jr.journalAdjustment, 0) AS journalAdjustment,
            'Cr'                     AS accountSide,
            dngi.DB_Inv_No           AS BillRefNo,
            dngi.Total_Invoice_value - COALESCE(rp.againstAmount, 0) - COALESCE(jr.journalAdjustment, 0) AS BalanceAmount
        FROM @filteredDebitNote fd
        JOIN tbl_Debit_Note_Gen_Info dngi ON fd.voucherId = dngi.DB_Id AND fd.voucherNumber = dngi.DB_Inv_No
        JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = dngi.Retailer_Id
        JOIN tbl_Account_Master am ON am.Acc_Id = rm.AC_Id
        LEFT JOIN (
            SELECT 
                rbi.bill_id,
                rbi.bill_name,
                SUM(rbi.Credit_Amo) AS againstAmount
            FROM tbl_Receipt_Bill_Info rbi
            JOIN tbl_Receipt_General_Info rgi ON rgi.receipt_id = rbi.receipt_id
            JOIN @filteredDebitNote fil ON fil.voucherId = rbi.bill_id AND fil.voucherNumber = rbi.bill_name
            WHERE rgi.status <> 0
            GROUP BY rbi.bill_id, rbi.bill_name
        ) rp ON rp.bill_id = dngi.DB_Id AND rp.bill_name = dngi.DB_Inv_No
        LEFT JOIN (
            SELECT 
                jr.RefId,
                jr.RefNo,
                SUM(jr.Amount) AS journalAdjustment
            FROM dbo.tbl_Journal_Bill_Reference jr
            JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
            JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
            JOIN @filteredDebitNote fil ON fil.voucherId = jr.RefId AND fil.voucherNumber = jr.RefNo
            WHERE 
                jh.JournalStatus <> 0
                AND je.Acc_Id = @Acc_Id
                AND je.DrCr = 'Dr'
                ${JournalAutoId ? " AND jh.JournalAutoId <> @JournalAutoId " : ""}
            GROUP BY jr.RefId, jr.RefNo
        ) jr ON jr.RefId = dngi.DB_Id AND jr.RefNo = dngi.DB_Inv_No
    ) D WHERE D.totalValue > D.againstAmount + D.journalAdjustment
`;
