import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, toArray, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'

const validations = (obj) => {
    return {
        payment_voucher_type_id: checkIsNumber(obj.payment_voucher_type_id),
        pay_bill_type: checkIsNumber(obj.pay_bill_type) ? obj.pay_bill_type > 0 && obj.pay_bill_type < 5 : false,
        // created_by: checkIsNumber(obj?.created_by),
        credit_ledger: checkIsNumber(obj?.credit_ledger),
        debit_amount: checkIsNumber(obj?.debit_amount),
        debit_ledger: checkIsNumber(obj?.debit_ledger),
    }
}

const editValidations = (obj) => {
    return {
        altered_by: checkIsNumber(obj?.altered_by),
        credit_ledger: checkIsNumber(obj?.credit_ledger),
        debit_amount: checkIsNumber(obj?.debit_amount),
        debit_ledger: checkIsNumber(obj?.debit_ledger),
    }
}

const PaymentMaster = () => {

    const add = (a, b) => toNumber(a) + toNumber(b);
    const subtract = (a, b) => toNumber(a) - toNumber(b);
    const multiply = (a, b) => toNumber(a) * toNumber(b);
    const divide = (a, b) => b !== 0 ? toNumber(a) / toNumber(b) : 0;
    const roundNumber = (num, precision = 2) => Number(toNumber(num).toFixed(precision));
    const isEqualNumber = (a, b) => toNumber(a) === toNumber(b);
    const numberFormat = (num) => new Intl.NumberFormat().format(toNumber(num));
    const localDate = (dateStr) => new Date(dateStr).toLocaleDateString();

    const getPayments = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
            const { voucher, debit, credit, payment_type, createdBy, status } = req.query

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('voucher', voucher)
                .input('debit', debit)
                .input('credit', credit)
                .input('payment_type', payment_type)
                .input('createdBy', createdBy)
                .input('status', status)
                .query(`
                    SELECT 
                    	pgi.*,
                    	vt.Voucher_Type,
                    	debAcc.Account_name AS DebitAccountGet,
                    	creAcc.Account_name AS CreditAccountGet,
						COALESCE((
							SELECT SUM(Debit_Amo)
							FROM tbl_Payment_Bill_Info AS pbi
							WHERE pbi.payment_id = pgi.pay_id
						), 0) AS TotalReferencedAmount
                    FROM tbl_Payment_General_Info AS pgi
                    LEFT JOIN tbl_Voucher_Type AS vt
                        ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                    LEFT JOIN tbl_Account_Master AS debAcc
                        ON debAcc.Acc_Id = pgi.debit_ledger
					LEFT JOIN tbl_Account_Master AS creAcc
                        ON creAcc.Acc_Id = pgi.credit_ledger
                    WHERE
                        pgi.payment_date BETWEEN @Fromdate AND @Todate
                        ${checkIsNumber(voucher) ? ' AND pgi.payment_voucher_type_id = @voucher ' : ''}
                        ${checkIsNumber(debit) ? ' AND pgi.debit_ledger = @debit ' : ''}
                        ${checkIsNumber(credit) ? ' AND pgi.credit_ledger = @credit ' : ''}
                        ${checkIsNumber(payment_type) ? ' AND pgi.pay_bill_type = @payment_type ' : ''}
                        ${checkIsNumber(createdBy) ? ' AND pgi.created_by = @createdBy ' : ''}
                        ${checkIsNumber(status) ? ' AND pgi.status = @status ' : ''}
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
                check_no, check_date, bank_name, bank_date
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
                .input('check_no', check_no ? check_no : null)
                .input('check_date', check_date ? check_date : null)
                .input('bank_name', bank_name ? bank_name : null)
                .input('bank_date', bank_date ? bank_date : null)
                .input('status', status)
                .input('created_by', created_by)
                .query(`
                    INSERT INTO tbl_Payment_General_Info (
                        pay_id, year_id, payment_sno, payment_invoice_no, payment_voucher_type_id, payment_date, pay_bill_type, 
                        credit_ledger, credit_ledger_name, credit_amount, 
                        debit_ledger, debit_ledger_name, debit_amount,
                        check_no, check_date, bank_name, bank_date, 
                        remarks, status, created_by, created_on
                    ) VALUES (
                        @pay_id, @year_id, @payment_sno, @payment_invoice_no, @payment_voucher_type_id, @payment_date, @pay_bill_type, 
                        @credit_ledger, @credit_ledger_name, @credit_amount, 
                        @debit_ledger, @debit_ledger_name, @debit_amount, 
                        @check_no, @check_date, @bank_name, @bank_date,
                        @remarks, @status, @created_by, GETDATE() 
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {

                const isReference = isEqualNumber(pay_bill_type, 1) || isEqualNumber(pay_bill_type, 3);

                if (!isReference) return success(res, 'Payment Created');

                const getInsertedValues = new sql.Request()
                    .input('pay_id', pay_id)
                    .query(`
                        SELECT 
                        	pgi.*,
                        	vt.Voucher_Type,
                        	debAcc.Account_name AS DebitAccountGet,
                        	creAcc.Account_name AS CreditAccountGet,
					    	COALESCE((
					    		SELECT SUM(Debit_Amo)
					    		FROM tbl_Payment_Bill_Info AS pbi
					    		WHERE pbi.payment_id = pgi.pay_id
					    	), 0) AS TotalReferencedAmount
                        FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Voucher_Type AS vt
                            ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                        LEFT JOIN tbl_Account_Master AS debAcc
                            ON debAcc.Acc_Id = pgi.debit_ledger
					    LEFT JOIN tbl_Account_Master AS creAcc
                            ON creAcc.Acc_Id = pgi.credit_ledger
                        WHERE pay_id = @pay_id;`
                    );

                const insertedRow = await getInsertedValues;

                success(res, 'Payment Created', insertedRow.recordset);

            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const updateGeneralInfoPayments = async (req, res) => {
        const transaction = new sql.Transaction();

        try {

            const {
                pay_id, remarks, status,
                credit_ledger, credit_ledger_name,
                debit_ledger, debit_ledger_name,
                debit_amount, altered_by,
                check_no, check_date, bank_name, bank_date
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

            await transaction.begin();

            // update values

            const request = new sql.Request(transaction)
                .input('pay_id', pay_id)
                .input('payment_date', payment_date)
                .input('credit_ledger', credit_ledger)
                .input('credit_ledger_name', credit_ledger_name)
                .input('credit_amount', debit_amount)
                .input('debit_ledger', debit_ledger)
                .input('debit_ledger_name', debit_ledger_name)
                .input('debit_amount', debit_amount)
                .input('check_no', check_no ? check_no : null)
                .input('check_date', check_date ? check_date : null)
                .input('bank_name', bank_name ? bank_name : null)
                .input('bank_date', bank_date ? bank_date : null)
                .input('remarks', remarks)
                .input('status', status)
                .input('altered_by', altered_by)
                .query(`
                    UPDATE tbl_Payment_General_Info
                    SET 
                        payment_date = @payment_date,
                        credit_ledger = @credit_ledger,
                        credit_ledger_name = @credit_ledger_name,
                        credit_amount = @credit_amount,
                        debit_ledger = @debit_ledger,
                        debit_ledger_name = @debit_ledger_name,
                        debit_amount = @debit_amount,
                        check_no = @check_no,
                        check_date = @check_date,
                        bank_name = @bank_name,
                        bank_date = @bank_date,
                        remarks = @remarks,
                        status = @status,
                        altered_by = @altered_by
                    WHERE
                        pay_id = @pay_id;`
                );

            await request;

            const updateChildTables = new sql.Request(transaction)
                .input('payment_id', pay_id)
                .input('payment_date', payment_date)
                .input('Debit_Ledger_Id', debit_ledger)
                .query(`
                    UPDATE tbl_Payment_Bill_Info 
                    SET 
                        payment_date = @payment_date,
                        DR_CR_Acc_Id = @Debit_Ledger_Id
                    WHERE payment_id = @payment_id;

                    UPDATE tbl_Payment_Costing_Info 
                    SET 
                        payment_date = @payment_date,
                        Debit_Ledger_Id = @Debit_Ledger_Id
                    WHERE payment_id = @payment_id;`
                );

            await updateChildTables;

            await transaction.commit();

            success(res, 'Changes Saved')

        } catch (e) {
            if (transaction && !transaction._aborted) {
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.error('Rollback failed:', rollbackErr);
                }
            }
            servError(e, res)
        }
    }

    const addAgainstRef = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const { payment_id, payment_no, payment_date, bill_type, DR_CR_Acc_Id, BillsDetails, CostingDetails } = req.body;

            if (!isArray(BillsDetails) || BillsDetails.length === 0) return invalidInput(res, 'BillsDetails is required');

            const isPurchasePayment = isEqualNumber(bill_type, 1);

            const calcTotalDebitAmount = (bill_id) => {
                return toArray(CostingDetails).filter(
                    fil => isEqualNumber(bill_id, fil.pay_bill_id)
                ).reduce((acc, item) => add(acc, item?.expence_value), 0)
            }

            await transaction.begin();

            await new sql.Request(transaction)
                .input('payment_id', payment_id)
                .query(`
                    DELETE FROM tbl_Payment_Bill_Info WHERE payment_id = @payment_id;
                    DELETE FROM tbl_Payment_Costing_Info WHERE payment_id = @payment_id;`
                );

            for (let i = 0; i < BillsDetails.length; i++) {
                const CurrentBillDetails = BillsDetails[i];
                let bill_ref_number = '';

                if (isPurchasePayment) {
                    const getPurchaseRefNumber = new sql.Request()
                        .input('PIN_Id', CurrentBillDetails?.pay_bill_id)
                        .query(`
                            SELECT TOP (1) Ref_Po_Inv_No
                            FROM tbl_Purchase_Order_Inv_Gen_Info
                            WHERE PIN_Id = @PIN_Id`
                        );
                    
                    const result = await getPurchaseRefNumber;

                    if (result.recordset.length !== 1 || !result?.recordset[0]?.Ref_Po_Inv_No) {
                        console.log('bill_id:', CurrentBillDetails?.pay_bill_id)
                        throw new Error('Invoice ref number not found');
                    }

                    bill_ref_number = result?.recordset[0]?.Ref_Po_Inv_No;
                }

                const request = new sql.Request(transaction)
                    .input('payment_id', payment_id)
                    .input('payment_no', payment_no)
                    .input('payment_date', payment_date)
                    .input('bill_type', bill_type)
                    .input('DR_CR_Acc_Id', DR_CR_Acc_Id)
                    .input('pay_bill_id', CurrentBillDetails?.pay_bill_id)
                    .input('bill_ref_number', bill_ref_number)
                    .input('JournalBillType', isPurchasePayment ? 'PURCHASE PAYMENT' : CurrentBillDetails?.JournalBillType)
                    .input('bill_name', CurrentBillDetails?.bill_name)
                    .input('bill_amount', CurrentBillDetails?.bill_amount)
                    .input('Debit_Amo', isPurchasePayment ? CurrentBillDetails?.Debit_Amo : calcTotalDebitAmount(CurrentBillDetails?.pay_bill_id))
                    .query(`
                        INSERT INTO tbl_Payment_Bill_Info (
                            payment_id, payment_no, payment_date, bill_type, DR_CR_Acc_Id,
                            pay_bill_id, bill_ref_number, bill_name, bill_amount, JournalBillType, Debit_Amo, Credit_Amo
                        ) VALUES (
                            @payment_id, @payment_no, @payment_date, @bill_type, @DR_CR_Acc_Id,
                            @pay_bill_id, @bill_ref_number, @bill_name, @bill_amount, @JournalBillType, @Debit_Amo, 0
                        );`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to Insert Payment Bill Details');
            }

            if (isArray(CostingDetails) && CostingDetails.length > 0) {
                for (let i = 0; i < CostingDetails.length; i++) {
                    const itemDetails = CostingDetails[i];

                    const request = new sql.Request(transaction)
                        .input('payment_id', payment_id)
                        .input('payment_no', payment_no)
                        .input('payment_date', payment_date)
                        .input('bill_type', bill_type)
                        .input('Debit_Ledger_Id', DR_CR_Acc_Id)
                        .input('pay_bill_id', itemDetails?.pay_bill_id)
                        .input('JournalBillType', itemDetails?.JournalBillType)
                        .input('item_id', itemDetails?.item_id)
                        .input('item_name', itemDetails?.item_name)
                        .input('expence_value', itemDetails?.expence_value)
                        .query(`
                        INSERT INTO tbl_Payment_Costing_Info (
                            payment_id, payment_no, payment_date, bill_type, Debit_Ledger_Id, 
                            pay_bill_id, JournalBillType, item_id, item_name, expence_value
                        ) VALUES (
                            @payment_id, @payment_no, @payment_date, @bill_type, @Debit_Ledger_Id, 
                            @pay_bill_id, @JournalBillType, @item_id, @item_name, @expence_value
                        );`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) throw new Error('Failed to Insert Payment Costing Details');
                }
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