import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql';


const PaymentDataDependency = () => {

    const getAccountGroups = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_Accounting_Group');

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getAccounts = async (req, res) => {
        try {
            const { GroupId, GroupName } = req.query;

            const request = new sql.Request()
                .input('GroupId', GroupId)
                .input('GroupName', GroupName)
                .query(`
                    SELECT 
                    	am.Acc_Id,
                        am.ERP_Id,
                    	am.Account_name,
                    	am.Group_Id,
                    	ag.Group_Name AS GroupNameGet
                    FROM tbl_Account_Master AS am
                    LEFT JOIN tbl_Accounting_Group AS ag
                    ON ag.Group_Id = am.Group_Id
                    WHERE am.Acc_Id IS NOT NULL
                    ${checkIsNumber(GroupId) ? ' AND am.Group_Id = @Group_Id ' : ''}
                    ${GroupName ? ' AND ag.Group_Name = @GroupName ' : ''}
                    ORDER BY am.Account_name `
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const searchPaymentInvoice = async (req, res) => {
        try {
            const { debit_ledger, credit_ledger, pay_bill_type } = req.query;

            const request = new sql.Request()
                .input('debit_ledger', debit_ledger)
                .input('credit_ledger', credit_ledger)
                .input('pay_bill_type', pay_bill_type)
                .query(`
                    SELECT 
                    	pgi.*,
                    	COALESCE(deb.Account_name, 'Not found') AS debitAccountGet,
                    	COALESCE(cre.Account_name, 'Not found') AS creditAccountGet,
                    	COALESCE(vt.Voucher_Type, 'Not found') AS VoucherTypeGet
                    FROM tbl_Payment_General_Info AS pgi
                    	LEFT JOIN tbl_Account_Master AS deb
                    	ON deb.Acc_Id = pgi.debit_ledger
                    	LEFT JOIN tbl_Account_Master AS cre
                    	ON cre.Acc_Id = pgi.credit_ledger
                        LEFT JOIN tbl_Voucher_Type AS vt
                        ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                    WHERE pay_id IS NOT NULL
                    ${checkIsNumber(debit_ledger) ? ' AND pgi.debit_ledger = @debit_ledger ' : ''}
                    ${checkIsNumber(credit_ledger) ? ' AND pgi.credit_ledger = @credit_ledger ' : ''}
                    ${checkIsNumber(pay_bill_type) ? ' AND pgi.pay_bill_type = @pay_bill_type ' : ''}
                    ORDER BY pgi.payment_date ASC, pgi.created_on ASC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getAccountGroups,
        getAccounts,
        searchPaymentInvoice
    }
}

export default PaymentDataDependency();