import sql from 'mssql';
import { ISOString } from '../../helper_functions.mjs';
import { sentData, servError } from '../../res.mjs';

const PaymentReports = () => {

    const getPendingPaymentReference = async (req, res) => {
        try {
            const
                Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString(),
                Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH BILL_REFERENCES AS (
                        SELECT 
                            pbi.payment_id,
                            SUM(pbi.Debit_Amo) AS total_referenced
                        FROM tbl_Payment_Bill_Info pbi
                    	WHERE payment_date BETWEEN @Fromdate AND @Todate
                        GROUP BY pbi.payment_id 
                    ),
                    PAYMENT_TOTALS AS (
                        SELECT 
                            pgi.pay_id,
                            pgi.debit_amount,
                            ISNULL(br.total_referenced, 0) AS total_referenced
                        FROM tbl_Payment_General_Info pgi
                        LEFT JOIN BILL_REFERENCES br 
                            ON br.payment_id = pgi.pay_id
                        WHERE 
                            pgi.payment_date BETWEEN @Fromdate AND @Todate
                            AND pgi.pay_bill_type IN (1, 3)
                            AND ISNULL(br.total_referenced, 0) < pgi.debit_amount
                    )
                    SELECT 
                        pgi.*,
                        pt.total_referenced,
                        vt.Voucher_Type,
                        debAcc.Account_name AS DebitAccountGet,
                        creAcc.Account_name AS CreditAccountGet
                    FROM tbl_Payment_General_Info pgi
                    JOIN PAYMENT_TOTALS pt 
                        ON pt.pay_id = pgi.pay_id
                    LEFT JOIN tbl_Voucher_Type vt
                        ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                    LEFT JOIN tbl_Account_Master debAcc
                        ON debAcc.Acc_Id = pgi.debit_ledger
                    LEFT JOIN tbl_Account_Master creAcc
                        ON creAcc.Acc_Id = pgi.credit_ledger`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getAccountsTransaction = async (req, res) => {
        try {
            const
                Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString(),
                Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH DEBIT_ACCOUNT_SUM AS (
                    	SELECT 
                    		pgi.debit_ledger,
                    		SUM(pgi.debit_amount) AS accountTotalDebit,
                    		COUNT(pgi.pay_id) AS transactionCount
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                            pgi.status <> 0
                            AND payment_date BETWEEN @Fromdate AND @Todate
                    	GROUP BY pgi.debit_ledger
                    ), DEBIT_TOTAL AS (
                        SELECT 
                        	DISTINCT pgi.debit_ledger AS accountId, 
                        	a.Account_name AS accountGet,
                    		ag.Group_Id AS accountGroup,
                    		COALESCE(ag.Group_Name, 'Not found') AS accountGroupGet,
                        	accDebSum.accountTotalDebit,
                        	accDebSum.transactionCount,
                    		'DEBIT ACCOUNT' AS accountType
                        FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.Acc_Id = pgi.debit_ledger
                    	LEFT JOIN tbl_Accounting_Group AS ag
                    		ON ag.Group_Id = a.Group_Id
                        LEFT JOIN DEBIT_ACCOUNT_SUM AS accDebSum
                            ON accDebSum.debit_ledger = pgi.debit_ledger
                        WHERE pgi.payment_date BETWEEN @Fromdate AND @Todate
                    ), CREDIT_ACCOUNT_SUM AS (
                    	SELECT 
                    		pgi.credit_ledger,
                    		SUM(pgi.debit_amount) AS accountTotalDebit,
                    		COUNT(pgi.pay_id) AS transactionCount
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                            pgi.status <> 0
                            AND payment_date BETWEEN @Fromdate AND @Todate
                    	GROUP BY pgi.credit_ledger
                    ), CREDIT_TOTAL AS (
                        SELECT 
                        	DISTINCT pgi.credit_ledger AS accountId, 
                        	a.Account_name AS accountGet,
                    		ag.Group_Id AS accountGroup,
                    		COALESCE(ag.Group_Name, 'Not found') AS accountGroupGet,
                        	accCreSum.accountTotalDebit,
                        	accCreSum.transactionCount,
                    		'CREDIT ACCOUNT' AS accountType
                        FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.Acc_Id = pgi.credit_ledger
                    	LEFT JOIN tbl_Accounting_Group AS ag
                    		ON ag.Group_Id = a.Group_Id
                        LEFT JOIN CREDIT_ACCOUNT_SUM AS accCreSum
                            ON accCreSum.credit_ledger = pgi.credit_ledger
                        WHERE pgi.payment_date BETWEEN @Fromdate AND @Todate
                    )
                    SELECT * FROM DEBIT_TOTAL
                    UNION ALL 
                    SELECT * FROM CREDIT_TOTAL`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getPendingPaymentReference,
        getAccountsTransaction,
    }
}

export default PaymentReports();