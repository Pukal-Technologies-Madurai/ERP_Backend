import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, toArray } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'

const validations = (obj) => {
    return {
        payment_voucher_type_id: checkIsNumber(obj.payment_voucher_type_id),
        pay_bill_type: typeof obj.pay_bill_type === 'string' && obj.pay_bill_type.trim() !== '',
        created_by: checkIsNumber(obj?.created_by),
        credit_ledger: checkIsNumber(obj?.credit_ledger),
        debit_amount: checkIsNumber(obj?.debit_amount),
        debit_ledger: checkIsNumber(obj?.debit_ledger),
    }
}

const editValidations = (obj) => {
    return {
        pay_bill_type: typeof obj.pay_bill_type === 'string' && obj.pay_bill_type.trim() !== '',
        altered_by: checkIsNumber(obj?.altered_by),
        credit_ledger: checkIsNumber(obj?.credit_ledger),
        debit_amount: checkIsNumber(obj?.debit_amount),
        debit_ledger: checkIsNumber(obj?.debit_ledger),
    }
}

const PaymentMaster = () => {

    const getPayments = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    SELECT 
                    	pgi.*,
                    	vt.Voucher_Type,
                    	r.Retailer_Name AS DebitAccountGet
                    FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Voucher_Type AS vt
                        ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                        LEFT JOIN tbl_Retailers_Master AS r
                        ON r.Retailer_Id = pgi.debit_ledger
                    WHERE
                        pgi.payment_date BETWEEN @Fromdate AND @Todate
                    ORDER BY 
                        pgi.payment_date DESC, pgi.created_on DESC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const createGeneralInfoPayments = async (req, res) => {
        try {

            const {
                payment_voucher_type_id, pay_bill_type, remarks, status, created_by,
                credit_ledger, credit_ledger_name,
                debit_ledger, debit_ledger_name,
                debit_amount,
            } = req.body;

            const payment_date = req.body?.payment_date ? ISOString(req.body?.payment_date) : ISOString();

            // validations

            const validationResult = validations(req.body);
            const validateResult = Object.entries(validationResult).every(([_, value]) => value === true);
            const errors = Object.entries(validationResult)
                .filter(([_, value]) => value !== true)
                .map(([key]) => key);

            if (!validateResult) {
                console.log('Validation errors:', validationResult);
                return invalidInput(res, 'Enter Required Fields', { errors });
            }

            // // get unique Purchase invoice id

            const get_pay_id = await getNextId({ table: 'tbl_Payment_General_Info', column: 'pay_id' });
            if (!get_pay_id.status || !checkIsNumber(get_pay_id.MaxId)) throw new Error('Failed to get pay_id');

            const pay_id = get_pay_id.MaxId;

            // getting year id

            const get_year_id = await new sql.Request()
                .input('payment_date', payment_date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @payment_date 
                        AND Fin_End_Date >= @payment_date`
                );

            if (get_year_id.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = get_year_id.recordset[0];

            // get Voucher and year based invoice count

            const payment_sno = Number((await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('payment_voucher_type_id', payment_voucher_type_id)
                .query(`
                    SELECT 
                        COALESCE(MAX(payment_sno), 0) AS payment_sno
                    FROM 
                        tbl_Payment_General_Info
                    WHERE
                        year_id = @Year_Id
                        AND
                        payment_voucher_type_id = @payment_voucher_type_id`
                ))?.recordset[0]?.payment_sno) + 1;

            if (!checkIsNumber(payment_sno)) throw new Error('Failed to get voucher Based unique id');

            // get Voucher Code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', payment_voucher_type_id)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            // get invoice code

            const payment_invoice_no = Voucher_Code + "/" + createPadString(payment_sno, 6) + '/' + Year_Desc;

            const request = new sql.Request()
                .input('pay_id', pay_id)
                .input('year_id', Year_Id)
                .input('payment_sno', payment_sno)
                .input('payment_invoice_no', payment_invoice_no)
                .input('payment_voucher_type_id', payment_voucher_type_id)
                .input('payment_date', payment_date)
                .input('pay_bill_type', pay_bill_type)
                .input('credit_ledger', credit_ledger)
                .input('credit_ledger_name', credit_ledger_name)
                .input('credit_amount', debit_amount)
                .input('debit_ledger', debit_ledger)
                .input('debit_ledger_name', debit_ledger_name)
                .input('debit_amount', debit_amount)
                .input('remarks', remarks)
                .input('status', status)
                .input('created_by', created_by)
                .query(`
                    INSERT INTO tbl_Payment_General_Info (
                        pay_id, year_id, payment_sno, payment_invoice_no, payment_voucher_type_id, payment_date, pay_bill_type, 
                        credit_ledger, credit_ledger_name, credit_amount, 
                        debit_ledger, debit_ledger_name, debit_amount, 
                        remarks, status, created_by, created_on
                    ) VALUES (
                        @pay_id, @year_id, @payment_sno, @payment_invoice_no, @payment_voucher_type_id, @payment_date, @pay_bill_type, 
                        @credit_ledger, @credit_ledger_name, @credit_amount, 
                        @debit_ledger, @debit_ledger_name, @debit_amount, 
                        @remarks, @status, @created_by, GETDATE() 
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Payment Created')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const updateGeneralInfoPayments = async (req, res) => {
        try {

            const {
                pay_id, pay_bill_type, remarks, status,
                credit_ledger, credit_ledger_name,
                debit_ledger, debit_ledger_name,
                debit_amount, altered_by
            } = req.body;

            const payment_date = req.body?.payment_date ? ISOString(req.body?.payment_date) : ISOString();

            // validations

            const validationResult = editValidations(req.body);
            const validateResult = Object.entries(validationResult).every(([_, value]) => value === true);
            const errors = Object.entries(validationResult)
                .filter(([_, value]) => value !== true)
                .map(([key]) => key);

            if (!validateResult) {
                console.log('Validation errors:', validationResult);
                return invalidInput(res, 'Enter Required Fields', { errors });
            }

            // update values

            const request = new sql.Request()
                .input('pay_id', pay_id)
                .input('payment_date', payment_date)
                .input('pay_bill_type', pay_bill_type)
                .input('credit_ledger', credit_ledger)
                .input('credit_ledger_name', credit_ledger_name)
                .input('credit_amount', debit_amount)
                .input('debit_ledger', debit_ledger)
                .input('debit_ledger_name', debit_ledger_name)
                .input('debit_amount', debit_amount)
                .input('remarks', remarks)
                .input('status', status)
                .input('altered_by', altered_by)
                .query(`
                    UPDATE tbl_Payment_General_Info
                    SET 
                        payment_date = @payment_date,
                        pay_bill_type = @pay_bill_type,
                        credit_ledger = @credit_ledger,
                        credit_ledger_name = @credit_ledger_name,
                        credit_amount = @credit_amount,
                        debit_ledger = @debit_ledger,
                        debit_ledger_name = @debit_ledger_name,
                        debit_amount = @debit_amount,
                        remarks = @remarks,
                        status = @status,
                        altered_by = @altered_by
                    WHERE
                        pay_id = @pay_id;`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Payment Created')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const addAgainstRef = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const { payment_id, payment_no, payment_date, bill_type,  BillsDetails } = req.body;

            if (!isArray(BillsDetails) || BillsDetails.length === 0) return invalidInput(res, 'BillsDetails is required');

            await transaction.begin();

            await new sql.Request(transaction)
                .input('payment_id', payment_id)
                .query('DELETE FROM tbl_Payment_Bill_Info WHERE payment_id = @payment_id')

            for (let i = 0; i < BillsDetails.length; i++) {
                const CurrentBillDetails = BillsDetails[i];

                const request = new sql.Request(transaction)
                    .input('payment_id', payment_id)
                    .input('payment_no', payment_no)
                    .input('payment_date', payment_date)
                    .input('bill_type', bill_type)
                    .input('pay_bill_id', CurrentBillDetails?.pay_bill_id)
                    .input('bill_name', CurrentBillDetails?.bill_name)
                    .input('bill_amount', CurrentBillDetails?.bill_amount)
                    .input('DR_CR_Acc_Id', CurrentBillDetails?.DR_CR_Acc_Id)
                    .input('Debit_Amo', CurrentBillDetails?.Debit_Amo)
                    .query(`
                        INSERT INTO tbl_Payment_Bill_Info (
                            payment_id, payment_no, payment_date, bill_type, pay_bill_id, 
                            bill_name, bill_amount, DR_CR_Acc_Id, Debit_Amo, Credit_Amo
                        ) VALUES (
                            @payment_id, @payment_no, @payment_date, @bill_type, @pay_bill_id, 
                            @bill_name, @bill_amount, @DR_CR_Acc_Id, @Debit_Amo, 0
                        );`
                    );
                
                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to Insert Payment Bill Details');
            }

            await transaction.commit();

            success(res, 'Against Reference Saved');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    // const get 

    return {
        getPayments,
        createGeneralInfoPayments,
        updateGeneralInfoPayments,
        addAgainstRef,
    }
}


export default PaymentMaster();