import sql from 'mssql';
import { dataFound, sentData, servError } from '../../res.mjs';
import { ISOString, toArray } from '../../helper_functions.mjs';


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
                JOIN @receiptFilter AS rfltr ON rfltr.receipt_id = rgi.receipt_id
                WHERE NOT EXISTS (
                    SELECT 1
                	FROM tbl_Contra_General_Info AS cgi 
                	JOIN tbl_Contra_Bill_Info AS cbi ON cbi.contra_id = cgi.ContraId
                	WHERE 
                		cgi.ContraStatus <> 0
                		AND cbi.bill_id = rgi.receipt_id 
                		AND cbi.bill_no = rgi.receipt_invoice_no
                );`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (error) {
        servError(error, res);
    }
}

export default {
    getFilterValues,
    getReceiptReference
}