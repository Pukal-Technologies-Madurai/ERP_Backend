import { servError, success, failed, sentData, invalidInput, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, randomNumber, toArray, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'

const validations = (obj) => {
    return {
        receipt_voucher_type_id: checkIsNumber(obj.receipt_voucher_type_id),
        receipt_bill_type: checkIsNumber(obj.receipt_bill_type) ? obj.receipt_bill_type > 0 && obj.receipt_bill_type < 4 : false,
        created_by: checkIsNumber(obj?.created_by),
        credit_ledger: checkIsNumber(obj?.credit_ledger),
        credit_amount: checkIsNumber(obj?.credit_amount),
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

const ReceiptMaster = () => {

    const add = (a, b) => toNumber(a) + toNumber(b);
    const subtract = (a, b) => toNumber(a) - toNumber(b);
    const multiply = (a, b) => toNumber(a) * toNumber(b);
    const divide = (a, b) => b !== 0 ? toNumber(a) / toNumber(b) : 0;
    const roundNumber = (num, precision = 2) => Number(toNumber(num).toFixed(precision));
    const isEqualNumber = (a, b) => toNumber(a) === toNumber(b);
    const numberFormat = (num) => new Intl.NumberFormat().format(toNumber(num));
    const localDate = (dateStr) => new Date(dateStr).toLocaleDateString();

    const getReceipts = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
            const { voucher, debit, credit, receipt_type, createdBy, status } = req.query

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('voucher', voucher)
                .input('debit', debit)
                .input('credit', credit)
                .input('receipt_type', receipt_type)
                .input('createdBy', createdBy)
                .input('status', status)
                .query(`
                    SELECT 
                        pgi.*,
                        vt.Voucher_Type,
                        debAcc.Account_name AS DebitAccountGet,
                        creAcc.Account_name AS CreditAccountGet,
                        COALESCE((
                            SELECT SUM(Credit_Amo)
                            FROM tbl_Receipt_Bill_Info AS pbi
                            WHERE pbi.receipt_id = pgi.receipt_id
                        ), 0) AS TotalReferencedAmount
                    FROM tbl_Receipt_General_Info AS pgi
                    LEFT JOIN tbl_Voucher_Type AS vt
                        ON vt.Vocher_Type_Id = pgi.receipt_voucher_type_id
                    LEFT JOIN tbl_Account_Master AS debAcc
                        ON debAcc.Acc_Id = pgi.debit_ledger
                    LEFT JOIN tbl_Account_Master AS creAcc
                        ON creAcc.Acc_Id = pgi.credit_ledger
                    WHERE
                        pgi.receipt_date BETWEEN @Fromdate AND @Todate
                        ${checkIsNumber(voucher) ? ' AND pgi.receipt_voucher_type_id = @voucher ' : ''}
                        ${checkIsNumber(debit) ? ' AND pgi.debit_ledger = @debit ' : ''}
                        ${checkIsNumber(credit) ? ' AND pgi.credit_ledger = @credit ' : ''}
                        ${checkIsNumber(receipt_type) ? ' AND pgi.receipt_bill_type = @receipt_type ' : ''}
                        ${checkIsNumber(createdBy) ? ' AND pgi.created_by = @createdBy ' : ''}
                        ${checkIsNumber(status) ? ' AND pgi.status = @status ' : ''}
                    ORDER BY 
                        pgi.receipt_date DESC, pgi.created_on DESC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const createReceipt = async (req, res) => {
        try {

            const {
                receipt_voucher_type_id, receipt_bill_type, remarks, status, created_by,
                credit_ledger, credit_ledger_name,
                debit_ledger, debit_ledger_name,
                credit_amount,
                check_no, check_date, bank_name, bank_date, is_new_ref = 0,
                BillsDetails = []
            } = req.body;

            const receipt_date = req.body?.receipt_date ? ISOString(req.body?.receipt_date) : ISOString();

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

            const receipt_id_get = await getNextId({ table: 'tbl_Receipt_General_Info', column: 'receipt_id' });
            if (!receipt_id_get.status || !checkIsNumber(receipt_id_get.MaxId)) throw new Error('Failed to get receipt_id');

            const receipt_id = receipt_id_get.MaxId;

            // getting year id

            const get_year_id = await new sql.Request()
                .input('receipt_date', receipt_date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @receipt_date 
                        AND Fin_End_Date >= @receipt_date`
                );

            if (get_year_id.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = get_year_id.recordset[0];

            // get Voucher and year based invoice count

            const receipt_sno = Number((await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('receipt_voucher_type_id', receipt_voucher_type_id)
                .query(`
                    SELECT 
                        COALESCE(MAX(receipt_sno), 0) AS receipt_sno
                    FROM 
                        tbl_Receipt_General_Info
                    WHERE
                        year_id = @Year_Id
                        AND
                        receipt_voucher_type_id = @receipt_voucher_type_id`
                ))?.recordset[0]?.receipt_sno) + 1;

            if (!checkIsNumber(receipt_sno)) throw new Error('Failed to get voucher Based unique id');

            // get Voucher Code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', receipt_voucher_type_id)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            // get invoice code

            const receipt_invoice_no = Voucher_Code + "/" + createPadString(receipt_sno, 6) + '/' + Year_Desc;

            const Alter_Id = randomNumber(6, 8);

            const request = new sql.Request()
                .input('receipt_id', receipt_id)
                .input('year_id', Year_Id)
                .input('receipt_sno', receipt_sno)
                .input('receipt_invoice_no', receipt_invoice_no)
                .input('receipt_voucher_type_id', receipt_voucher_type_id)
                .input('receipt_date', receipt_date)
                .input('receipt_bill_type', receipt_bill_type)
                .input('credit_ledger', credit_ledger)
                .input('credit_ledger_name', credit_ledger_name)
                .input('credit_amount', credit_amount)
                .input('debit_ledger', debit_ledger)
                .input('debit_ledger_name', debit_ledger_name)
                .input('debit_amount', 0)
                .input('remarks', remarks)
                .input('check_no', check_no ? check_no : null)
                .input('check_date', check_date ? check_date : null)
                .input('bank_name', bank_name ? bank_name : null)
                .input('bank_date', bank_date ? bank_date : null)
                .input('status', status)
                .input('created_by', created_by)
                .input('is_new_ref', is_new_ref)
                .input('Alter_Id', Alter_Id)
                .query(`
                    INSERT INTO tbl_Receipt_General_Info (
                        receipt_id, year_id, receipt_sno, receipt_invoice_no, 
                        receipt_voucher_type_id, receipt_date, receipt_bill_type, 
                        credit_ledger, credit_ledger_name, credit_amount, 
                        debit_ledger, debit_ledger_name, debit_amount,
                        check_no, check_date, bank_name, bank_date, 
                        remarks, status, created_by, created_on, is_new_ref, Alter_Id
                    ) VALUES (
                        @receipt_id, @year_id, @receipt_sno, @receipt_invoice_no, 
                        @receipt_voucher_type_id, @receipt_date, @receipt_bill_type, 
                        @credit_ledger, @credit_ledger_name, @credit_amount, 
                        @debit_ledger, @debit_ledger_name, @debit_amount, 
                        @check_no, @check_date, @bank_name, @bank_date,
                        @remarks, @status, @created_by, GETDATE(), @is_new_ref, @Alter_Id
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                const isReference = !isEqualNumber(receipt_bill_type, 3);

                if (!isReference) return success(res, 'Receipt Created');

                if (toArray(BillsDetails).length > 0) {

                    const clonedReq = {
                        ...req,
                        body: {
                            receipt_no: receipt_invoice_no,
                            receipt_id: receipt_id,
                            receipt_date: receipt_date,
                            receipt_bill_type: receipt_bill_type,
                            DR_CR_Acc_Id: credit_ledger,
                            BillsDetails: BillsDetails
                        }
                    };

                    const againstBillResult = await addAgainstRef(clonedReq);

                    if (againstBillResult.success === true) {
                        return success(res, 'Receipt Created');
                    }
                }

                const getInsertedValues = new sql.Request()
                    .input('receipt_id', receipt_id)
                    .query(`
                        SELECT 
                            pgi.*,
                            vt.Voucher_Type,
                            debAcc.Account_name AS DebitAccountGet,
                            creAcc.Account_name AS CreditAccountGet,
                            COALESCE((
                                SELECT SUM(Credit_Amo)
                                FROM tbl_Receipt_Bill_Info AS pbi
                                WHERE pbi.receipt_id = pgi.receipt_id
                            ), 0) AS TotalReferencedAmount
                        FROM tbl_Receipt_General_Info AS pgi
                        LEFT JOIN tbl_Voucher_Type AS vt
                            ON vt.Vocher_Type_Id = pgi.receipt_voucher_type_id
                        LEFT JOIN tbl_Account_Master AS debAcc
                            ON debAcc.Acc_Id = pgi.debit_ledger
                        LEFT JOIN tbl_Account_Master AS creAcc
                            ON creAcc.Acc_Id = pgi.credit_ledger
                        WHERE receipt_id = @receipt_id;`
                    );

                const insertedRow = await getInsertedValues;

                success(res, 'Receipt Created', insertedRow.recordset);

            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const updateReceipt = async (req, res) => {
        const transaction = new sql.Transaction();

        try {

            const {
                receipt_id, remarks, status,
                credit_ledger, credit_ledger_name,
                debit_ledger, debit_ledger_name,
                credit_amount, altered_by,
                check_no, check_date, bank_name, bank_date, is_new_ref
            } = req.body;

            const receipt_date = req.body?.receipt_date ? ISOString(req.body?.receipt_date) : ISOString();

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

            const Alter_Id = randomNumber(6, 8);

            // update values

            const request = new sql.Request(transaction)
                .input('receipt_id', receipt_id)
                .input('receipt_date', receipt_date)
                .input('credit_ledger', credit_ledger)
                .input('credit_ledger_name', credit_ledger_name)
                .input('credit_amount', credit_amount)
                .input('debit_ledger', debit_ledger)
                .input('debit_ledger_name', debit_ledger_name)
                .input('debit_amount', 0)
                .input('check_no', check_no ? check_no : null)
                .input('check_date', check_date ? check_date : null)
                .input('bank_name', bank_name ? bank_name : null)
                .input('bank_date', bank_date ? bank_date : null)
                .input('remarks', remarks)
                .input('status', status)
                .input('altered_by', altered_by)
                .input('is_new_ref', is_new_ref)
                .input('Alter_Id', Alter_Id)
                .query(`
                    UPDATE tbl_Receipt_General_Info
                    SET 
                        receipt_date = @receipt_date,
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
                        altered_by = @altered_by,
                        is_new_ref = @is_new_ref,
                        Alter_Id = @Alter_Id
                    WHERE
                        receipt_id = @receipt_id;`
                );

            await request;

            const updateChildTables = new sql.Request(transaction)
                .input('receipt_id', receipt_id)
                .input('receipt_date', receipt_date)
                .input('credit_ledger', credit_ledger)
                .query(`
                    UPDATE tbl_Receipt_Bill_Info 
                    SET 
                        receipt_date = @receipt_date,
                        DR_CR_Acc_Id = @credit_ledger
                    WHERE receipt_id = @receipt_id;

                    UPDATE tbl_Receipt_Costing_Info 
                    SET 
                        receipt_date = @receipt_date,
                        Credit_Ledger_Id = @credit_ledger
                    WHERE receipt_id = @receipt_id;`
                );

            await updateChildTables;
            await transaction.commit();
            success(res, 'Changes saved')

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
            const { receipt_id, receipt_no, receipt_date, receipt_bill_type, DR_CR_Acc_Id, BillsDetails, CostingDetails } = req.body;

            // if (!isArray(BillsDetails) || BillsDetails.length === 0) return invalidInput(res, 'BillsDetails is required');

            const isSalesReceipt = isEqualNumber(receipt_bill_type, 1);

            const calcTotalDebitAmount = (bill_id) => {
                return toArray(CostingDetails).filter(
                    fil => isEqualNumber(bill_id, fil.bill_id)
                ).reduce((acc, item) => add(acc, item?.expence_value), 0)
            }

            // try {
            //     await transaction.begin();
            // } catch (beginErr) {
            //     return servError(beginErr, res);
            // }
            await transaction.begin();

            await new sql.Request(transaction)
                .input('receipt_id', receipt_id)
                .query(`
                    DELETE FROM tbl_Receipt_Bill_Info WHERE receipt_id = @receipt_id;
                    DELETE FROM tbl_Receipt_Costing_Info WHERE receipt_id = @receipt_id;`
                );

            for (let i = 0; i < BillsDetails.length; i++) {
                const CurrentBillDetails = BillsDetails[i];

                const request = new sql.Request(transaction)
                    .input('receipt_id', receipt_id)
                    .input('receipt_no', receipt_no)
                    .input('receipt_date', receipt_date)
                    .input('receipt_bill_type', receipt_bill_type)
                    .input('DR_CR_Acc_Id', DR_CR_Acc_Id)
                    .input('bill_id', CurrentBillDetails?.bill_id)
                    .input('JournalBillType', isSalesReceipt ? 'SALES RECEIPT' : CurrentBillDetails?.JournalBillType)
                    .input('bill_name', CurrentBillDetails?.bill_name)
                    .input('bill_amount', CurrentBillDetails?.bill_amount)
                    .input('Credit_Amo', isSalesReceipt ? CurrentBillDetails?.Credit_Amo : calcTotalDebitAmount(CurrentBillDetails?.bill_id))
                    .query(`
                        INSERT INTO tbl_Receipt_Bill_Info (
                            receipt_id, receipt_no, receipt_date, receipt_bill_type, DR_CR_Acc_Id,
                            bill_id, bill_name, bill_amount, JournalBillType, Debit_Amo, Credit_Amo
                        ) VALUES (
                            @receipt_id, @receipt_no, @receipt_date, @receipt_bill_type, @DR_CR_Acc_Id,
                            @bill_id, @bill_name, @bill_amount, @JournalBillType, 0, @Credit_Amo
                        );`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to Insert Receipt Bill Details');
            }

            if (isArray(CostingDetails) && CostingDetails.length > 0) {
                for (let i = 0; i < CostingDetails.length; i++) {
                    const itemDetails = CostingDetails[i];

                    const request = new sql.Request(transaction)
                        .input('receipt_id', receipt_id)
                        .input('receipt_no', receipt_no)
                        .input('receipt_date', receipt_date)
                        .input('receipt_bill_type', receipt_bill_type)
                        .input('Credit_Ledger_Id', DR_CR_Acc_Id)
                        .input('bill_id', itemDetails?.bill_id)
                        .input('JournalBillType', itemDetails?.JournalBillType)
                        .input('arr_id', itemDetails?.arr_id)
                        .input('item_id', itemDetails?.item_id)
                        .input('item_name', itemDetails?.item_name)
                        .input('expence_value', itemDetails?.expence_value)
                        .query(`
                            INSERT INTO tbl_Receipt_Costing_Info (
                                receipt_id, receipt_no, receipt_date, receipt_bill_type, Credit_Ledger_Id, 
                                bill_id, JournalBillType, arr_id, item_id, item_name, expence_value
                            ) VALUES (
                                @receipt_id, @receipt_no, @receipt_date, @receipt_bill_type, @Credit_Ledger_Id, 
                                @bill_id, @JournalBillType, @arr_id, @item_id, @item_name, @expence_value
                            );`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) throw new Error('Failed to Insert Receipt Costing Details');
                }
            }

            await transaction.commit();

            return res ? success(res, 'Against Reference Saved') : {
                success: true,
            };

        } catch (e) {

            if (transaction && !transaction._aborted) {
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    console.error('Rollback failed:', rollbackErr);
                }
            }

            return res ? servError(e, res) : {
                success: false
            };
        }
    }

    // const get 

    return {
        getReceipts,
        createReceipt,
        updateReceipt,
        addAgainstRef,
    }
}


export default ReceiptMaster();