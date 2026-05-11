import sql from 'mssql';
import { dataFound, sentData, servError } from '../../res.mjs';
import { ISOString, isValidNumber, toArray } from '../../helper_functions.mjs';


const getFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                -- Voucher
                SELECT DISTINCT con.VoucherType AS value, v.Voucher_Type AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = con.VoucherType
                -- Debit Account
                SELECT DISTINCT con.DebitAccount AS value, a.Account_name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Account_Master AS a
                ON a.Acc_Id = con.DebitAccount
                -- Credit Account
                SELECT DISTINCT con.CreditAccount AS value, a.Account_name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Account_Master AS a
                ON a.Acc_Id = con.CreditAccount
                -- Created By
                SELECT DISTINCT con.CreatedBy AS value, u.Name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Users AS u
                ON u.UserId = con.CreatedBy;
				-- Branch filter
				SELECT DISTINCT con.BranchId AS value, b.BranchName AS label
				FROM tbl_Contra_General_Info AS con
				LEFT JOIN tbl_Branch_Master AS b 
				ON b.BranchId = con.BranchId`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            debit_accounts: toArray(result.recordsets[1]),
            credit_accounts: toArray(result.recordsets[2]),
            created_by: toArray(result.recordsets[3]),
            branch: toArray(result.recordsets[4])
        });

    } catch (e) {
        servError(e, res);
    }
}

const getReceiptReference = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
        const accId = req.query?.accId ? Number(req.query?.accId) : null;

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('accId', accId)
            .query(`
                DECLARE @accountFilter TABLE (accId INT);
                WITH GroupHierarchy AS (
                    SELECT Group_Id, Parent_AC_id
                    FROM tbl_Accounting_Group
                    WHERE Group_Id = 11 OR Group_Id = 22
                    UNION ALL
                    SELECT g.Group_Id, g.Parent_AC_id
                    FROM tbl_Accounting_Group g
                    JOIN GroupHierarchy gh ON g.Parent_AC_id = gh.Group_Id
                )
                INSERT INTO @accountFilter (accId)
                SELECT Acc_Id
                FROM tbl_Account_Master
                WHERE Group_Id IN (SELECT Group_Id FROM GroupHierarchy);
                -- *********************************  RECEIPT FILTERS *********************************
                DECLARE @receiptFilter TABLE (receipt_id BIGINT PRIMARY KEY, receipt_number NVARCHAR(20));
                INSERT INTO @receiptFilter (receipt_id, receipt_number)
                SELECT DISTINCT rgi.receipt_id, rgi.receipt_invoice_no
                FROM tbl_Receipt_General_Info AS rgi
                JOIN @accountFilter AS debAcc ON debAcc.accId = rgi.debit_ledger
                WHERE 
                	rgi.receipt_date BETWEEN @Fromdate AND @Todate 
                	AND rgi.status <> 0
                    ${isValidNumber(accId) ? ` AND rgi.debit_ledger = @accId ` : ``}
                 -- ********************************* getting receipts *********************************
                SELECT
                	rgi.receipt_id AS uniqueId,
                	rgi.receipt_invoice_no AS uniqueNumber,
                	rgi.receipt_date AS entryDate,
                	rgi.receipt_voucher_type_id AS voucherId,
                	rgi.debit_ledger,
                	rgi.credit_ledger,
                	rgi.check_no,
                	rgi.check_date,
                	rgi.bank_date,
                    rgi.bank_name,
                	rgi.debit_amount,
                	rgi.credit_amount,
                    rgi.transaction_type,
                	vm.Voucher_Type AS voucherTypeGet,
                	debAcc.Account_name AS debitAccountGet,
                	creAcc.Account_name AS creditAccountGet,
                    'Cr' AS dr_cr,
                    rgi.credit_amount AS amount,
                    creAcc.Account_name AS displayAccount
                FROM tbl_Receipt_General_Info AS rgi
                LEFT JOIN tbl_Voucher_Type AS vm ON vm.Vocher_Type_Id = rgi.receipt_voucher_type_id
                LEFT JOIN tbl_Account_Master AS debAcc ON debAcc.Acc_Id = rgi.debit_ledger
                LEFT JOIN tbl_Account_Master AS creAcc ON creAcc.Acc_Id = rgi.credit_ledger
                JOIN @receiptFilter AS rfltr ON rfltr.receipt_id = rgi.receipt_id
                WHERE NOT EXISTS (
                    SELECT 1
                	FROM tbl_Contra_General_Info AS cgi 
                	JOIN tbl_Contra_Bill_Info AS cbi ON cbi.contra_id = cgi.ContraId
                	WHERE 
                		cgi.ContraStatus <> 0
                		AND cbi.bill_id = rgi.receipt_id 
                		AND cbi.bill_no = rgi.receipt_invoice_no
                )
                ORDER BY rgi.receipt_date DESC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (error) {
        servError(error, res);
    }
}

