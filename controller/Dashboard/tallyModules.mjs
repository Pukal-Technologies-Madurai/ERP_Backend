import sql from 'mssql';
import { servError, sentData } from '../../res.mjs';
import { ISOString } from '../../helper_functions.mjs';

const TallyModules = () => {

    const getTallyPurchaseOrderDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        COALESCE(l.ledger_name, 'Not found') as Purticular,
                    	p.po_no AS ModuleID, 
                        p.po_date AS EventDate, 
                    	v.voucher_name AS VoucherName,
                    	p.invoice_value_before_tax, p.invoice_value_after_tax, p.round_off, 
                        p.total_invoice_value, p.narration
                    FROM purchase_order_geninfo_ob AS p
                    LEFT JOIN ledger_ob AS l
                    ON l.tally_id = p.purchase_party_ledger_id
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = p.purchase_voucher_type_id
                    WHERE 
                        p.po_date BETWEEN @Fromdate AND @Todate
                        AND p.cancel_status <> 'Yes'
                    ORDER BY p.po_date`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyPurchaseInvoiceDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        COALESCE(l.ledger_name, 'Not found') as Purticular,
                    	p.invoice_no AS ModuleID, 
                        p.invoice_date AS EventDate, 
                    	v.voucher_name AS VoucherName,
                    	p.invoice_value_before_tax, p.invoice_value_after_tax, p.round_off, 
                        p.total_invoice_value, p.narration
                    FROM purchase_inv_geninfo_ob AS p
                    LEFT JOIN ledger_ob AS l
                    ON l.tally_id = p.purchase_party_ledger_id
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = p.purchase_voucher_type_id
                    WHERE 
                        p.invoice_date BETWEEN @Fromdate AND @Todate
                        AND p.cancel_status <> 'Yes'
                    ORDER BY p.invoice_date`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallySalesOrderDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        COALESCE(l.ledger_name, 'Not found') as Purticular,
                    	s.so_no AS ModuleID, 
                        s.so_date AS EventDate, 
                    	v.voucher_name AS VoucherName,
                    	s.invoice_value_before_tax, s.invoice_value_after_tax, s.round_off, 
                        s.total_invoice_value, s.narration
                    FROM sales_order_geninfo_ob AS s
                    LEFT JOIN ledger_ob AS l
                    ON l.tally_id = s.sales_party_ledger_id
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = s.sales_voucher_type_id
                    WHERE 
                        s.so_date BETWEEN @Fromdate AND @Todate
                        AND s.cancel_status <> 'Yes'
                    ORDER BY s.so_date`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallySalesInvoiceDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        COALESCE(l.ledger_name, 'Not found') as Purticular,
                    	s.invoice_no AS ModuleID, 
                        s.invoice_date AS EventDate, 
                    	v.voucher_name AS VoucherName,
                    	s.invoice_value_before_tax, s.invoice_value_after_tax, s.round_off, 
                        s.total_invoice_value, s.narration
                    FROM sales_inv_geninfo_ob AS s
                    LEFT JOIN ledger_ob AS l
                    ON l.tally_id = s.sales_party_ledger_id
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = s.sales_voucher_type_id
                    WHERE 
                        s.invoice_date BETWEEN @Fromdate AND @Todate
                        AND s.cancel_status <> 'Yes'
                    ORDER BY s.invoice_date`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyStockJournalDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                    	sj.tally_id, 
                        sj.journal_no AS ModuleID, 
                        sj.stock_journal_date AS EventDate,
                    	sj.invoice_no AS TransactionID, 
                    	v.voucher_name AS VoucherName
                    FROM stock_journal_geninfo_ob AS sj
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = sj.stock_journal_type_id
                    WHERE 
                        sj.stock_journal_date BETWEEN @Fromdate AND @Todate
                        AND sj.cancel_status <> 'Yes'
                    ORDER BY sj.tally_id`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyJournalDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                    	j.tally_id, 
                        j.journal_no AS ModuleID, 
                        j.journal_date AS EventDate,
                    	j.invoice_no AS TransactionID, 
                        j.debit_ledger, COALESCE(dl.ledger_name, '') AS  DebitLedger, 
                        j.debit_amount AS DebitAmt,
                        j.credit_ledger_party, COALESCE(cl.ledger_name, '') AS CreditLedger, 
                        j.credit_amount AS CreditAmt,   
                    	v.voucher_name AS VoucherName
                    FROM journal_geninfo_ob AS j
                    LEFT JOIN ledger_ob AS dl
                    ON dl.tally_id = j.debit_ledger
                    LEFT JOIN ledger_ob AS cl
                    ON cl.tally_id = j.credit_ledger_party
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = j.journal_type_id
                    WHERE 
                        j.journal_date BETWEEN @Fromdate AND @Todate
                        AND j.cancel_status <> 'Yes'
                    ORDER BY j.tally_id, 
                    CASE 
                        WHEN j.debit_amount > 0 THEN 1  
                        WHEN j.credit_amount > 0 THEN 2
                        ELSE 3
                    END, 
                        j.debit_amount DESC, 
                        j.credit_amount DESC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyPaymentDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                    	p.tally_id, 
                        p.payment_no AS ModuleID, 
                        p.payment_date AS EventDate, 
                        p.invoice_no AS TransactionID,
                        p.credit_ledger_party, ISNULL(cl.ledger_name, '') AS CreditLedger, 
                        p.credit_amount AS CreditAmt, 
                    	p.debit_ledger, ISNULL(dl.ledger_name, '') AS  DebitLedger, 
                        p.debit_amount AS DebitAmt, 
                    	v.voucher_name AS VoucherName
                    FROM paymLEFT JOIN ledger_ob AS dl
                    ON dl.tally_id = p.debit_ledgerent_geninfo_ob AS p
                    LEFT JOIN ledger_ob AS cl
                    ON cl.tally_id = p.credit_ledger_party
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = p.payment_type_id
                    WHERE 
                        p.payment_date BETWEEN @Fromdate AND @Todate
                        AND p.cancel_status <> 'Yes'
                    ORDER by p.tally_id, 
                    CASE 
                        WHEN p.debit_amount > 0 THEN 1  
                        WHEN p.credit_amount > 0 THEN 2
                        ELSE 3
                    END, 
                        p.debit_amount DESC, 
                        p.credit_amount DESC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyReceiptDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        r.tally_id, 
                        r.receipt_no AS ModuleID, 
                        r.receipt_date AS EventDate, 
                        r.invoice_no AS TransactionID, 
                        r.credit_ledger_party, ISNULL(cl.ledger_name, '') AS CreditLedger, 
                        r.credit_amount AS CreditAmt, 
                    	r.debit_ledger, ISNULL(dl.ledger_name, '') AS  DebitLedger, 
                        r.debit_amount AS DebitAmt, 
                        v.voucher_name AS VoucherName
                    FROM receipt_geninfo_ob AS r
                    LEFT JOIN ledger_ob AS dl
                    ON dl.tally_id = r.debit_ledger
                    LEFT JOIN ledger_ob AS cl
                    ON cl.tally_id = r.credit_ledger_party
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = r.rcpt_bill_type
                    WHERE 
                        r.receipt_date BETWEEN @Fromdate AND @Todate
                        AND r.cancel_status <> 'Yes'
                    ORDER by r.tally_id, 
                    CASE 
                        WHEN r.debit_amount > 0 THEN 1  
                        WHEN r.credit_amount > 0 THEN 2
                        ELSE 3
                    END, 
                        r.debit_amount DESC, 
                        r.credit_amount DESC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyContraDetails = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request(req.db)
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .query(`
                    SELECT
                        c.tally_id, 
                        c.contra_no AS ModuleID, 
                        c.contra_date AS EventDate,
                        c.credit_ledger_id, ISNULL(cl.ledger_name, '') AS CreditLedger, 
                        c.credit_amount AS CreditAmt, 
                    	c.debit_ledger_id, ISNULL(dl.ledger_name, '') AS  DebitLedger, 
                        c.debit_amount AS DebitAmt, 
                        v.voucher_name AS VoucherName
                    FROM contra_geninfo_ob AS c
                    LEFT JOIN ledger_ob AS dl
                    ON dl.tally_id = c.debit_ledger_id
                    LEFT JOIN ledger_ob AS cl
                    ON cl.tally_id = c.credit_ledger_id
                    LEFT JOIN voucher_type_ob AS v
                    ON v.tally_id = c.contra_type_id
                    WHERE 
                        c.contra_date BETWEEN @Fromdate AND @Todate
                        AND c.cancel_status <> 'Yes'
                    ORDER by c.tally_id, 
                    CASE 
                        WHEN c.debit_amount > 0 THEN 1  
                        WHEN c.credit_amount > 0 THEN 2
                        ELSE 3
                    END, 
                        c.debit_amount DESC, 
                        c.credit_amount DESC;`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    return {

        getTallyPurchaseOrderDetails,
        getTallyPurchaseInvoiceDetails,
        
        getTallySalesOrderDetails,
        getTallySalesInvoiceDetails,
        
        getTallyStockJournalDetails,
        getTallyJournalDetails,
        getTallyPaymentDetails,
        getTallyReceiptDetails,
        getTallyContraDetails
    }
}

export default TallyModules();