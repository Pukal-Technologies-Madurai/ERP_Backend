import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isEqualNumber } from '../../helper_functions.mjs';
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
                    SELECT payments.* 
                    FROM (
                    	SELECT 
                    		pgi.*,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS pbi
                    			WHERE pbi.payment_id = pgi.pay_id
                    		), 0) AS TotalReferenceAdded,
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
                    ) as payments
                    WHERE payments.debit_amount > payments.TotalReferenceAdded
                    ORDER BY payments.payment_date ASC, payments.created_on ASC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getPaymentInvoiceBillInfo = async (req, res) => {
        try {
            const { payment_id, pay_bill_type = 1 } = req.query;

            if (!checkIsNumber(payment_id)) return invalidInput(res, 'payment_id is required');

            const purchaseInvoiceBillType = `
                SELECT 
                    pbi.*,
                    pogi.Po_Inv_Date AS PurchaseInvoiceDate,
                    ISNULL(pb.TotalPaidAmount, 0) AS TotalPaidAmount,
                    pogi.Total_Invoice_value - ISNULL(pb.TotalPaidAmount, 0) AS PendingAmount
                FROM tbl_Payment_Bill_Info AS pbi
                LEFT JOIN tbl_Purchase_Order_Inv_Gen_Info AS pogi
                    ON pogi.PIN_Id = pbi.pay_bill_id
                LEFT JOIN (
                    SELECT 
                        pay_bill_id,
                        SUM(Debit_Amo) AS TotalPaidAmount
                    FROM tbl_Payment_Bill_Info
                    GROUP BY pay_bill_id
                ) AS pb ON pb.pay_bill_id = pbi.pay_bill_id
                WHERE pbi.payment_id = @payment_id;`

            const request = new sql.Request()
                .input('payment_id', payment_id)
                .query(isEqualNumber(pay_bill_type, 1) ? purchaseInvoiceBillType : '');

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getAccountGroups,
        getAccounts,
        searchPaymentInvoice,
        getPaymentInvoiceBillInfo
    }
}

export default PaymentDataDependency();