const getPaymentReference = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
        const accId = req.query?.accId ? Number(req.query?.accId) : null;

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('accId', accId)
            .query(`
                DECLARE @accountFilter TABLE (accId INT);
                WITH GroupHierarchy AS (
                    SELECT Group_Id, Parent_AC_id
                    FROM tbl_Accounting_Group
                    WHERE Group_Id = 11 OR Group_Id = 22
                    UNION ALL
                    SELECT g.Group_Id, g.Parent_AC_id
                    FROM tbl_Accounting_Group g
                    JOIN GroupHierarchy gh ON g.Parent_AC_id = gh.Group_Id
                )
                INSERT INTO @accountFilter (accId)
                SELECT Acc_Id
                FROM tbl_Account_Master
                WHERE Group_Id IN (SELECT Group_Id FROM GroupHierarchy);
                -- *********************************  PAYMENT FILTERS *********************************
                DECLARE @paymentFilter TABLE (pay_id BIGINT PRIMARY KEY, payment_number NVARCHAR(20));
                INSERT INTO @paymentFilter (pay_id, payment_number)
                SELECT DISTINCT pgi.pay_id, pgi.payment_invoice_no
                FROM tbl_Payment_General_Info AS pgi
                JOIN @accountFilter AS debAcc ON debAcc.accId = pgi.credit_ledger
                WHERE 
                	pgi.payment_date BETWEEN @Fromdate AND @Todate 
                	AND pgi.status <> 0
                    ${isValidNumber(accId) ? ` AND pgi.credit_ledger = @accId ` : ``}
                 -- ********************************* getting payments *********************************
                SELECT
                	pgi.pay_id AS uniqueId,
                	pgi.payment_invoice_no AS uniqueNumber,
                	pgi.payment_date AS entryDate,
                	pgi.payment_voucher_type_id AS voucherId,
                	pgi.debit_ledger,
                	pgi.credit_ledger,
                	pgi.check_no,
                	pgi.check_date,
                	pgi.bank_date,
                    pgi.bank_name,
                	pgi.debit_amount,
                	pgi.credit_amount,
                    pgi.transaction_type,
                	vm.Voucher_Type AS voucherTypeGet,
                	debAcc.Account_name AS debitAccountGet,
                	creAcc.Account_name AS creditAccountGet,
                    'Dr' AS dr_cr,
                    pgi.debit_amount AS amount,
                    debAcc.Account_name AS displayAccount
                FROM tbl_Payment_General_Info AS pgi
                LEFT JOIN tbl_Voucher_Type AS vm ON vm.Vocher_Type_Id = pgi.payment_voucher_type_id
                LEFT JOIN tbl_Account_Master AS debAcc ON debAcc.Acc_Id = pgi.debit_ledger
                LEFT JOIN tbl_Account_Master AS creAcc ON creAcc.Acc_Id = pgi.credit_ledger
                JOIN @paymentFilter AS pfltr ON pfltr.pay_id = pgi.pay_id
                WHERE NOT EXISTS (
                    SELECT 1
                	FROM tbl_Contra_General_Info AS cgi 
                	JOIN tbl_Contra_Bill_Info AS cbi ON cbi.contra_id = cgi.ContraId
                	WHERE 
                		cgi.ContraStatus <> 0
                		AND cbi.bill_id = pgi.pay_id 
                		AND cbi.bill_no = pgi.payment_invoice_no
                		AND cbi.dr_cr = 'Dr'
                )
                ORDER BY pgi.payment_date DESC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (error) {
        servError(error, res);
    }
}

const getChequeAccounts = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                WITH GroupHierarchy AS (
                    SELECT Group_Id, Parent_AC_id
                    FROM tbl_Accounting_Group
                    WHERE Group_Id = 11 OR Group_Id = 22
                    UNION ALL
                    SELECT g.Group_Id, g.Parent_AC_id
                    FROM tbl_Accounting_Group g
                    JOIN GroupHierarchy gh ON g.Parent_AC_id = gh.Group_Id
                )
                SELECT 
                    Acc_Id AS value, Account_Name AS label
                FROM tbl_Account_Master
                WHERE Group_Id IN (SELECT Group_Id FROM GroupHierarchy);
            `);

        const result = await request;

        sentData(res, result.recordset);
    } catch (error) {
        servError(error, res);
    }
}

export default {
    getFilterValues,
    getReceiptReference,
    getPaymentReference,
    getChequeAccounts
}