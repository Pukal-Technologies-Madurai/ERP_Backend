import { servError, sentData, invalidInput, dataFound, noData, } from '../../res.mjs';
import { Addition, ISOString, Subraction, checkIsNumber, isEqualNumber, isValidNumber, toArray, toNumber } from '../../helper_functions.mjs';
import sql from 'mssql';

const stockJournalTypes = [
    {
        label: 'MATERIAL INWARD',
        value: 1
    },
    {
        label: 'OTHER GODOWN',
        value: 2
    },
    {
        label: 'PROCESSING',
        value: 3
    },
];

const ReceiptDataDependency = () => {

    const searchReceiptInvoice = async (req, res) => {
        try {
            const { debit_ledger, credit_ledger, receipt_bill_type } = req.query;

            const request = new sql.Request()
                .input('debit_ledger', debit_ledger)
                .input('credit_ledger', credit_ledger)
                .input('receipt_bill_type', receipt_bill_type)
                .query(`
                    SELECT receipts.* 
                    FROM (
                        SELECT 
                            rgi.*,
                            COALESCE((
                                SELECT SUM(Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS pbi
                                WHERE pbi.receipt_id = rgi.receipt_id
                            ), 0) AS TotalReferenceAdded,
                            COALESCE(deb.Account_name, 'Not found') AS debitAccountGet,
                            COALESCE(cre.Account_name, 'Not found') AS creditAccountGet,
                            COALESCE(vt.Voucher_Type, 'Not found') AS VoucherTypeGet
                        FROM tbl_Receipt_General_Info AS rgi
                            LEFT JOIN tbl_Account_Master AS deb
                            ON deb.Acc_Id = rgi.debit_ledger
                            LEFT JOIN tbl_Account_Master AS cre
                            ON cre.Acc_Id = rgi.credit_ledger
                            LEFT JOIN tbl_Voucher_Type AS vt
                            ON vt.Vocher_Type_Id = rgi.receipt_voucher_type_id
                        WHERE receipt_id IS NOT NULL
                            ${checkIsNumber(debit_ledger) ? ' AND rgi.debit_ledger = @debit_ledger ' : ''}
                            ${checkIsNumber(credit_ledger) ? ' AND rgi.credit_ledger = @credit_ledger ' : ''}
                            ${checkIsNumber(receipt_bill_type) ? ' AND rgi.receipt_bill_type = @receipt_bill_type ' : ''}
                    ) as receipts
                    WHERE receipts.credit_amount > receipts.TotalReferenceAdded
                    ORDER BY receipts.receipt_date ASC, receipts.created_on ASC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getPendingReceipts = async (req, res) => {
        try {
            const { Acc_Id } = req.query;
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
            const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();

            if (!isValidNumber(Acc_Id)) return invalidInput(res, 'Acc_Id is required');

            const request = new sql.Request()
                .input('Acc_Id', Acc_Id)
                .input('reqDate', reqDate)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                -- PURCHASE RETURN 
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
                -- GETTING SALES RETURN
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
                -- outstandings
                    SELECT 
                    	inv.*,
                    	inv.Paid_Amount + inv.journalAdjustment AS totalReference
                    FROM (
                        SELECT 
                            pig.Do_Id,
                            pig.Do_Inv_No,
                            pig.Do_Date,
                            COALESCE(a.Acc_Id, 0) Retailer_Id,
                            pig.Total_Before_Tax,
                            pig.Total_Tax, 
                            pig.Total_Invoice_value,
                            'INV' AS dataSource,
                            ISNULL(pig.Ref_Inv_Number, pig.Do_Inv_No) AS bill_ref_number,
                            COALESCE((
                                SELECT SUM(pb.Credit_Amo) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = pig.Do_Id
                                    AND pb.bill_name = pig.Do_Inv_No
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = a.Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pig.Do_Id 
                                    AND jr.RefNo = pig.Do_Inv_No
                                    AND jr.RefType = 'SALES'
                            ), 0) AS journalAdjustment
                        FROM tbl_Sales_Delivery_Gen_Info AS pig
                        JOIN tbl_Retailers_Master AS r
                            ON r.Retailer_Id = pig.Retailer_Id
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.ERP_Id = R.ERP_Id
                        WHERE 
                            pig.Cancel_status <> 0
                            AND a.Acc_Id = @Acc_Id
                            AND pig.Do_Date >= @OB_Date
                    		AND	NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = pig.Do_Inv_No)
                			AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = pig.Do_Inv_No)
                        UNION ALL
                -- from opening balance
                        SELECT 
                            cb.OB_Id AS bill_id, 
                            cb.bill_no, 
                            cb.bill_date, 
                            cb.Retailer_id,  
                            0 AS bef_tax, 
                            0 AS tot_tax, 
                            cb.dr_amount, 
                            'OB' AS dataSource,
                            cb.bill_no AS bill_ref_number,
                        	COALESCE((
                                SELECT COALESCE(SUM(pb.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = cb.OB_Id
                                    AND pb.bill_name = cb.bill_no
                                    -- AND pgi.receipt_date >= @OB_Date
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = cb.Retailer_id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = cb.OB_Id 
                                    AND jr.RefNo = cb.bill_no
                                    AND jr.RefType = 'SALES-OB'
                            ), 0) AS journalAdjustment
                        FROM tbl_Ledger_Opening_Balance AS cb
                        WHERE 
                            cb.OB_date >= @OB_Date 
                            AND cb.Retailer_id = @Acc_Id 
                            AND cb.cr_amount = 0
                    		AND NOT EXISTS (SELECT 1 FROM @purchaseReturn pr WHERE pr.invoiceId = cb.bill_no)
                			AND NOT EXISTS (SELECT 1 FROM @salesReturn sr WHERE sr.invoiceId = cb.bill_no)
                    	UNION ALL
                -- Payment outstanding
                    	SELECT
                    		pgi.pay_id,
                    		pgi.payment_invoice_no,
                    		pgi.payment_date,
                    		pgi.debit_ledger,
                    		0 AS total_bef_tax,
                    		0 AS total_aft_tas,
                    		pgi.debit_amount,
                    		'PAYMENT' AS dataSource,
                            pgi.payment_invoice_no AS bill_ref_number,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    -- AND rgi.receipt_bill_type = 1
                                    AND rbi.bill_id = pgi.pay_id
                                    AND rbi.bill_name = pgi.payment_invoice_no
                            ) + (
                                SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
                                FROM tbl_Payment_Bill_Info AS pb
                                WHERE 
                    				pb.payment_id = pgi.pay_id
                                    AND pb.payment_no = pgi.payment_invoice_no
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pgi.pay_id 
                                    AND jr.RefNo = pgi.payment_invoice_no
                                    -- AND jr.RefType = 'PAYMENT'
                            ), 0) AS journalAdjustment
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                    		pgi.debit_ledger     = @Acc_Id
                            AND pgi.payment_date >= @OB_Date
                            AND pgi.status       <> 0
                    	UNION ALL
                -- Journal outstanding
                    	SELECT
                    		jgi.JournalId,
                    		jgi.JournalVoucherNo,
                    		jgi.JournalDate,
                    		jei.Acc_Id,
                    		0 AS total_bef_tax,
                    		0 AS total_aft_tas,
                    		jei.Amount,
                    		'JOURNAL' AS dataSource,
                            Jgi.JournalVoucherNo AS bill_ref_number,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    AND rbi.bill_id = jgi.JournalId
                                    AND rbi.bill_name = jgi.JournalVoucherNo
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Dr'
                                    AND jr.RefId = jgi.JournalId 
                                    AND jr.RefNo = jgi.JournalVoucherNo
                            ), 0) AS journalAdjustment
                    	FROM tbl_Journal_Entries_Info AS jei
                    	LEFT JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
                    	WHERE 
                    		jei.Acc_Id				= @Acc_Id
                            AND jgi.JournalDate		>= @OB_Date
                            AND jgi.JournalStatus	<> 0
                    		AND jei.DrCr			= 'Dr'
                    ) AS inv
                    WHERE 
                        inv.Paid_Amount + inv.journalAdjustment < inv.Total_Invoice_value
                    ORDER BY inv.Do_Date ASC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getPendingReceiptsAmount = async (req, res) => {
        try {
            const { Retailer_Id } = req.query;
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
            const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();

            if (!isValidNumber(Retailer_Id)) return invalidInput(res, 'Retailer_Id is required');

            const request = new sql.Request()
                .input('Retailer_Id', Retailer_Id)
                .input('reqDate', reqDate)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    DECLARE @Acc_Id INT = (SELECT AC_Id FROM tbl_Retailers_Master WHERE Retailer_Id = @Retailer_Id);
                    DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                --filtering sales returns
                    DECLARE @PurchaseInvoiceNumber TABLE (invNumber NVARCHAR(50) NOT NULL);
                    INSERT INTO @PurchaseInvoiceNumber (invNumber)
                    SELECT DISTINCT Ref_Po_Inv_No 
                    FROM tbl_Purchase_Order_Inv_Gen_Info
                    WHERE 
                        Po_Entry_Date >= @OB_Date
                    	AND Ref_Po_Inv_No IS NOT NULL
                    	AND TRIM(COALESCE(Ref_Po_Inv_No, '')) <> ''
                -- outstandings
                    SELECT 
                    	inv.*,
                    	inv.Paid_Amount + inv.journalAdjustment AS totalReference
                    FROM (
                        SELECT 
                            pig.Do_Date,
                            pig.Total_Invoice_value,
                            COALESCE((
                                SELECT SUM(pb.Credit_Amo) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = pig.Do_Id
                                    AND pb.bill_name = pig.Do_Inv_No
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = a.Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pig.Do_Id 
                                    AND jr.RefNo = pig.Do_Inv_No
                                    AND jr.RefType = 'SALES'
                            ), 0) AS journalAdjustment
                        FROM tbl_Sales_Delivery_Gen_Info AS pig
                        JOIN tbl_Retailers_Master AS r
                            ON r.Retailer_Id = pig.Retailer_Id
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.ERP_Id = R.ERP_Id
                        WHERE 
                            pig.Cancel_status <> 0
                            AND a.Acc_Id = @Acc_Id
                            AND pig.Do_Date >= @OB_Date
                    		AND	pig.Do_Inv_No NOT IN (SELECT invNumber FROM @PurchaseInvoiceNumber)
                        UNION ALL
                    -- from opening balance
                        SELECT 
                            cb.OB_date,
                            cb.dr_amount, 
                        	COALESCE((
                                SELECT COALESCE(SUM(pb.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = cb.OB_Id
                                    AND pb.bill_name = cb.bill_no
                                    -- AND pgi.receipt_date >= @OB_Date
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = cb.Retailer_id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = cb.OB_Id 
                                    AND jr.RefNo = cb.bill_no
                                    AND jr.RefType = 'SALES-OB'
                            ), 0) AS journalAdjustment
                        FROM tbl_Ledger_Opening_Balance AS cb
                        WHERE 
                            cb.OB_date >= @OB_Date 
                            AND cb.Retailer_id = @Acc_Id 
                            AND cb.cr_amount = 0
                    		AND cb.bill_no NOT IN (SELECT invNumber FROM @PurchaseInvoiceNumber)
                    	UNION ALL
                    -- Payment outstanding
                    	SELECT
                            pgi.payment_date,
                    		pgi.debit_amount,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    -- AND rgi.receipt_bill_type = 1
                                    AND rbi.bill_id = pgi.pay_id
                                    AND rbi.bill_name = pgi.payment_invoice_no
                            ) + (
                                SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
                                FROM tbl_Payment_Bill_Info AS pb
                                WHERE 
                    				pb.payment_id = pgi.pay_id
                                    AND pb.payment_no = pgi.payment_invoice_no
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pgi.pay_id 
                                    AND jr.RefNo = pgi.payment_invoice_no
                                    -- AND jr.RefType = 'PAYMENT'
                            ), 0) AS journalAdjustment
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                    		pgi.debit_ledger     = @Acc_Id
                            AND pgi.payment_date >= @OB_Date
                            AND pgi.status       <> 0
                    	UNION ALL
                    -- Journal outstanding
                    	SELECT
                            jgi.JournalDate,
                    		jei.Amount,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    AND rbi.bill_id = jgi.JournalId
                                    AND rbi.bill_name = jgi.JournalVoucherNo
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Dr'
                                    AND jr.RefId = jgi.JournalId 
                                    AND jr.RefNo = jgi.JournalVoucherNo
                            ), 0) AS journalAdjustment
                    	FROM tbl_Journal_Entries_Info AS jei
                    	LEFT JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
                    	WHERE 
                    		jei.Acc_Id				= @Acc_Id
                            AND jgi.JournalDate		>= @OB_Date
                            AND jgi.JournalStatus	<> 0
                    		AND jei.DrCr			= 'Dr'
                    ) AS inv
                    WHERE inv.Paid_Amount + inv.journalAdjustment < inv.Total_Invoice_value;
                    SELECT creditLimit, creditDays
                    FROM tbl_Account_Master
                    WHERE Acc_Id = @Acc_Id`
                );

            const result = await request;

            const recentDate = result.recordset.reduce(
                (acc, item) => {
                    if (!acc) return item.Do_Date;
                    return new Date(item.Do_Date) > new Date(acc) ? item.Do_Date : acc;
                },
                null
            );

            const outstanding = result.recordset.reduce(
                (acc, item) => Number(acc) + Subraction(item.Total_Invoice_value, Addition(item.Paid_Amount, item.journalAdjustment)), 
                0
            );

            const creditLimit = toNumber(result.recordsets[1][0]?.creditLimit);
            const creditDays = toNumber(result.recordsets[1][0]?.creditDays);

            sentData(res, [], { 
                outstanding: outstanding, 
                creditLimit, 
                creditDays, 
                recentDate: recentDate ? recentDate : new Date() 
            });
        } catch (e) {
            servError(e, res);
        }
    }

    const getPendingReceiptsRetailerBased = async (req, res) => {
        try {
            const { Retailer_id, reqDate, Fromdate, Todate } = req.query;

            if (!checkIsNumber(Retailer_id)) return invalidInput(res, 'Acc_Id is required');

            const request = new sql.Request()
                .input('Retailer_id', Retailer_id)
                .input('reqDate', reqDate)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    DECLARE @Acc_Id INT = (
                    	SELECT TOP (1) a.Acc_Id 
                    	FROM tbl_Account_Master AS a
                    	JOIN tbl_Retailers_Master AS r ON r.ERP_Id = a.ERP_Id
                    	WHERE r.Retailer_Id = @Retailer_id
                    );
                    DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                    SELECT 
                    	inv.*,
                    	inv.Paid_Amount + inv.journalAdjustment AS totalReference
                    FROM (
                        SELECT 
                            pig.Do_Id,
                            pig.Do_Inv_No,
                            pig.Do_Date,
                            COALESCE(a.Acc_Id, 0) Retailer_Id,
                            pig.Total_Before_Tax,
                            pig.Total_Tax, 
                            pig.Total_Invoice_value,
                            'INV' AS dataSource,
                            ISNULL(pig.Ref_Inv_Number, pig.Do_Inv_No) AS bill_ref_number,
                            COALESCE((
                                SELECT SUM(pb.Credit_Amo) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = pig.Do_Id
                                    AND pb.bill_name = pig.Do_Inv_No
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = a.Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pig.Do_Id 
                                    AND jr.RefNo = pig.Do_Inv_No
                                    AND jr.RefType = 'SALES'
                            ), 0) AS journalAdjustment
                        FROM tbl_Sales_Delivery_Gen_Info AS pig
                        JOIN tbl_Retailers_Master AS r
                            ON r.Retailer_Id = pig.Retailer_Id
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.ERP_Id = R.ERP_Id
                        WHERE 
                            pig.Cancel_status <> 0
                            AND a.Acc_Id = @Acc_Id
                            AND pig.Do_Date >= @OB_Date
                        UNION ALL
                    -- from opening balance
                        SELECT 
                            cb.OB_Id AS bill_id, 
                            cb.bill_no, 
                            cb.bill_date, 
                            cb.Retailer_id,  
                            0 AS bef_tax, 
                            0 AS tot_tax, 
                            cb.dr_amount, 
                            'OB' AS dataSource,
                            cb.bill_no AS bill_ref_number,
                        	COALESCE((
                                SELECT COALESCE(SUM(pb.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS pb
                                JOIN tbl_Receipt_General_Info AS pgi ON pgi.receipt_id = pb.receipt_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.receipt_bill_type = 1
                                    AND pb.bill_id = cb.OB_Id
                                    AND pb.bill_name = cb.bill_no
                                    -- AND pgi.receipt_date >= @OB_Date
                            ), 0) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = cb.Retailer_id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = cb.OB_Id 
                                    AND jr.RefNo = cb.bill_no
                                    AND jr.RefType = 'SALES-OB'
                            ), 0) AS journalAdjustment
                        FROM tbl_Ledger_Opening_Balance AS cb
                        WHERE 
                            cb.OB_date >= @OB_Date 
                            AND cb.Retailer_id = @Acc_Id 
                            AND cb.cr_amount = 0
                    	UNION ALL
                    -- Payment outstanding
                    	SELECT
                    		pgi.pay_id,
                    		pgi.payment_invoice_no,
                    		pgi.payment_date,
                    		pgi.debit_ledger,
                    		0 AS total_bef_tax,
                    		0 AS total_aft_tas,
                    		pgi.debit_amount,
                    		'PAYMENT' AS dataSource,
                            pgi.payment_invoice_no AS bill_ref_number,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    -- AND rgi.receipt_bill_type = 1
                                    AND rbi.bill_id = pgi.pay_id
                                    AND rbi.bill_name = pgi.payment_invoice_no
                            ) + (
                                SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
                                FROM tbl_Payment_Bill_Info AS pb
                                WHERE 
                    				pb.payment_id = pgi.pay_id
                                    AND pb.payment_no = pgi.payment_invoice_no
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Cr'
                                    AND jr.RefId = pgi.pay_id 
                                    AND jr.RefNo = pgi.payment_invoice_no
                                    -- AND jr.RefType = 'PAYMENT'
                            ), 0) AS journalAdjustment
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                    		pgi.debit_ledger = @Acc_Id
                            AND pgi.payment_date >= @OB_Date
                            AND pgi.status <> 0
                    	UNION ALL
                    -- Journal outstanding
                    	SELECT
                    		jgi.JournalId,
                    		jgi.JournalVoucherNo,
                    		jgi.JournalDate,
                    		jei.Acc_Id,
                    		0 AS total_bef_tax,
                    		0 AS total_aft_tas,
                    		jei.Amount,
                    		'JOURNAL' AS dataSource,
                            Jgi.JournalVoucherNo AS bill_ref_number,
                    		 (
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
                                WHERE 
                                    rgi.status <> 0
                                    AND rbi.bill_id = jgi.JournalId
                                    AND rbi.bill_name = jgi.JournalVoucherNo
                            ) AS Paid_Amount,
                            COALESCE((
                                SELECT SUM(jr.Amount)
                                FROM dbo.tbl_Journal_Bill_Reference jr
                                JOIN dbo.tbl_Journal_Entries_Info je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                JOIN dbo.tbl_Journal_General_Info jh ON jh.JournalAutoId = jr.JournalAutoId
                                WHERE 
                                    jh.JournalStatus <> 0
                                    AND je.Acc_Id = @Acc_Id
                                    AND je.DrCr   = 'Dr'
                                    AND jr.RefId = jgi.JournalId 
                                    AND jr.RefNo = jgi.JournalVoucherNo
                            ), 0) AS journalAdjustment
                    	FROM tbl_Journal_Entries_Info AS jei
                    	LEFT JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
                    	WHERE 
                    		jei.Acc_Id				= @Acc_Id
                            AND jgi.JournalDate		>= @OB_Date
                            AND jgi.JournalStatus	<> 0
                    		AND jei.DrCr			= 'Cr'
                    ) AS inv
                    WHERE 
                        inv.Paid_Amount + inv.journalAdjustment < inv.Total_Invoice_value
                        AND TRIM(COALESCE(inv.bill_ref_number, '')) NOT IN (
                            SELECT TRIM(COALESCE(Po_Inv_No, '')) 
                            FROM tbl_Purchase_Order_Inv_Gen_Info
                            WHERE Po_Entry_Date >= @OB_Date
                        )
                    ORDER BY inv.Do_Date ASC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getReceiptBillInfo = async (req, res) => {
        try {
            const { receipt_id, pay_bill_type = 1 } = req.query;

            if (!checkIsNumber(receipt_id)) return invalidInput(res, 'receipt_id is required');

            const request = new sql.Request()
                .input('receipt_id', receipt_id)
                .query(`
                    WITH RECEIPT_BILL_INFO AS (
                        SELECT 
                            pbi.*
                        FROM tbl_Receipt_Bill_Info AS pbi
                        WHERE pbi.receipt_id = @receipt_id
                    ), 
                    -- CTE for Sales Invoice
                    SALES_OPENING_BALANCE_DATE AS (
                        SELECT 
                            0 AS bill_id, 
                            bill_date,
                    		bill_no,
                            COALESCE((
                                SELECT SUM(refAmount.Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS refAmount
                                LEFT JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = refAmount.receipt_id
                                WHERE 
                                    ref.bill_no = refAmount.bill_name
                                    AND refAmount.JournalBillType = 'SALES RECEIPT'
                                    AND pgi.status <> 0
                            ), 0) AS TotalPaidAmount
                        FROM tbl_Ledger_Opening_Balance AS ref
                        WHERE bill_no IN (
                            SELECT DISTINCT bill_name 
                            FROM RECEIPT_BILL_INFO 
                            WHERE receipt_bill_type = 1 AND JournalBillType = 'SALES RECEIPT'
                        )
                    ), 
                    -- CTE for Purchase Invoice
                    SALES_INVOICE_DATE AS (
                        SELECT 
                            Do_Id AS bill_id, 
                            Do_Date AS SalesInvoiceDate,
                            COALESCE((
                                SELECT SUM(refAmount.Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS refAmount
                                LEFT JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = refAmount.receipt_id
                                WHERE 
                                    ref.Do_Id = refAmount.bill_id
                                    AND refAmount.JournalBillType = 'SALES RECEIPT'
                                    AND pgi.status <> 0
                            ), 0) AS TotalPaidAmount
                        FROM tbl_Sales_Delivery_Gen_Info AS ref
                        WHERE Do_Id IN (
                            SELECT DISTINCT bill_id 
                            FROM RECEIPT_BILL_INFO 
                            WHERE receipt_bill_type = 1 AND JournalBillType = 'SALES RECEIPT'
                        )
                    ), 
                    -- CTE for Material Inward
                    MATERIAL_INWARD_DATE AS (
                        SELECT 
                            Trip_Id AS bill_id, 
                            Trip_Date AS TripDate,
                            COALESCE((
                                SELECT SUM(Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS refAmount
                                LEFT JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = refAmount.receipt_id
                                WHERE 
                                    refAmount.bill_id = tm.Trip_Id
                                    AND refAmount.JournalBillType = 'MATERIAL INWARD'
                                    AND pgi.status <> 0
                            ), 0) AS TotalPaidAmount
                        FROM tbl_Trip_Master AS tm
                        WHERE Trip_Id IN (
                            SELECT bill_id 
                            FROM RECEIPT_BILL_INFO 
                            WHERE receipt_bill_type = 2 AND JournalBillType = 'MATERIAL INWARD'
                        )
                    ), 
                    -- CTE for Other Godown
                    OTHER_GODOWN_TRANSFER_DATE AS (
                        SELECT 
                            Trip_Id AS bill_id, 
                            Trip_Date AS TripDate,
                            COALESCE((
                                SELECT SUM(Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS refAmount
                                LEFT JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = refAmount.receipt_id
                                WHERE 
                                    refAmount.bill_id = tm.Trip_Id
                                    AND refAmount.JournalBillType = 'OTHER GODOWN'
                                    AND pgi.status <> 0
                            ), 0) AS TotalPaidAmount
                        FROM tbl_Trip_Master AS tm
                        WHERE Trip_Id IN (
                            SELECT bill_id 
                            FROM RECEIPT_BILL_INFO 
                            WHERE receipt_bill_type = 2 AND JournalBillType = 'OTHER GODOWN'
                        )
                    ), 
                    -- CTE for Processing
                    PROCESSING_DATE AS (
                        SELECT 
                            PR_Id AS bill_id, 
                            Process_date AS ProcessDate,
                            COALESCE((
                                SELECT SUM(Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS refAmount
                                LEFT JOIN tbl_Receipt_General_Info AS pgi
                                    ON pgi.receipt_id = refAmount.receipt_id
                                WHERE 
                                    refAmount.bill_id = pg.PR_Id
                                    AND refAmount.JournalBillType = 'PROCESSING'
                                    AND pgi.status <> 0
                            ), 0) AS TotalPaidAmount
                        FROM tbl_Processing_Gen_Info AS pg
                        WHERE PR_Id IN (
                            SELECT bill_id 
                            FROM RECEIPT_BILL_INFO 
                            WHERE receipt_bill_type = 2 AND JournalBillType = 'PROCESSING'
                        )
                    )
                    -- Final Select
                    SELECT 
                        pbi.*,
                        -- Resolve the referenceBillDate
                        CASE 
                            WHEN pbi.receipt_bill_type = 1 AND pbi.JournalBillType = 'SALES RECEIPT' AND sob.bill_no IS NOT NULL THEN sob.bill_date
                            WHEN pbi.receipt_bill_type = 1 AND pbi.JournalBillType = 'SALES RECEIPT' AND sob.bill_no IS NULL THEN pid.SalesInvoiceDate
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'MATERIAL INWARD' THEN mid.TripDate
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'OTHER GODOWN' THEN ogd.TripDate
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'PROCESSING' THEN pr.ProcessDate
                            ELSE NULL
                        END AS referenceBillDate,
                        -- Resolve the TotalPaidAmount per type
                        CASE 
                    	    WHEN pbi.receipt_bill_type = 1 AND pbi.JournalBillType = 'SALES RECEIPT' AND sob.bill_no IS NOT NULL THEN pid.TotalPaidAmount
                            WHEN pbi.receipt_bill_type = 1 AND pbi.JournalBillType = 'SALES RECEIPT' AND sob.bill_no IS NULL THEN mid.TotalPaidAmount
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'MATERIAL INWARD' THEN mid.TotalPaidAmount
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'OTHER GODOWN' THEN ogd.TotalPaidAmount
                            WHEN pbi.receipt_bill_type = 2 AND pbi.JournalBillType = 'PROCESSING' THEN pr.TotalPaidAmount
                            ELSE NULL
                        END AS totalPaidAmount
                    FROM RECEIPT_BILL_INFO AS pbi
                    LEFT JOIN SALES_OPENING_BALANCE_DATE AS sob ON pbi.bill_name = sob.bill_no
                    LEFT JOIN SALES_INVOICE_DATE AS pid ON pbi.bill_id = pid.bill_id
                    LEFT JOIN MATERIAL_INWARD_DATE AS mid ON pbi.bill_id = mid.bill_id
                    LEFT JOIN OTHER_GODOWN_TRANSFER_DATE AS ogd ON pbi.bill_id = ogd.bill_id
                    LEFT JOIN PROCESSING_DATE AS pr ON pbi.bill_id = pr.bill_id;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getReceiptCostingInfo = async (req, res) => {
        try {
            const { receipt_id } = req.query;

            if (!checkIsNumber(receipt_id)) return invalidInput(res, 'receipt_id is required');

            const request = new sql.Request()
                .input('receipt_id', receipt_id)
                .query(`
                    WITH RECEIPT_COSTING_INFO AS (
                        SELECT pci.*
                        FROM tbl_Receipt_Costing_Info pci
                        WHERE pci.receipt_id = @receipt_id
                    ), TRIP_DETAILS_INFO_QUANTITY AS (
                        SELECT 
                            td.Trip_Id AS bill_id,
                            ta.Product_Id AS item_id,
                            ta.QTY AS itemQuantity,
                            tm.BillType AS JournalBillType, -- MATERIAL INWARD OR OTHER GODOWN
                            COALESCE((
                                SELECT SUM(expence_value)
                                FROM tbl_Receipt_Costing_Info 
                                WHERE 
                                    bill_id = td.Trip_Id
                                    AND item_id = ta.Product_Id
                                    AND (JournalBillType = 'MATERIAL INWARD' OR JournalBillType = 'OTHER GODOWN')
                            ), 0) AS PaidAmount
                        FROM tbl_Trip_Details AS td
                        JOIN tbl_Trip_Arrival AS ta
                            ON ta.Arr_Id = td.Arrival_Id
                        JOIN tbl_Trip_Master AS tm
                            ON tm.Trip_Id = td.Trip_Id
                        WHERE td.Trip_Id IN (
                            SELECT DISTINCT bill_id 
                            FROM RECEIPT_COSTING_INFO 
                            WHERE 
                                JournalBillType = 'MATERIAL INWARD' 
                                OR JournalBillType = 'OTHER GODOWN'
                        ) AND tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN')
                    ), TRIP_PROCESSING_DESTINATION_QUANTITY AS (
                        SELECT 
                            pdi.PR_Id AS bill_id, 
                            pdi.Dest_Item_Id AS item_id,
                            pdi.Dest_Qty AS itemQuantity,
                            'PROCESSING' AS JournalBillType,
                            COALESCE((
                                SELECT SUM(expence_value)
                                FROM tbl_Receipt_Costing_Info 
                                WHERE 
                                    bill_id = pdi.PR_Id
                                    AND item_id = pdi.Dest_Item_Id
                                    AND JournalBillType = 'PROCESSING'
                            ), 0) AS PaidAmount
                        FROM tbl_Processing_Destin_Details AS pdi
                        WHERE pdi.PR_Id IN (
                            SELECT DISTINCT bill_id 
                            FROM RECEIPT_COSTING_INFO 
                            WHERE JournalBillType = 'PROCESSING' 
                        )
                    )
                    SELECT 
                        pci.*,
                        CASE 
                            WHEN pci.JournalBillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN tdq.itemQuantity
                            WHEN pci.JournalBillType = 'PROCESSING' THEN pdq.itemQuantity
                            ELSE 0
                        END AS itemQuantity,
                        CASE 
                            WHEN pci.JournalBillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN tdq.PaidAmount
                            WHEN pci.JournalBillType = 'PROCESSING' THEN pdq.PaidAmount
                            ELSE 0
                        END AS PaidAmount
                    FROM RECEIPT_COSTING_INFO pci
                    LEFT JOIN TRIP_DETAILS_INFO_QUANTITY tdq 
                        ON pci.bill_id = tdq.bill_id AND pci.item_id = tdq.item_id
                    LEFT JOIN TRIP_PROCESSING_DESTINATION_QUANTITY pdq 
                        ON pci.bill_id = pdq.bill_id AND pci.item_id = pdq.item_id;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getReceiptAdjesments = async (req, res) => {
        try {
            const { receipt_id } = req.query;

            if (!checkIsNumber(receipt_id)) return invalidInput(res, 'receipt_id is required');

            const request = new sql.Request()
                .input('receipt_id', receipt_id)
                .query(`
                    DECLARE @receipt_no NVARCHAR(100) = (
                    	SELECT receipt_invoice_no FROM tbl_Receipt_General_Info WHERE receipt_id = @receipt_id
                    );
                    SELECT
                    	jbi.JournalId AS id,
                    	jbi.JournalVoucherNo AS voucherNo,
                    	jbi.JournalDate AS transDate,
                    	jbi.Amount AS adjesmentValue,
                    	'JOURNAL' AS transType
                    FROM tbl_Journal_Bill_Reference AS jbi
                    JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jbi.JournalAutoId
                    WHERE 
                    	jbi.RefId = @receipt_id
                    	AND jbi.RefNo = @receipt_no
                    	AND jbi.DrCr = 'Dr'
                    	AND jbi.RefType = 'RECEIPT'
                    	AND jgi.JournalStatus <> 0
                    UNION ALL
                    SELECT
                    	pbi.payment_id AS id,
                    	pbi.payment_no AS voucherNo,
                    	pbi.payment_date AS transDate,
                    	pbi.Debit_Amo AS adjesmentValue,
                    	'PAYMENT' AS transType
                    FROM tbl_Payment_Bill_Info AS pbi
                    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pbi.payment_id
                    WHERE 
                    	pgi.status <> 0
                    	AND pbi.pay_bill_id = @receipt_id
                    	AND pbi.bill_name = @receipt_no
                    ORDER BY transDate;`
                );

            const result = await request;

            sentData(res, result.recordset)

        } catch (e) {
            servError(e, res);
        }
    }

    const searchStockJournal = async (req, res) => {
        try {
            const { stockJournalType = 1, filterItems = [], voucher } = req.body;
            const reqDate = req.body?.reqDate ? ISOString(req.body?.reqDate) : ISOString();

            if (stockJournalType < 1 || stockJournalType > 3) return invalidInput(res, `Invalid journal type: ${stockJournalType}`);

            const getStockJournalTypeString = stockJournalTypes.find(
                type => isEqualNumber(type.value, stockJournalType)
            ).label;

            const getTypeOneAndTwo = `
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                ), FINDTRIP AS (
                    SELECT
                        DISTINCT td.Trip_Id AS journalId
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival as ta
                        ON ta.Arr_Id = td.Arrival_Id
                    LEFT JOIN tbl_Trip_Master AS tm
                        ON td.Trip_Id = tm.Trip_Id
                    WHERE 
                        (
                            @filterItems IS NULL 
                            OR LTRIM(RTRIM(@filterItems)) = '' 
                            OR ta.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                        )
                        AND tm.Trip_Date = @reqDate
                        AND tm.BillType = @BillType
                        AND tm.TripStatus <> 'Canceled'
                        ${checkIsNumber(voucher) ? ' AND tm.VoucherType = @voucher ' : ''}
                ), TRIP_DETAILS AS (
                    SELECT
                        td.Trip_Id AS journalId,
                        ta.Arr_Id,
                        ta.Arrival_Date AS journalDate,
                        ta.From_Location,
                        ta.To_Location,
                        ta.BatchLocation,
                        ta.Product_Id AS productId,
                        ta.HSN_Code,
                        ta.QTY AS quantity,
                        ta.KGS,
                        ta.Unit_Id,
                        ta.Units AS unitsGet,
                        ta.Gst_Rate AS itemRate,
                        ta.Total_Value AS amount,
                        COALESCE(pm.Product_Name, 'unknown') AS productNameGet,
                        COALESCE(gm_from.Godown_Name, 'Unknown') AS fromLocationGet,
                        COALESCE(gm_to.Godown_Name, 'Unknown') AS toLocationGet
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival as ta
                        ON ta.Arr_Id = td.Arrival_Id
                    LEFT JOIN tbl_Product_Master AS pm
                        ON pm.Product_Id = ta.Product_Id
                    LEFT JOIN tbl_Godown_Master AS gm_from
                        ON gm_from.Godown_Id = ta.From_Location
                    LEFT JOIN tbl_Godown_Master AS gm_to
                        ON gm_to.Godown_Id = ta.To_Location
                    LEFT JOIN tbl_Trip_Master AS tm
                        ON td.Trip_Id = tm.Trip_Id
                    WHERE 
                        td.Trip_Id IN (SELECT journalId FROM FINDTRIP)
                ), TRIP_MASTER AS (
                    SELECT
                        tm.Trip_Id AS journalId,
                        tm.TR_INV_ID AS journalVoucherNo,
                        tm.Branch_Id,
                        tm.VoucherType,
                        tm.Vehicle_No,
                        tm.Trip_Date AS journalDate,
                        tm.Godownlocation,
                        tm.BillType,
                        tm.Narration AS narration,
                        COALESCE(bm.BranchName, 'unknown') AS branchGet,
                        COALESCE(v.Voucher_Type, 'unknown') AS voucherTypeGet
                    FROM tbl_Trip_Master AS tm
                    LEFT JOIN tbl_Branch_Master AS bm
                    ON bm.BranchId = tm.Branch_Id
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = tm.VoucherType
                    WHERE 
                        tm.Trip_Id IN (SELECT journalId FROM FINDTRIP)
                )
                SELECT 
                    tm.*,
                    COALESCE((
                        SELECT td.* 
                        FROM TRIP_DETAILS AS td
                        WHERE td.journalId = tm.journalId
                        FOR JSON PATH
                    ), '[]') AS Products_List
                FROM 
                    TRIP_MASTER AS tm; `;

            const getProcessing = `
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                ), FINDJOURNAL AS (
                    SELECT 
                        DISTINCT d.PR_Id AS journalId
                    FROM tbl_Processing_Destin_Details AS d
                    LEFT JOIN tbl_Processing_Gen_Info AS pgi
                    ON pgi.PR_Id = d.PR_Id
                    WHERE 
                        (
                            @filterItems IS NULL 
                            OR LTRIM(RTRIM(@filterItems)) = '' 
                            OR d.Dest_Item_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                        )
                        AND pgi.Process_date = @reqDate
                        AND pgi.PR_Status <> 'Canceled'
                        ${checkIsNumber(voucher) ? ' AND pgi.VoucherType = @voucher ' : ''}
                ), Destination AS (
                    SELECT 
                        d.PR_Id AS journalId,
                        d.Dest_Item_Id AS productId,
                        d.PRD_Id AS Arr_Id,
                        d.Dest_Goodown_Id,
                        d.Dest_Batch_Lot_No,
                        d.Dest_Qty AS quantity,
                        d.Dest_Unit_Id,
                        d.Dest_Unit AS unitsGet,
                        d.Dest_Rate AS itemRate,
                        d.Dest_Amt AS amount,
                        p.Product_Name AS productNameGet,
                        g.Godown_Name AS toLocationGet
                    FROM tbl_Processing_Destin_Details AS d
                    LEFT JOIN tbl_Product_Master AS p
                    ON d.Dest_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                    ON d.Dest_Goodown_Id = g.Godown_Id
                    LEFT JOIN tbl_Processing_Gen_Info AS pgi
                    ON pgi.PR_Id = d.PR_Id
                    WHERE 
                        d.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                ), SJ_Main AS (
                    SELECT 
                        pgi.PR_Id AS journalId,
                        pgi.PR_Inv_Id AS journalVoucherNo,
                        pgi.Branch_Id,
                        pgi.VoucherType,
                        pgi.Process_date AS journalDate,
                        pgi.Machine_No,
                        pgi.Godownlocation,
                        pgi.Narration AS narration,
                        pgi.Created_At,
                        br.BranchName AS branchGet,
                        COALESCE(v.Voucher_Type, 'Not found') AS voucherTypeGet,
                        g.Godown_Name AS GodownNameGet
                    FROM tbl_Processing_Gen_Info AS pgi
                    LEFT JOIN tbl_Branch_Master AS br
                    ON br.BranchId = pgi.Branch_Id
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = pgi.VoucherType
                    LEFT JOIN tbl_Godown_Master AS g
                    ON g.Godown_Id = pgi.Godownlocation
                    WHERE pgi.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                ), Source AS (
                    SELECT s.*,
                        p.Product_Name,
                        g.Godown_Name
                    FROM tbl_Processing_Source_Details AS s
                    LEFT JOIN tbl_Product_Master AS p
                    ON s.Sour_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                    ON s.Sour_Goodown_Id = g.Godown_Id
                    WHERE s.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                )
                SELECT 
                    main.*,
                    'PROCESSING' AS BillType,
                    COALESCE(( 
                        SELECT source.*
                        FROM Source AS source
                        WHERE source.PR_Id = main.journalId
                        FOR JSON PATH
                    ), '[]') AS SourceDetails,
                    COALESCE((
                        SELECT destination.*
                        FROM Destination AS destination
                        WHERE destination.journalId = main.journalId
                        FOR JSON PATH
                    ), '[]') AS Products_List
                FROM SJ_Main AS main
                ORDER BY main.journalId; `;

            const request = new sql.Request()
                .input('reqDate', reqDate)
                .input('BillType', getStockJournalTypeString)
                .input('voucher', voucher)
                .input('filterItems', toArray(filterItems).map(item => item).join(', '))
                .query(
                    isEqualNumber(stockJournalType, 3) ? getProcessing : getTypeOneAndTwo
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseJsonData = isEqualNumber(
                    stockJournalType, 3
                ) ? result.recordset.map(journal => ({
                    ...journal,
                    SourceDetails: JSON.parse(journal.SourceDetails),
                    Products_List: JSON.parse(journal.Products_List),
                }))
                    : result.recordset.map(journal => ({
                        ...journal,
                        Products_List: JSON.parse(journal.Products_List)
                    }));

                dataFound(res, parseJsonData)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getFilterValues = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    -- Voucher
                    SELECT DISTINCT pgi.receipt_voucher_type_id AS value, v.Voucher_Type AS label
                    FROM tbl_Receipt_General_Info AS pgi
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = pgi.receipt_voucher_type_id
                    -- Debit Account
                    SELECT DISTINCT pgi.debit_ledger AS value, a.Account_name AS label
                    FROM tbl_Receipt_General_Info AS pgi
                    LEFT JOIN tbl_Account_Master AS a
                    ON a.Acc_Id = pgi.debit_ledger
                    -- Credit Account
                    SELECT DISTINCT pgi.credit_ledger AS value, a.Account_name AS label
                    FROM tbl_Receipt_General_Info AS pgi
                    LEFT JOIN tbl_Account_Master AS a
                    ON a.Acc_Id = pgi.credit_ledger
                    -- Created By
                    SELECT DISTINCT pgi.created_by AS value, u.Name AS label
                    FROM tbl_Receipt_General_Info AS pgi
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = pgi.created_by;`
                );

            const result = await request;

            dataFound(res, [], 'data found', {
                voucherType: toArray(result.recordsets[0]),
                debit_accounts: toArray(result.recordsets[1]),
                credit_accounts: toArray(result.recordsets[2]),
                created_by: toArray(result.recordsets[3])
            });
        } catch (e) {
            servError(e, res);
        }
    }

    const getSalesInvoicedCustomers = async (req, res) => {
        try {

            const request = new sql.Request()
                .query(`
                    --SELECT 
                    --    DISTINCT sdgi.Retailer_Id, 
                    --    am.Acc_Id AS value, 
                    --    am.Account_name AS label 
                    --FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                    --JOIN tbl_Retailers_Master AS rm
                    --    ON rm.Retailer_Id = sdgi.Retailer_Id
                    --JOIN tbl_Account_Master AS am
                    --    ON am.ERP_Id = rm.ERP_Id
                    --WHERE am.Acc_Id IS NOT NULL;
                    SELECT 
                        r.Retailer_id, 
                        COALESCE(a.Acc_Id, 0) AS value, 
                        COALESCE(r.Retailer_Name, a.Account_name) AS label
                    FROM tbl_Retailers_Master AS r 
                    LEFT JOIN tbl_Account_Master AS a ON r.ERP_Id = a.ERP_Id
                    WHERE r.Retailer_Id IN (
                    	SELECT DISTINCT Retailer_Id
                    	FROM tbl_Sales_Delivery_Gen_Info
                    ) OR a.Acc_Id IN (
                    	SELECT DISTINCT Retailer_id
                    	FROM tbl_Ledger_Opening_Balance
                    ) OR a.Acc_Id IN (
						SELECT DISTINCT debit_ledger
						FROM tbl_Payment_General_Info
					)
                    ORDER BY a.Account_name;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        searchReceiptInvoice,
        getPendingReceipts,
        getPendingReceiptsAmount,
        getPendingReceiptsRetailerBased,
        getReceiptBillInfo,
        getReceiptCostingInfo,
        searchStockJournal,
        getFilterValues,
        getSalesInvoicedCustomers,
        getReceiptAdjesments
    }
}

export default ReceiptDataDependency();