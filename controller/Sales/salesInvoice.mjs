import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../helper_functions.mjs';
import { invalidInput, servError, dataFound, noData, sentData, success } from '../../res.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

function buildBulkSalesRows(Product_Array, productsData, flags = {}) {
    const { isInclusive = false, isNotTaxableBill = false, isIGST = false, isSO = false } = flags;

    const stockRows = [];
    const batchRows = [];

    Product_Array.forEach((product, index) => {
        const details = findProductDetails(productsData, product.Item_Id) || {};
        const gstPercentage = isIGST ? toNumber(details.Igst_P) : toNumber(details.Gst_P);

        const Taxble = isNotTaxableBill ? 0 : (gstPercentage > 0 ? 1 : 0);

        const Bill_Qty = RoundNumber(toNumber(product?.Bill_Qty) || 0);
        const Item_Rate = RoundNumber(toNumber(product?.Item_Rate) || 0);
        const Amount = RoundNumber(Multiplication(Bill_Qty, Item_Rate));

        const taxType = isNotTaxableBill ? 'zerotax' : (isInclusive ? 'remove' : 'add');
        const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
        const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

        const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
        const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
        const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
        const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

        const Act_Qty = toNumber(product?.Act_Qty) || Bill_Qty;
        const Alt_Act_Qty = isSO ? toNumber(product?.Alt_Act_Qty) : Act_Qty;

        stockRows.push({
            S_No: index + 1,
            Item_Id: toNumber(product.Item_Id),
            Bill_Qty,
            Act_Qty,
            Alt_Act_Qty,
            Item_Rate,
            GoDown_Id: checkIsNumber(product?.GoDown_Id) ? Number(product.GoDown_Id) : null,
            Amount,
            Free_Qty: 0,
            Total_Qty: Bill_Qty,
            Taxble,
            Taxable_Rate: RoundNumber(itemRateGst.base_amount),
            HSN_Code: details.HSN_Code ?? '',
            Unit_Id: product.Unit_Id ?? '',
            Unit_Name: product.Unit_Name ?? '',
            Act_unit_Id: isSO ? (product.Act_unit_Id ?? product.Unit_Id ?? '') : (product.Unit_Id ?? ''),
            Alt_Act_Unit_Id: isSO ? (product.Alt_Act_Unit_Id ?? product.Unit_Id ?? '') : (product.Unit_Id ?? ''),
            Taxable_Amount: RoundNumber(gstInfo.base_amount),
            Tax_Rate: RoundNumber(gstPercentage),
            Cgst: RoundNumber(cgstPer),
            Cgst_Amo: RoundNumber(Cgst_Amo),
            Sgst: RoundNumber(cgstPer),
            Sgst_Amo: RoundNumber(Cgst_Amo),
            Igst: RoundNumber(igstPer),
            Igst_Amo: RoundNumber(Igst_Amo),
            Final_Amo: RoundNumber(gstInfo.with_tax),
            Batch_Name: product?.Batch_Name || ''
        });

        if (product?.Batch_Name) {
            batchRows.push({
                batch: product?.Batch_Name,
                item_id: toNumber(product?.Item_Id),
                godown_id: toNumber(product?.Location_Id) || 0,
                quantity: Bill_Qty,
                rate: Item_Rate
            });
        }
    });

    return { stockRows, batchRows };
}

const SalesInvoice = () => {

    const createSalesInvoice = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Retailer_Id, Branch_Id, So_No, Voucher_Type = '', Cancel_status = 1,
                Narration = null, Created_by, GST_Inclusive = 1, IS_IGST = 0, Round_off = 0,
                Product_Array = [], Expence_Array = [], Staffs_Array = [], Stock_Item_Ledger_Name = ''
            } = req.body;

            const Do_Date = req?.body?.Do_Date ? ISOString(req?.body?.Do_Date) : ISOString();
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

            if (
                !checkIsNumber(Retailer_Id) || !checkIsNumber(Created_by) || !checkIsNumber(Voucher_Type)
                || !Array.isArray(Product_Array) || Product_Array.length === 0
            ) {
                return invalidInput(res, 'Please select Required Fields')
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            // GETTING YEAR ID, CODE

            const Do_Year_Get = await new sql.Request()
                .input('Do_Date', Do_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @Do_Date 
                        AND Fin_End_Date >= @Do_Date`
                );

            if (Do_Year_Get.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = Do_Year_Get.recordset[0];

            // GETTING VOUCHER CODE

            const voucherData = await new sql.Request()
                .input('Voucher_Type', Voucher_Type)
                .query(`
                    SELECT Voucher_Code 
                    FROM tbl_Voucher_Type 
                    WHERE Vocher_Type_Id = @Voucher_Type`
                );

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;

            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            // UNIQUE ID BASED ON VOUCHER AND YEAR

            const Do_No = Number((await new sql.Request()
                .input('Do_Year', Year_Id)
                .input('Voucher_Type', Voucher_Type)
                .query(`
                    SELECT COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Do_Year = @Do_Year
                    AND Voucher_Type = @Voucher_Type`
                )
            ).recordset[0]?.Do_No) + 1;

            if (!checkIsNumber(Do_No)) throw new Error('Failed to get Order Id');

            // UNIQUE INVOICE NUMBER

            const Do_Inv_No = `${VoucherCode}/${createPadString(Do_No, 6)}/${Year_Desc}`;

            const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });

            if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');

            const Do_Id = getDo_Id.MaxId;

            const TotalExpences = toNumber(RoundNumber(
                toArray(Expence_Array).reduce((acc, exp) => Addition(acc, exp?.Expence_Value), 0)
            ));

            const Total_Invoice_value = RoundNumber(
                Addition(
                    TotalExpences,
                    Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate);
                        const billQty = RoundNumber(item?.Bill_Qty);
                        const Amount = Multiplication(billQty, itemRate);

                        if (isNotTaxableBill) return Addition(acc, Amount);

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                        if (isInclusive) {
                            return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'remove').with_tax);
                        } else {
                            return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'add').with_tax);
                        }
                    }, 0)
                )
            );

            const totalValueBeforeTax = () => {
                const productTax = Product_Array.reduce((acc, item) => {
                    const itemRate = RoundNumber(item?.Item_Rate);
                    const billQty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(billQty, itemRate);

                    if (isNotTaxableBill) return {
                        TotalValue: Addition(acc.TotalValue, Amount),
                        TotalTax: 0
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                    const taxInfo = calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add');
                    const TotalValue = Addition(acc.TotalValue, taxInfo.without_tax);
                    const TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount);

                    return {
                        TotalValue, TotalTax
                    };
                }, {
                    TotalValue: 0,
                    TotalTax: 0
                });

                const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => Addition(
                    acc,
                    IS_IGST ? exp?.Igst_Amo : Addition(exp?.Cgst_Amo, exp?.Sgst_Amo)
                ), 0);

                return {
                    TotalValue: productTax.TotalValue,
                    TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
                }
            };

            const totalValueBeforeTaxValues = totalValueBeforeTax();

            const CGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const SGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const IGST = isIGST ? totalValueBeforeTaxValues.TotalTax : 0;
            // const Round_off = RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value);

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('Do_Id', Do_Id)
                .input('Do_Inv_No', Do_Inv_No)
                .input('Voucher_Type', Voucher_Type)
                .input('Do_No', Do_No)
                .input('Do_Year', Year_Id)

                .input('Do_Date', Do_Date)
                .input('Branch_Id', sql.Int, Branch_Id)
                .input('Retailer_Id', Retailer_Id)
                .input('Delivery_Person_Id', 0)
                .input('Narration', Narration)
                .input('So_No', checkIsNumber(So_No) ? So_No : null)
                .input('Cancel_status', toNumber(Cancel_status))

                .input('GST_Inclusive', sql.Int, GST_Inclusive)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('CSGT_Total', CGST)
                .input('SGST_Total', SGST)
                .input('IGST_Total', IGST)
                .input('Round_off', Round_off)
                .input('Total_Expences', TotalExpences)
                .input('Total_Before_Tax', totalValueBeforeTaxValues.TotalValue)
                .input('Total_Tax', totalValueBeforeTaxValues.TotalTax)
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)

                .input('Trans_Type', 'INSERT')
                .input('Alter_Id', sql.BigInt, Alter_Id)
                .input('Created_by', sql.BigInt, Created_by)
                .input('Created_on', sql.DateTime, new Date())
                .query(`
                    INSERT INTO tbl_Sales_Delivery_Gen_Info (
                        Do_Id, Do_Inv_No, Voucher_Type, Do_No, Do_Year, 
                        Do_Date, Branch_Id, Retailer_Id, Delivery_Person_Id, Narration, So_No, Cancel_status,
                        GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, Round_off, 
                        Total_Before_Tax, Total_Tax, Total_Invoice_value, Stock_Item_Ledger_Name,
                        Trans_Type, Alter_Id, Created_by, Created_on
                    ) VALUES (
                        @Do_Id, @Do_Inv_No, @Voucher_Type, @Do_No, @Do_Year,
                        @Do_Date, @Branch_Id, @Retailer_Id, @Delivery_Person_Id, @Narration, @So_No, @Cancel_status,
                        @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, @Round_off, 
                        @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Stock_Item_Ledger_Name,
                        @Trans_Type, @Alter_Id, @Created_by, @Created_on
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create general info in sales invoice')
            }

            const isSO = checkIsNumber(So_No);

            const { stockRows } = buildBulkSalesRows(toArray(Product_Array), productsData, {
                isInclusive,
                isNotTaxableBill,
                isIGST,
                isSO
            });

            const productInsertingRequest = new sql.Request(transaction)
                .input('Do_Date', Do_Date)
                .input('Do_Id', Do_Id)
                .input('SalesJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
                .query(`
                    DECLARE @batchDetails TABLE (
                        DO_St_Id INT,
                        Item_Id BIGINT,
                        Bill_Qty DECIMAL(18,2),
                        GoDown_Id BIGINT,
                        Batch_Name NVARCHAR(200)
                    );
                    INSERT INTO tbl_Sales_Delivery_Stock_Info (
                        Do_Date, Delivery_Order_Id, S_No, Item_Id,
                        Bill_Qty, Act_Qty, Alt_Act_Qty,
                        Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                        Taxble, Taxable_Rate, HSN_Code,
                        Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id,
                        Taxable_Amount, Tax_Rate,
                        Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on,
                        Batch_Name
                    )
                    OUTPUT
                        inserted.DO_St_Id,
                        inserted.Item_Id,
                        inserted.Bill_Qty,
                        inserted.GoDown_Id,
                        inserted.Batch_Name
                    INTO @batchDetails (DO_St_Id, Item_Id, Bill_Qty, GoDown_Id, Batch_Name)
                    SELECT
                        @Do_Date, @Do_Id, p.S_No, p.Item_Id,
                        p.Bill_Qty, p.Act_Qty, p.Alt_Act_Qty,
                        p.Item_Rate, p.GoDown_Id, p.Amount, p.Free_Qty, p.Total_Qty,
                        p.Taxble, p.Taxable_Rate, p.HSN_Code,
                        p.Unit_Id, p.Unit_Name, p.Act_unit_Id, p.Alt_Act_Unit_Id,
                        p.Taxable_Amount, p.Tax_Rate,
                        p.Cgst, p.Cgst_Amo, p.Sgst, p.Sgst_Amo, p.Igst, p.Igst_Amo, p.Final_Amo, GETDATE(), 
                        p.Batch_Name
                    FROM OPENJSON(@SalesJson, '$.rows')
                    WITH (
                        S_No INT '$.S_No',
                        Item_Id BIGINT '$.Item_Id',
                        Bill_Qty DECIMAL(18,2) '$.Bill_Qty',
                        Act_Qty DECIMAL(18,2) '$.Act_Qty',
                        Alt_Act_Qty DECIMAL(18,2) '$.Alt_Act_Qty',
                        Item_Rate DECIMAL(18,2) '$.Item_Rate',
                        GoDown_Id BIGINT '$.GoDown_Id',
                        Amount DECIMAL(18,2) '$.Amount',
                        Free_Qty DECIMAL(18,2) '$.Free_Qty',
                        Total_Qty DECIMAL(18,2) '$.Total_Qty',
                        Taxble BIT '$.Taxble',
                        Taxable_Rate DECIMAL(18,2) '$.Taxable_Rate',
                        HSN_Code NVARCHAR(50) '$.HSN_Code',
                        Unit_Id NVARCHAR(50) '$.Unit_Id',
                        Unit_Name NVARCHAR(200) '$.Unit_Name',
                        Act_unit_Id NVARCHAR(50) '$.Act_unit_Id',
                        Alt_Act_Unit_Id NVARCHAR(50) '$.Alt_Act_Unit_Id',
                        Taxable_Amount DECIMAL(18,2) '$.Taxable_Amount',
                        Tax_Rate DECIMAL(18,2) '$.Tax_Rate',
                        Cgst DECIMAL(18,2) '$.Cgst',
                        Cgst_Amo DECIMAL(18,2) '$.Cgst_Amo',
                        Sgst DECIMAL(18,2) '$.Sgst',
                        Sgst_Amo DECIMAL(18,2) '$.Sgst_Amo',
                        Igst DECIMAL(18,2) '$.Igst',
                        Igst_Amo DECIMAL(18,2) '$.Igst_Amo',
                        Final_Amo DECIMAL(18,2) '$.Final_Amo',
                        Batch_Name NVARCHAR(200) '$.Batch_Name'
                    ) AS p;
                    -- return created batch details with id
                    SELECT * FROM @batchDetails;`
                );

            const productInsertResult = await productInsertingRequest;

            const batchCreationDetails = toArray(productInsertResult.recordset).filter(
                fil => fil.Batch_Name
            );

            if (batchCreationDetails.length > 0) {
                const batchConsumptionAddRequest = new sql.Request(transaction)
                    .input('Do_Date', sql.DateTime, new Date(Do_Date))
                    .input('batchJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: batchCreationDetails }))
                    .input('Created_by', sql.BigInt, Created_by)
                    .query(`
                        -- latest obid
                        DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                        INSERT INTO tbl_Batch_Transaction (
                            batch_id, batch, trans_date, item_id, godown_id, quantity, type, reference_id, created_by, ob_id
                        )
                        SELECT b.*
                        FROM (
                            SELECT 
                                COALESCE((
                                    SELECT TOP (1) id 
                                    FROM tbl_Batch_Master 
                                    WHERE item_id = p.Item_Id AND godown_id = p.GoDown_Id AND batch = p.Batch_Name
                                ), NULL) AS batch_id,
                                p.Batch_Name AS batch,
                                @Do_Date     AS trans_date,
                                p.Item_Id    AS item_id,
                                p.GoDown_Id  AS godown_id,
                                ISNULL(p.Bill_Qty, 0) AS quantity,
                                'SALES' AS type,
                                p.DO_St_Id AS reference_id,
                                @Created_by  AS created_by,
                                @openingId
                            FROM OPENJSON(@batchJson, '$.rows')
                            WITH (
                                DO_St_Id   INT            '$.DO_St_Id',
                                Item_Id    BIGINT         '$.Item_Id',
                                Bill_Qty   DECIMAL(18,2)  '$.Bill_Qty',   -- kept just in case; we don't use it
                                GoDown_Id  BIGINT         '$.GoDown_Id',
                                Batch_Name NVARCHAR(200)  '$.Batch_Name'
                            ) p
                        ) b
                        WHERE b.batch_id IS NOT NULL; `);

                await batchConsumptionAddRequest;
            }

            if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
                for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                    const exp = Expence_Array[expInd];
                    const Expence_Value_DR = toNumber(exp?.Expence_Value) >= 0 ? toNumber(exp?.Expence_Value) : 0;
                    const Expence_Value_CR = toNumber(exp?.Expence_Value) < 0 ? toNumber(exp?.Expence_Value) : 0;

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', expInd + 1)
                        .input('Expense_Id', toNumber(exp?.Expense_Id))
                        .input('Expence_Value_DR', Expence_Value_DR)
                        .input('Expence_Value_CR', Math.abs(Expence_Value_CR))
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert Expence row in sales invoice creation');
                    }
                }
            }

            const taxTypes = [
                { expName: 'CGST', Value: CGST },
                { expName: 'SGST', Value: SGST },
                { expName: 'IGST', Value: IGST },
                { expName: 'ROUNDOFF', Value: Round_off }
            ].filter(fil => toNumber(fil.Value) !== 0);

            let snoOffset = toNumber(Expence_Array?.length) || 0;

            const getExpName = new sql.Request();
            taxTypes.forEach((t, i) => getExpName.input(`exp${i}`, t.expName));
            const inClause = taxTypes.map((_, i) => `@exp${i}`).join(', ');

            if (taxTypes.length > 0) {
                const getCurrespondingAccount = getExpName.query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE AC_Reason IN (${inClause}) 
                    AND Acc_Id IS NOT NULL;`
                );

                const expData = (await getCurrespondingAccount).recordset;

                const missing = taxTypes.filter(exp =>
                    !expData.some(row => stringCompare(row.AC_Reason, exp.expName))
                );

                if (missing.length > 0) {
                    throw new Error(`Expense id not mapped: ${missing.map(m => m.expName).join(', ')}`);
                }

                for (let i = 0; i < taxTypes.length; i++) {
                    const { expName, Value } = taxTypes[i];
                    const numValue = Number(Value);
                    const Expense_Id = expData.find(exp => stringCompare(exp.AC_Reason, expName)).Acc_Id;

                    const Expence_Value_DR = numValue >= 0 ? numValue : 0;
                    const Expence_Value_CR = numValue < 0 ? Math.abs(numValue) : 0;

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', snoOffset + i + 1)
                        .input('Expense_Id', Expense_Id)
                        .input('Expence_Value_DR', Expence_Value_DR)
                        .input('Expence_Value_CR', Expence_Value_CR)
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                        );

                    const result = await request;
                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert tax expense row');
                    }
                }
            }

            if (Array.isArray(Staffs_Array) && Staffs_Array.length > 0) {
                for (const staff of Staffs_Array) {
                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Emp_Id', toNumber(staff?.Emp_Id))
                        .input('Emp_Type_Id', toNumber(staff?.Emp_Type_Id))
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Staff_Info (
                                Do_Id, Emp_Id, Emp_Type_Id
                            ) VALUES (
                                @Do_Id, @Emp_Id, @Emp_Type_Id
                            )`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert Staff row in sales invoice creation');
                    }
                }
            }

            await transaction.commit();

            success(res, 'Invoice created!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const getSalesInvoice = async (req, res) => {
        try {
            const { Retailer_Id, Cancel_status = 0, Created_by, VoucherType } = req.query;
            const
                Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
                Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

            const getCurrespondingAccount = new sql.Request()
                .query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE 
                        Type = 'DEFAULT' 
                        AND Acc_Id IS NOT NULL;`
                );

            const expData = (await getCurrespondingAccount).recordset;

            const excludeList = expData.map(exp => exp.Acc_Id).join(', ');

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('retailer', Retailer_Id)
                .input('cancel', Cancel_status)
                .input('creater', Created_by)
                .input('VoucherType', VoucherType)
                .query(`
                    -- declaring table variable
                    DECLARE @FilteredInvoice TABLE (Do_Id INT);
                    -- inserting data to temp table
                    INSERT INTO @FilteredInvoice (Do_Id)
                    SELECT Do_Id
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE 
                        Do_Date BETWEEN @Fromdate AND @Todate
                        ${checkIsNumber(Retailer_Id) ? ' AND Retailer_Id = @retailer ' : ''}
                        ${checkIsNumber(Cancel_status) ? ' AND Cancel_status = @cancel ' : ''}
                        ${checkIsNumber(Created_by) ? ' AND Created_by = @creater ' : ''}
                        ${checkIsNumber(VoucherType) ? ' AND Voucher_Type = @VoucherType ' : ''};
                    -- sales general details
                    SELECT 
                        sdgi.Do_Id, sdgi.Do_Inv_No, sdgi.Voucher_Type, sdgi.Do_No, sdgi.Do_Year,
                        sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
                        sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, sdgi.Total_Expences, 
                        sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
                        sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on, sdgi.Stock_Item_Ledger_Name,
                        COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                        COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                        COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    	COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                    FROM 
                        tbl_Sales_Delivery_Gen_Info AS sdgi
                    LEFT JOIN tbl_Retailers_Master AS rm 
                        ON rm.Retailer_Id = sdgi.Retailer_Id
                    LEFT JOIN tbl_Branch_Master AS bm 
                        ON bm.BranchId = sdgi.Branch_Id
                    LEFT JOIN tbl_Users AS cb 
                        ON cb.UserId = sdgi.Created_by
                    LEFT JOIN tbl_Voucher_Type AS v
                        ON v.Vocher_Type_Id = sdgi.Voucher_Type
                    WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);
                    -- product details
                    SELECT
                        oi.*,
                        pm.Product_Id,
                        COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                        COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                        COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                        COALESCE(u.Units, 'not available') AS UOM,
                        COALESCE(b.Brand_Name, 'not available') AS BrandGet
                    FROM tbl_Sales_Delivery_Stock_Info AS oi
                    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                    LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                    LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
                    WHERE oi.Delivery_Order_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);
                    -- expence details
                    SELECT 
                        exp.*, 
                        em.Account_name AS Expence_Name, 
                    	CASE  
                    		WHEN exp.Expence_Value_DR > 0 THEN -exp.Expence_Value_DR 
                    		ELSE exp.Expence_Value_CR
                    	END AS Expence_Value
                    FROM tbl_Sales_Delivery_Expence_Info AS exp
                    LEFT JOIN tbl_Account_Master AS em
                        ON em.Acc_Id = exp.Expense_Id
                    WHERE 
                        exp.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
                        ${excludeList ? ` AND exp.Expense_Id NOT IN (${excludeList}) ` : ''};
                    -- staff involved
                    SELECT 
                        stf.*,
                        e.Cost_Center_Name AS Emp_Name,
                        cc.Cost_Category AS Involved_Emp_Type
                    FROM tbl_Sales_Delivery_Staff_Info AS stf
                    LEFT JOIN tbl_ERP_Cost_Center AS e
                        ON e.Cost_Center_Id = stf.Emp_Id
                    LEFT JOIN tbl_ERP_Cost_Category AS cc
                        ON cc.Cost_Category_Id = stf.Emp_Type_Id
                    WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);`
                );

            const result = await request;

            const SalesGeneralInfo = toArray(result.recordsets[0]);
            const Products_List = toArray(result.recordsets[1]);
            const Expence_Array = toArray(result.recordsets[2]);
            const Staffs_Array = toArray(result.recordsets[3]);

            if (SalesGeneralInfo.length > 0) {
                const resData = SalesGeneralInfo.map(row => ({
                    ...row,
                    Products_List: Products_List.filter(
                        fil => isEqualNumber(fil.Delivery_Order_Id, row.Do_Id)
                    ),
                    Expence_Array: Expence_Array.filter(
                        fil => isEqualNumber(fil.Do_Id, row.Do_Id)
                    ),
                    Staffs_Array: Staffs_Array.filter(
                        fil => isEqualNumber(fil.Do_Id, row.Do_Id)
                    )
                }));

                dataFound(res, resData);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const updateSalesInvoice = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Do_Id, Retailer_Id, Branch_Id, So_No, Voucher_Type = '', Cancel_status,
                Narration = null, Altered_by, GST_Inclusive = 1, IS_IGST = 0, Round_off = 0,
                Product_Array = [], Expence_Array = [], Staffs_Array = [], Stock_Item_Ledger_Name = ''
            } = req.body;

            const Do_Date = req?.body?.Do_Date ? ISOString(req?.body?.Do_Date) : ISOString();
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

            if (
                !checkIsNumber(Do_Id)
                || !checkIsNumber(Retailer_Id)
                || !checkIsNumber(Altered_by)
                || !checkIsNumber(Voucher_Type)
                || !Array.isArray(Product_Array) || Product_Array.length === 0
            ) {
                return invalidInput(res, 'Please select Required Fields')
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            const TotalExpences = toNumber(RoundNumber(
                toArray(Expence_Array).reduce((acc, exp) => Addition(acc, exp?.Expence_Value), 0)
            ));

            const Total_Invoice_value = RoundNumber(
                Addition(
                    TotalExpences,
                    Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate);
                        const billQty = RoundNumber(item?.Bill_Qty);
                        const Amount = Multiplication(billQty, itemRate);

                        if (isNotTaxableBill) return Addition(acc, Amount);

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                        if (isInclusive) {
                            return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'remove').with_tax);
                        } else {
                            return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'add').with_tax);
                        }
                    }, 0)
                )
            );

            const totalValueBeforeTax = () => {
                const productTax = Product_Array.reduce((acc, item) => {
                    const itemRate = RoundNumber(item?.Item_Rate);
                    const billQty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(billQty, itemRate);

                    if (isNotTaxableBill) return {
                        TotalValue: Addition(acc.TotalValue, Amount),
                        TotalTax: 0
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                    const taxInfo = calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add');
                    const TotalValue = Addition(acc.TotalValue, taxInfo.without_tax);
                    const TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount);

                    return {
                        TotalValue, TotalTax
                    };
                }, {
                    TotalValue: 0,
                    TotalTax: 0
                });

                const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => Addition(
                    acc,
                    IS_IGST ? exp?.Igst_Amo : Addition(exp?.Cgst_Amo, exp?.Sgst_Amo)
                ), 0);

                return {
                    TotalValue: productTax.TotalValue,
                    TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
                }
            };

            const totalValueBeforeTaxValues = totalValueBeforeTax();

            const CGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const SGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const IGST = isIGST ? totalValueBeforeTaxValues.TotalTax : 0;
            // const Round_off = RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value);

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('Do_Id', Do_Id)
                .input('Voucher_Type', Voucher_Type)
                .input('Do_Date', Do_Date)
                .input('Branch_Id', sql.Int, Branch_Id)
                .input('Retailer_Id', Retailer_Id)
                .input('Narration', Narration)
                .input('So_No', checkIsNumber(So_No) ? So_No : null)
                .input('Cancel_status', toNumber(Cancel_status))
                .input('GST_Inclusive', sql.Int, GST_Inclusive)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('CSGT_Total', CGST)
                .input('SGST_Total', SGST)
                .input('IGST_Total', IGST)
                .input('Round_off', Round_off)
                .input('Total_Expences', TotalExpences)
                .input('Total_Before_Tax', totalValueBeforeTaxValues.TotalValue)
                .input('Total_Tax', totalValueBeforeTaxValues.TotalTax)
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)
                .input('Trans_Type', 'UPDATE')
                .input('Alter_Id', sql.BigInt, Alter_Id)
                .input('Altered_by', sql.BigInt, Altered_by)
                .input('Alterd_on', sql.DateTime, new Date())
                .query(`
                    UPDATE tbl_Sales_Delivery_Gen_Info 
                    SET 
                        Voucher_Type = @Voucher_Type,
                        Do_Date = @Do_Date,
                        Branch_Id = @Branch_Id,
                        Retailer_Id = @Retailer_Id,
                        Narration = @Narration,
                        So_No = @So_No,
                        Cancel_status = @Cancel_status,
                        GST_Inclusive = @GST_Inclusive,
                        IS_IGST = @IS_IGST,
                        CSGT_Total = @CSGT_Total,
                        SGST_Total = @SGST_Total,
                        IGST_Total = @IGST_Total,
                        Total_Expences = @Total_Expences,
                        Round_off = @Round_off,
                        Total_Before_Tax = @Total_Before_Tax,
                        Total_Tax = @Total_Tax,
                        Total_Invoice_value = @Total_Invoice_value,
                        Stock_Item_Ledger_Name = @Stock_Item_Ledger_Name,
                        Trans_Type = @Trans_Type,
                        Alter_Id = @Alter_Id,
                        Altered_by = @Altered_by,
                        Alterd_on = GETDATE()
                    WHERE
                        Do_Id = @Do_Id`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create general info in sales invoice')
            }

            const deleteDetailsRows = new sql.Request(transaction)
                .input('Do_Id', Do_Id)
                .input('created_by', sql.BigInt, Altered_by)
                .query(`
                    DELETE FROM tbl_Batch_Transaction 
                    WHERE reference_id IN (
                        SELECT Delivery_Order_Id 
                        FROM tbl_Sales_Delivery_Stock_Info AS sd
                        WHERE 
                            sd.Delivery_Order_Id = @Do_Id 
                            AND sd.Batch_Name IS NOT NULL 
                            AND LTRIM(RTRIM(sd.Batch_Name)) <> ''
                    )
                    DELETE FROM tbl_Sales_Delivery_Stock_Info WHERE Delivery_Order_Id = @Do_Id;
                    DELETE FROM tbl_Sales_Delivery_Expence_Info WHERE Do_Id = @Do_Id;
                    DELETE FROM tbl_Sales_Delivery_Staff_Info WHERE Do_Id = @Do_Id;`
                );

            await deleteDetailsRows;

            const isSO = checkIsNumber(So_No)

            const { stockRows } = buildBulkSalesRows(toArray(Product_Array), productsData, {
                isInclusive,
                isNotTaxableBill,
                isIGST,
                isSO
            });

            const productInsertingRequest = new sql.Request(transaction)
                .input('Do_Date', Do_Date)
                .input('Do_Id', Do_Id)
                .input('SalesJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
                .query(`
                    DECLARE @batchDetails TABLE (
                        DO_St_Id INT,
                        Item_Id BIGINT,
                        Bill_Qty DECIMAL(18,2),
                        GoDown_Id BIGINT,
                        Batch_Name NVARCHAR(200)
                    );
                    INSERT INTO tbl_Sales_Delivery_Stock_Info (
                        Do_Date, Delivery_Order_Id, S_No, Item_Id,
                        Bill_Qty, Act_Qty, Alt_Act_Qty,
                        Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                        Taxble, Taxable_Rate, HSN_Code,
                        Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id,
                        Taxable_Amount, Tax_Rate,
                        Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on,
                        Batch_Name
                    )
                    OUTPUT
                        inserted.DO_St_Id,
                        inserted.Item_Id,
                        inserted.Bill_Qty,
                        inserted.GoDown_Id,
                        inserted.Batch_Name
                    INTO @batchDetails (DO_St_Id, Item_Id, Bill_Qty, GoDown_Id, Batch_Name)
                    SELECT
                        @Do_Date, @Do_Id, p.S_No, p.Item_Id,
                        p.Bill_Qty, p.Act_Qty, p.Alt_Act_Qty,
                        p.Item_Rate, p.GoDown_Id, p.Amount, p.Free_Qty, p.Total_Qty,
                        p.Taxble, p.Taxable_Rate, p.HSN_Code,
                        p.Unit_Id, p.Unit_Name, p.Act_unit_Id, p.Alt_Act_Unit_Id,
                        p.Taxable_Amount, p.Tax_Rate,
                        p.Cgst, p.Cgst_Amo, p.Sgst, p.Sgst_Amo, p.Igst, p.Igst_Amo, p.Final_Amo, GETDATE(), 
                        p.Batch_Name
                    FROM OPENJSON(@SalesJson, '$.rows')
                    WITH (
                        S_No INT '$.S_No',
                        Item_Id BIGINT '$.Item_Id',
                        Bill_Qty DECIMAL(18,2) '$.Bill_Qty',
                        Act_Qty DECIMAL(18,2) '$.Act_Qty',
                        Alt_Act_Qty DECIMAL(18,2) '$.Alt_Act_Qty',
                        Item_Rate DECIMAL(18,2) '$.Item_Rate',
                        GoDown_Id BIGINT '$.GoDown_Id',
                        Amount DECIMAL(18,2) '$.Amount',
                        Free_Qty DECIMAL(18,2) '$.Free_Qty',
                        Total_Qty DECIMAL(18,2) '$.Total_Qty',
                        Taxble BIT '$.Taxble',
                        Taxable_Rate DECIMAL(18,2) '$.Taxable_Rate',
                        HSN_Code NVARCHAR(50) '$.HSN_Code',
                        Unit_Id NVARCHAR(50) '$.Unit_Id',
                        Unit_Name NVARCHAR(200) '$.Unit_Name',
                        Act_unit_Id NVARCHAR(50) '$.Act_unit_Id',
                        Alt_Act_Unit_Id NVARCHAR(50) '$.Alt_Act_Unit_Id',
                        Taxable_Amount DECIMAL(18,2) '$.Taxable_Amount',
                        Tax_Rate DECIMAL(18,2) '$.Tax_Rate',
                        Cgst DECIMAL(18,2) '$.Cgst',
                        Cgst_Amo DECIMAL(18,2) '$.Cgst_Amo',
                        Sgst DECIMAL(18,2) '$.Sgst',
                        Sgst_Amo DECIMAL(18,2) '$.Sgst_Amo',
                        Igst DECIMAL(18,2) '$.Igst',
                        Igst_Amo DECIMAL(18,2) '$.Igst_Amo',
                        Final_Amo DECIMAL(18,2) '$.Final_Amo',
                        Batch_Name NVARCHAR(200) '$.Batch_Name'
                    ) AS p;
                    -- return created batch details with id
                    SELECT * FROM @batchDetails;`
                );

            const productInsertResult = await productInsertingRequest;

            const batchCreationDetails = toArray(productInsertResult.recordset).filter(
                fil => fil.Batch_Name
            );

            if (batchCreationDetails.length > 0) {
                const batchConsumptionAddRequest = new sql.Request(transaction)
                    .input('Do_Date', sql.DateTime, new Date(Do_Date))
                    .input('batchJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: batchCreationDetails }))
                    .input('Created_by', sql.BigInt, Altered_by)
                    .query(`
                        -- latest obid
                        DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                        INSERT INTO tbl_Batch_Transaction (
                            batch_id, batch, trans_date, item_id, godown_id, quantity, type, reference_id, created_by, ob_id
                        )
                        SELECT b.*
                        FROM (
                            SELECT 
                                COALESCE((
                                    SELECT TOP (1) id 
                                    FROM tbl_Batch_Master 
                                    WHERE item_id = p.Item_Id AND godown_id = p.GoDown_Id AND batch = p.Batch_Name
                                ), NULL) AS batch_id,
                                p.Batch_Name AS batch,
                                @Do_Date     AS trans_date,
                                p.Item_Id    AS item_id,
                                p.GoDown_Id  AS godown_id,
                                ISNULL(p.Bill_Qty, 0) AS quantity,
                                'SALES' AS type,
                                p.DO_St_Id AS reference_id,
                                @Created_by  AS created_by,
                                @openingId
                            FROM OPENJSON(@batchJson, '$.rows')
                            WITH (
                                DO_St_Id   INT            '$.DO_St_Id',
                                Item_Id    BIGINT         '$.Item_Id',
                                Bill_Qty   DECIMAL(18,2)  '$.Bill_Qty',   
                                GoDown_Id  BIGINT         '$.GoDown_Id',
                                Batch_Name NVARCHAR(200)  '$.Batch_Name'
                            ) p
                        ) b
                        WHERE b.batch_id IS NOT NULL; `);

                await batchConsumptionAddRequest;
            }

            if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
                for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                    const exp = Expence_Array[expInd];
                    const Expence_Value_DR = toNumber(exp?.Expence_Value) >= 0 ? toNumber(exp?.Expence_Value) : 0;
                    const Expence_Value_CR = toNumber(exp?.Expence_Value) < 0 ? toNumber(exp?.Expence_Value) : 0;

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', expInd + 1)
                        .input('Expense_Id', toNumber(exp?.Expense_Id))
                        .input('Expence_Value_DR', Expence_Value_DR)
                        .input('Expence_Value_CR', Math.abs(Expence_Value_CR))
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert Expence row in sales invoice creation');
                    }
                }
            }

            const taxTypes = [
                { expName: 'CGST', Value: CGST },
                { expName: 'SGST', Value: SGST },
                { expName: 'IGST', Value: IGST },
                { expName: 'ROUNDOFF', Value: Round_off }
            ].filter(fil => toNumber(fil.Value) !== 0);

            let snoOffset = toNumber(Expence_Array?.length) || 0;

            const getExpName = new sql.Request();
            taxTypes.forEach((t, i) => getExpName.input(`exp${i}`, t.expName));
            const inClause = taxTypes.map((_, i) => `@exp${i}`).join(', ');

            if (taxTypes.length > 0) {
                const getCurrespondingAccount = getExpName.query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE AC_Reason IN (${inClause}) 
                    AND Acc_Id IS NOT NULL;`
                );

                const expData = (await getCurrespondingAccount).recordset;

                const missing = taxTypes.filter(exp =>
                    !expData.some(row => stringCompare(row.AC_Reason, exp.expName))
                );

                if (missing.length > 0) {
                    throw new Error(`Expense id not mapped: ${missing.map(m => m.expName).join(', ')}`);
                }

                for (let i = 0; i < taxTypes.length; i++) {
                    const { expName, Value } = taxTypes[i];
                    const numValue = toNumber(Value);
                    const Expense_Id = expData.find(exp => stringCompare(exp.AC_Reason, expName)).Acc_Id;

                    const Expence_Value_DR = numValue >= 0 ? numValue : 0;
                    const Expence_Value_CR = numValue < 0 ? Math.abs(numValue) : 0;

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', snoOffset + i + 1)
                        .input('Expense_Id', Expense_Id)
                        .input('Expence_Value_DR', Expence_Value_DR)
                        .input('Expence_Value_CR', Expence_Value_CR)
                        .query(`
                        INSERT INTO tbl_Sales_Delivery_Expence_Info (
                            Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                        ) VALUES (
                            @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                        )`
                        );

                    const result = await request;
                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert tax expense row');
                    }
                }
            }

            if (Array.isArray(Staffs_Array) && Staffs_Array.length > 0) {
                for (const staff of Staffs_Array) {
                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Emp_Id', toNumber(staff?.Emp_Id))
                        .input('Emp_Type_Id', toNumber(staff?.Emp_Type_Id))
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Staff_Info (
                                Do_Id, Emp_Id, Emp_Type_Id
                            ) VALUES (
                                @Do_Id, @Emp_Id, @Emp_Type_Id
                            )`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert Staff row in sales invoice creation');
                    }
                }
            }

            await transaction.commit();

            success(res, 'Changes saved!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const getFilterValues = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    -- Voucher
                    SELECT DISTINCT rec.Voucher_Type AS value, v.Voucher_Type AS label
                    FROM tbl_Sales_Delivery_Gen_Info AS rec
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = rec.Voucher_Type
                    -- Retailer
                    SELECT DISTINCT rec.Retailer_Id AS value, r.Retailer_Name AS label
                    FROM tbl_Sales_Delivery_Gen_Info AS rec
                    LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = rec.Retailer_Id
                    -- Created By
                    SELECT DISTINCT rec.Created_by AS value, u.Name AS label
                    FROM tbl_Sales_Delivery_Gen_Info AS rec
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = rec.Created_by;`
                );

            const result = await request;

            dataFound(res, [], 'data found', {
                voucherType: toArray(result.recordsets[0]),
                retailers: toArray(result.recordsets[1]),
                createdBy: toArray(result.recordsets[2])
            });
        } catch (e) {
            servError(e, res);
        }
    }

    const getStockInHandGodownWise = async (req, res) => {
        try {
            const { Godown_Id, Item_Id } = req.query;
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .input('Godown_Id', sql.Int, toNumber(Godown_Id))
                .input('Item_Id', sql.Int, toNumber(Item_Id))
                .execute('Stock_Summarry_Search_Godown_New');

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getSalesExpenceAccount = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    WITH GroupHierarchy AS (
                        SELECT 
                            AG.Group_Id,
                            AG.ERP_Id,
                            AG.Group_Name,
                            AG.Alias_name,
                            AG.Parent_AC_id
                        FROM dbo.tbl_Accounting_Group AS AG
                    	LEFT JOIN tbl_Account_Master AS A ON 
                    		A.Group_Id = AG.Group_Id
                        WHERE AG.Group_Id IN (14, 633) 
                        UNION ALL
                        SELECT 
                            ag.Group_Id,
                            ag.ERP_Id,
                            ag.Group_Name,
                            ag.Alias_name,
                            ag.Parent_AC_id
                        FROM dbo.tbl_Accounting_Group ag
                        INNER JOIN GroupHierarchy gh ON 
                    		ag.Parent_AC_id = gh.Group_Id
                    )
                    SELECT 
                        am.Acc_Id AS Id,
                        am.Account_name AS Expence_Name
                    FROM dbo.tbl_Account_Master am
                    WHERE 
                    	am.Group_Id IN (
                    		SELECT DISTINCT Group_Id 
                    		FROM GroupHierarchy
                    	) OR am.Acc_Id IN (8056)`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const salesTallySync = async (req, res) => {
        try {
            const request = new sql.Request().execute('sales_Tally_Sync_3');
            await request;
            success(res, 'Sync completed')
        } catch (e) {
            servError(e, res);
        }
    }

    const liveSalesCreation = async (req, res) => {

        const {
            Branch_Id = 0,
            Narration = null,
            Created_by,
            GST_Inclusive = 1,
            IS_IGST = 0,
            credit_ledger = 0,
            credit_ledger_name = '',
            debit_ledger = 0,
            debit_ledger_name = '',
            credit_amount = 0,
            Staff_Involved_List = [
                // EmpId, EmpTypeId
            ],
            Product_Array = [
                // Item_Id, Bill_Qty, Item_Rate, UOM, Units
            ],
            createReceipt = true
        } = req.body;

        const transaction = new sql.Transaction();

        try {

            const invoiceDate = ISOString(req?.body?.invoiceDate);

            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

            if (
                toNumber(Created_by) === 0
                || (toNumber(credit_ledger) === 0 && createReceipt)
                || (toNumber(debit_ledger) === 0 && createReceipt)
                || (toNumber(credit_amount) === 0 && createReceipt)
                || toNumber(Branch_Id) === 0
                || toArray(Product_Array).length === 0
            ) {
                return invalidInput(res, 'Created_by, Items is Required')
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            // unique Sale order id

            const So_Id_Get = await getNextId({ table: 'tbl_Sales_Order_Gen_Info', column: 'So_Id' });
            const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });
            const receipt_id_get = await getNextId({ table: 'tbl_Receipt_General_Info', column: 'receipt_id' });

            if (!So_Id_Get.status || !checkIsNumber(So_Id_Get.MaxId)) throw new Error('Failed to get So_Id_Get');
            if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');
            if (!receipt_id_get.status || !checkIsNumber(receipt_id_get.MaxId)) throw new Error('Failed to get receipt_id');

            const So_Id = So_Id_Get.MaxId;
            const Do_Id = getDo_Id.MaxId;
            const receipt_id = receipt_id_get.MaxId;

            // year id and year code

            const yearDetails = await new sql.Request()
                .input('invoiceDate', invoiceDate)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE Fin_Start_Date <= @invoiceDate AND Fin_End_Date >= @invoiceDate`);

            if (yearDetails.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = yearDetails.recordset[0];

            // voucher code

            const voucherData = await new sql.Request()
                .input('saleOrderVoucher', 'LIVE_SALE_ORDER')
                .input('salesInvoiceVoucher', 'LIVE_SALES_INVOICE')
                .input('receiptVoucher', 'LIVE_RECEIPT')
                .query(`
                    SELECT Vocher_Type_Id as vid, Voucher_Type as vt, Voucher_Code as vc 
                    FROM tbl_Voucher_Type 
                    WHERE Voucher_Type IN (
                        @saleOrderVoucher, @salesInvoiceVoucher, @receiptVoucher
                    ) AND Type IN ('RECEIPT', 'SALES', 'SALE ORDER', 'SALEORDER', 'SALE_ORDER');`
                );

            const VoucherCode = voucherData.recordset;

            if (VoucherCode.length < 3) throw new Error('Failed to get Voucher Code in live sales');

            const saleOrderVoucher = VoucherCode.find(v => stringCompare(v.vt, 'LIVE_SALE_ORDER'));
            const salesInvoiceVoucher = VoucherCode.find(v => stringCompare(v.vt, 'LIVE_SALES_INVOICE'));
            const receiptVoucher = VoucherCode.find(v => stringCompare(v.vt, 'LIVE_RECEIPT'));

            // voucher based serial number

            const voucherBasedSno = await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('saleOrderVoucher', saleOrderVoucher.vid)
                .input('salesInvoiceVoucher', salesInvoiceVoucher.vid)
                .input('receiptVoucher', receiptVoucher.vid)
                .query(`
                    -- sale order
                    SELECT COALESCE(MAX(So_Branch_Inv_Id), 0) + 1 AS So_Branch_Inv_Id
                    FROM tbl_Sales_Order_Gen_Info
                    WHERE So_Year = @Year_Id AND VoucherType = @saleOrderVoucher;
                    -- sales invoice
                    SELECT COALESCE(MAX(Do_No), 0) + 1 AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Do_Year = @Year_Id
                    AND Voucher_Type = @salesInvoiceVoucher;
                    -- receipt 
                    SELECT COALESCE(MAX(receipt_sno), 0) + 1 AS receipt_sno
                    FROM tbl_Receipt_General_Info
                    WHERE year_id = @Year_Id AND receipt_voucher_type_id = @receiptVoucher;`
                )

            const [saleOrder, salesInvoice, receipt] = voucherBasedSno.recordsets.map(rs => rs[0]);

            const saleOrderSno = saleOrder.So_Branch_Inv_Id;
            const salesInvoiceSno = salesInvoice.Do_No;
            const receiptSno = receipt.receipt_sno;

            if (toNumber(saleOrderSno) === 0) throw new Error('Failed to get sale order id');
            if (toNumber(salesInvoiceSno) === 0) throw new Error('Failed to get sale invoice id');
            if (toNumber(receiptSno) === 0) throw new Error('Failed to get receipt id');

            // order code

            const So_Inv_No = `${saleOrderVoucher.vc}/${createPadString(saleOrderSno, 6)}/${Year_Desc}`;
            const Do_Inv_No = `${salesInvoiceVoucher.vc}/${createPadString(salesInvoiceSno, 6)}/${Year_Desc}`;
            const receipt_invoice_no = `${receiptVoucher.vc}/${createPadString(receiptSno, 6)}/${Year_Desc}`;

            // finding credit account 

            const getRetailerId = (await new sql.Request()
                .input('acc_id', credit_ledger)
                .query(`
                    SELECT TOP (1) r.Retailer_Id, r.Retailer_Name
                    FROM tbl_Account_Master AS a 
                    JOIN tbl_Retailers_Master AS r ON r.ERP_Id = a.ERP_Id
                    WHERE a.Acc_Id = @acc_id;`
                )).recordset[0];

            const { Retailer_Id, Retailer_Name } = getRetailerId;

            // tax calculation

            const Total_Invoice_value = RoundNumber(Product_Array.reduce((acc, item) => {
                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = RoundNumber(item?.Bill_Qty);
                const Amount = Multiplication(billQty, itemRate);

                if (isNotTaxableBill) return Addition(acc, Amount);

                const product = findProductDetails(productsData, item.Item_Id);
                const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                if (isInclusive) {
                    return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'remove').with_tax);
                } else {
                    return Addition(acc, calculateGSTDetails(Amount, gstPercentage, 'add').with_tax);
                }
            }, 0));

            const totalValueBeforeTax = () => {
                const productTax = Product_Array.reduce((acc, item) => {
                    const itemRate = RoundNumber(item?.Item_Rate);
                    const billQty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(billQty, itemRate);

                    if (isNotTaxableBill) return {
                        TotalValue: Addition(acc.TotalValue, Amount),
                        TotalTax: 0
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                    const taxInfo = calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add');
                    const TotalValue = Addition(acc.TotalValue, taxInfo.without_tax);
                    const TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount);

                    return {
                        TotalValue, TotalTax
                    };
                }, {
                    TotalValue: 0,
                    TotalTax: 0
                });

                return {
                    TotalValue: productTax.TotalValue,
                    TotalTax: productTax.TotalTax,
                }
            };

            const totalValueBeforeTaxValues = totalValueBeforeTax();

            const CGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const SGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
            const IGST = isIGST ? totalValueBeforeTaxValues.TotalTax : 0;

            const roundOff = Number(Total_Invoice_value) - (
                Number(totalValueBeforeTaxValues.TotalValue) + Number(CGST) + Number(SGST) + Number(IGST)
            );

            const Round_off = RoundNumber(Math.round(roundOff));

            await transaction.begin();

            const request = new sql.Request(transaction)

                .input('So_Id', So_Id)
                .input('Do_Id', Do_Id)

                .input('So_Inv_No', So_Inv_No)
                .input('Do_Inv_No', Do_Inv_No)

                .input('So_Year', Year_Id)
                .input('Do_Year', Year_Id)

                .input('So_Branch_Inv_Id', saleOrderSno)
                .input('Do_No', salesInvoiceSno)

                .input('So_Date', invoiceDate)
                .input('Do_Date', invoiceDate)

                .input('Branch_Id', Branch_Id)
                .input('Retailer_Id', Retailer_Id)
                .input('Narration', Narration)
                .input('So_No', So_Id)
                .input('Cancel_status', 0)
                .input('Total_Expences', 0)
                .input('Sales_Person_Id', Created_by)
                .input('Delivery_Person_Id', Created_by)

                .input('saleOrderVoucher', saleOrderVoucher.vid)
                .input('saleInvocieVoucher', salesInvoiceVoucher.vid)

                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', CGST)
                .input('SGST_Total', SGST)
                .input('IGST_Total', IGST)
                .input('IS_IGST', isIGST ? 1 : 0)

                .input('Round_off', Round_off)
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTaxValues.TotalValue)
                .input('Total_Tax', totalValueBeforeTaxValues.TotalTax)

                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)

                .input('Created_on', new Date())
                .input('Alterd_on', new Date())

                .input('Alter_Id', Alter_Id)
                .input('Trans_Type', 'INSERT')
                .query(`
                    INSERT INTO tbl_Sales_Order_Gen_Info (
                        So_Id, So_Inv_No, So_Year, So_Branch_Inv_Id, So_Date, 
                        Retailer_Id, Sales_Person_Id, Branch_Id, VoucherType, CSGT_Total, 
                        SGST_Total, IGST_Total, GST_Inclusive, IS_IGST, Round_off, 
                        Total_Invoice_value, Total_Before_Tax, Total_Tax,Narration, Cancel_status, 
                        Created_by, Altered_by, Alter_Id, Created_on, Alterd_on, Trans_Type
                    ) VALUES (
                        @So_Id, @So_Inv_No, @So_Year, @So_Branch_Inv_Id, @So_Date, 
                        @Retailer_Id, @Sales_Person_Id, @Branch_Id, @saleOrderVoucher, @CSGT_Total, 
                        @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                        @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                        @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                    );
                    INSERT INTO tbl_Sales_Delivery_Gen_Info (
                        Do_Id, Do_Inv_No, Voucher_Type, Do_No, Do_Year, 
                        Do_Date, Branch_Id, Retailer_Id, Delivery_Person_Id, Narration, So_No, Cancel_status,
                        GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, Round_off, 
                        Total_Before_Tax, Total_Tax, Total_Invoice_value,
                        Trans_Type, Alter_Id, Created_by, Created_on
                    ) VALUES (
                        @Do_Id, @Do_Inv_No, @saleInvocieVoucher, @Do_No, @Do_Year,
                        @Do_Date, @Branch_Id, @Retailer_Id, @Delivery_Person_Id, @Narration, @So_No, @Cancel_status,
                        @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, @Round_off, 
                        @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, 
                        @Trans_Type, @Alter_Id, @Created_by, @Created_on
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create order, Try again.');
            }

            if (result.rowsAffected[1] === 0) {
                throw new Error('Failed to create sales invoice, Try again.');
            }

            for (const [i, product] of Product_Array.entries()) {
                const productDetails = findProductDetails(productsData, product.Item_Id);

                const gstPercentage = isEqualNumber(IS_IGST, 1) ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                const request = new sql.Request(transaction)
                    // Common Inputs
                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Pre_Id', toNumber(product.Pre_Id) || null)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('Unit_Id', product.UOM ?? '')
                    .input('Unit_Name', product.Units ?? '')
                    .input('Taxable_Amount', gstInfo.base_amount)
                    .input('Tax_Rate', gstPercentage)
                    .input('Cgst', cgstPer)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())

                    // Sale Order Specific
                    .input('So_Date', invoiceDate)
                    .input('Sales_Order_Id', So_Id)

                    // Sales Invoice Specific
                    .input('Do_Date', invoiceDate) // Reused
                    .input('DeliveryOrder', Do_Id)
                    .input('Act_Qty', Bill_Qty)
                    .input('Alt_Act_Qty', Bill_Qty)
                    .input('GoDown_Id', checkIsNumber(product?.GoDown_Id) ? Number(product?.GoDown_Id) : null)
                    .input('Act_unit_Id', product.Act_unit_Id ? product.Act_unit_Id : product.UOM)
                    .input('Alt_Act_Unit_Id', product.Alt_Act_Unit_Id ? product.Alt_Act_Unit_Id : product.UOM)

                    .query(`
                        INSERT INTO tbl_Sales_Order_Stock_Info (
                            So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty,
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id,
                            Bill_Qty, Act_Qty, Alt_Act_Qty,
                            Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code,
                            Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id,
                            Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @DeliveryOrder, @S_No, @Item_Id,
                            @Bill_Qty, @Act_Qty, @Alt_Act_Qty,
                            @Item_Rate, @GoDown_Id, @Amount, @Free_Qty, @Total_Qty,
                            @Taxble, @Taxable_Rate, @HSN_Code,
                            @Unit_Id, @Unit_Name, @Act_unit_Id, @Alt_Act_Unit_Id,
                            @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    );

                const result = await request;
                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Sale Order and Invoice Product');
                }

                if (result.rowsAffected[1] === 0) {
                    throw new Error('Failed to insert Sale invoice product');
                }
            }

            for (const staff of toArray(Staff_Involved_List)) {
                await new sql.Request(transaction)
                    .input('So_Id', So_Id)
                    .input('Do_Id', Do_Id)
                    .input('Involved_Emp_Id', sql.Int, staff?.EmpId)
                    .input('Cost_Center_Type_Id', sql.Int, staff?.EmpTypeId)
                    .query(`
                        INSERT INTO tbl_Sales_Order_Staff_Info (
                            So_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );
                        INSERT INTO tbl_Sales_Delivery_Staff_Info (
                            Do_Id, Emp_Id, Emp_Type_Id
                        ) VALUES (
                            @Do_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );`
                    );
            }

            const taxTypes = [
                { expName: 'CGST', Value: CGST },
                { expName: 'SGST', Value: SGST },
                { expName: 'IGST', Value: IGST },
                { expName: 'ROUNDOFF', Value: Round_off }
            ].filter(fil => toNumber(fil.Value) !== 0);

            const getExpName = new sql.Request();
            taxTypes.forEach((t, i) => getExpName.input(`exp${i}`, t.expName));
            const inClause = taxTypes.map((_, i) => `@exp${i}`).join(', ');

            if (taxTypes.length > 0) {
                const getCurrespondingAccount = getExpName.query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE AC_Reason IN (${inClause}) 
                    AND Acc_Id IS NOT NULL;`
                );

                const expData = (await getCurrespondingAccount).recordset;

                const missing = taxTypes.filter(exp =>
                    !expData.some(row => stringCompare(row.AC_Reason, exp.expName))
                );

                if (missing.length > 0) {
                    throw new Error(`Expense id not mapped: ${missing.map(m => m.expName).join(', ')}`);
                }

                for (let i = 0; i < taxTypes.length; i++) {
                    const { expName, Value } = taxTypes[i];
                    const numValue = toNumber(Value);
                    const Expense_Id = expData.find(exp => stringCompare(exp.AC_Reason, expName)).Acc_Id;

                    const Expence_Value_DR = numValue < 0 ? numValue : 0;
                    const Expence_Value_CR = numValue >= 0 ? Math.abs(numValue) : 0;

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', i + 1)
                        .input('Expense_Id', Expense_Id)
                        .input('Expence_Value_DR', Expence_Value_DR)
                        .input('Expence_Value_CR', Expence_Value_CR)
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                        );

                    const result = await request;
                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert tax expense row');
                    }
                }
            }

            if (createReceipt) {
                const request = new sql.Request(transaction)
                    .input('receipt_id', receipt_id)
                    .input('year_id', Year_Id)
                    .input('receipt_sno', receiptSno)
                    .input('receipt_invoice_no', receipt_invoice_no)
                    .input('receipt_voucher_type_id', receiptVoucher.vid)
                    .input('receipt_date', invoiceDate)
                    .input('receipt_bill_type', 1)
                    .input('credit_ledger', credit_ledger)
                    .input('credit_ledger_name', credit_ledger_name)
                    .input('credit_amount', credit_amount)
                    .input('debit_ledger', debit_ledger)
                    .input('debit_ledger_name', debit_ledger_name)
                    .input('debit_amount', 0)
                    .input('remarks', Narration)
                    .input('status', 1)
                    .input('created_by', Created_by)
                    .input('is_new_ref', 0)
                    .input('Alter_Id', Alter_Id)
                    // bill info
                    .input('bill_id', Do_Id)
                    .input('bill_name', Do_Inv_No)
                    .input('bill_amount', Math.round(Total_Invoice_value))
                    .input('JournalBillType', 'SALES RECEIPT')
                    .input('Credit_Amo', 0)
                    .query(`
                        -- general info
                        INSERT INTO tbl_Receipt_General_Info (
                            receipt_id, year_id, receipt_sno, receipt_invoice_no, 
                            receipt_voucher_type_id, receipt_date, receipt_bill_type, 
                            credit_ledger, credit_ledger_name, credit_amount, 
                            debit_ledger, debit_ledger_name, debit_amount,
                            remarks, status, created_by, created_on, is_new_ref, Alter_Id
                        ) VALUES (
                            @receipt_id, @year_id, @receipt_sno, @receipt_invoice_no, 
                            @receipt_voucher_type_id, @receipt_date, @receipt_bill_type, 
                            @credit_ledger, @credit_ledger_name, @credit_amount, 
                            @debit_ledger, @debit_ledger_name, @debit_amount, 
                            @remarks, @status, @created_by, GETDATE(), @is_new_ref, @Alter_Id
                        );
                        --details info
                        INSERT INTO tbl_Receipt_Bill_Info (
                            receipt_id, receipt_no, receipt_date, receipt_bill_type, DR_CR_Acc_Id,
                            bill_id, bill_name, bill_amount, JournalBillType, Debit_Amo, Credit_Amo
                        ) VALUES (
                            @receipt_id, @receipt_invoice_no, @receipt_date, @receipt_bill_type, @credit_ledger,
                            @bill_id, @bill_name, @bill_amount, @JournalBillType, 0, @credit_amount
                        );`
                    );

                const result = await request;

                if (result.rowsAffected[0] > 0) {
                    throw new Error('Failed to create receipt');
                }
            }

            await transaction.commit();

            success(res, 'Sales Created!');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

//       const getSalesInvoiceMobile = async (req, res) => {
//     try {
//         const { Retailer_Id, Cancel_status = 0, Created_by, VoucherType, Branch_Id, User_Id } = req.query;

//         const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
//         const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

      
//         const getCurrespondingAccount = await new sql.Request().query(`
//             SELECT Acc_Id 
//             FROM tbl_Default_AC_Master 
//             WHERE Type = 'DEFAULT' AND Acc_Id IS NOT NULL;
//         `);
//         const excludeList = getCurrespondingAccount.recordset.map(exp => exp.Acc_Id).join(',');


//         let branchCondition = '';

//         if (User_Id) {
//             const getBranches = await new sql.Request()
//                 .input('User_Id', User_Id)
//                 .query(`SELECT Branch_Id FROM tbl_userbranchrights WHERE User_Id = @User_Id`);
            
//             const allowedBranches = getBranches.recordset.map(b => b.Branch_Id);

//             if (Branch_Id) {

//                 const selectedBranches = Branch_Id.split(',').map(Number).filter(n => !isNaN(n));
//                 const finalBranches = selectedBranches.filter(b => allowedBranches.length ? allowedBranches.includes(b) : true);

//                 if (finalBranches.length) {
//                     branchCondition = ` AND Branch_Id IN (${finalBranches.join(',')}) `;
//                 } else {
           
//                     return res.json({ data: [], message: "No data", success: true, others: {} });
//                 }
//             } else if (allowedBranches.length) {
               
//                 branchCondition = ` AND Branch_Id IN (${allowedBranches.join(',')}) `;
//             }
//         }


//         const request = new sql.Request()
//             .input('Fromdate', Fromdate)
//             .input('Todate', Todate)
//             .input('retailer', Retailer_Id)
//             .input('cancel', Cancel_status)
//             .input('creater', Created_by)
//             .input('VoucherType', VoucherType)
//             .query(`
//                 DECLARE @FilteredInvoice TABLE (Do_Id INT);

//                 INSERT INTO @FilteredInvoice (Do_Id)
//                 SELECT Do_Id
//                 FROM tbl_Sales_Delivery_Gen_Info
//                 WHERE 
//                     Do_Date BETWEEN @Fromdate AND @Todate
//                     ${Retailer_Id ? ' AND Retailer_Id = @retailer ' : ''}
//                     ${Cancel_status ? ' AND Cancel_status = @cancel ' : ''}
//                     ${Created_by ? ' AND Created_by = @creater ' : ''}
//                     ${VoucherType ? ' AND Voucher_Type = @VoucherType ' : ''}
//                     ${branchCondition};

//                 -- Sales general info
//                 SELECT 
//                     sdgi.Do_Id, sdgi.Do_Inv_No, sdgi.Voucher_Type, sdgi.Do_No, sdgi.Do_Year,
//                     sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
//                     sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, 
//                     sdgi.Total_Expences, sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
//                     sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on, sdgi.Stock_Item_Ledger_Name,
//                     COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
//                     COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
//                     COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
//                     COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
//                 FROM tbl_Sales_Delivery_Gen_Info sdgi
//                 LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
//                 LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
//                 LEFT JOIN tbl_Users cb ON cb.UserId = sdgi.Created_by
//                 LEFT JOIN tbl_Voucher_Type v ON v.Vocher_Type_Id = sdgi.Voucher_Type
//                 WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);

//                 -- product details
//                 SELECT
//                     oi.*, pm.Product_Id,
//                     COALESCE(pm.Product_Name, 'not available') AS Product_Name,
//                     COALESCE(pm.Product_Name, 'not available') AS Item_Name,
//                     COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
//                     COALESCE(u.Units, 'not available') AS UOM,
//                     COALESCE(b.Brand_Name, 'not available') AS BrandGet
//                 FROM tbl_Sales_Delivery_Stock_Info oi
//                 LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = oi.Item_Id
//                 LEFT JOIN tbl_UOM u ON u.Unit_Id = oi.Unit_Id
//                 LEFT JOIN tbl_Brand_Master b ON b.Brand_Id = pm.Brand
//                 WHERE oi.Delivery_Order_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);

//                 -- expense details
//                 SELECT 
//                     exp.*, em.Account_name AS Expence_Name, 
//                     CASE WHEN exp.Expence_Value_DR > 0 THEN -exp.Expence_Value_DR ELSE exp.Expence_Value_CR END AS Expence_Value
//                 FROM tbl_Sales_Delivery_Expence_Info exp
//                 LEFT JOIN tbl_Account_Master em ON em.Acc_Id = exp.Expense_Id
//                 WHERE exp.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
//                 ${excludeList ? ` AND exp.Expense_Id NOT IN (${excludeList})` : ''};

//                 -- staff involved
//                 SELECT 
//                     stf.*, e.Cost_Center_Name AS Emp_Name, cc.Cost_Category AS Involved_Emp_Type
//                 FROM tbl_Sales_Delivery_Staff_Info stf
//                 LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = stf.Emp_Id
//                 LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
//                 WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);
//             `);

//         const result = await request;

//         const SalesGeneralInfo = toArray(result.recordsets[0]);
//         const Products_List = toArray(result.recordsets[1]);
//         const Expence_Array = toArray(result.recordsets[2]);
//         const Staffs_Array = toArray(result.recordsets[3]);

//         if (SalesGeneralInfo.length > 0) {
//             const resData = SalesGeneralInfo.map(row => ({
//                 ...row,
//                 Products_List: Products_List.filter(fil => isEqualNumber(fil.Delivery_Order_Id, row.Do_Id)),
//                 Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id)),
//                 Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id))
//             }));

//             dataFound(res, resData);
//         } else {
//             noData(res);
//         }

//     } catch (e) {
//         servError(e, res);
//     }
// };



const getSalesInvoiceMobile = async (req, res) => {
    try {
        const { 
            Retailer_Id, 
            Cancel_status = 0, 
            Created_by, 
            VoucherType, 
            Branch_Id, 
            User_Id,
            filter1, 
            filter2,
            filter3 
        } = req.query;

        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        // Get mobile filters configuration
        const mobileFilters = await new sql.Request().query(`
            SELECT 
                mrd.Type AS FilterType,
                mrd.Column_Name AS ColumnName,
                mrd.Table_Id AS TableId,
                tm.Table_Name AS TableName,
                STUFF((
                    SELECT DISTINCT ',' + CAST(mrd2.List_Type AS VARCHAR(10))
                    FROM tbl_Mobile_Report_Details mrd2
                    WHERE mrd2.Type = mrd.Type 
                    AND mrd2.Table_Id = mrd.Table_Id 
                    AND mrd2.Column_Name = mrd.Column_Name
                    AND mrd2.Mob_Rpt_Id = mrd.Mob_Rpt_Id
                    FOR XML PATH('')
                ), 1, 1, '') AS ListTypes
            FROM tbl_Mobile_Report_Details mrd 
            INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
            LEFT JOIN tbl_Table_Master tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = 'Sales Invoice'
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name
            ORDER BY mrd.Type
        `);

        // Helper function to build filter conditions
        const buildFilterCondition = (filterConfig, filterParam) => {
            if (!filterConfig || !filterConfig.TableName || !filterConfig.ColumnName) {
                return null;
            }

            // For now, using simple equality condition
            return `EXISTS (
                SELECT 1 FROM ${filterConfig.TableName} 
                WHERE ${filterConfig.TableName}.${filterConfig.ColumnName} = @${filterParam}
                AND ${filterConfig.TableName}.Ret_Id = sdgi.Retailer_Id
            )`;
        };

        const getCurrespondingAccount = await new sql.Request().query(`
            SELECT Acc_Id 
            FROM tbl_Default_AC_Master 
            WHERE Type = 'DEFAULT' AND Acc_Id IS NOT NULL;
        `);
        const excludeList = getCurrespondingAccount.recordset.map(exp => exp.Acc_Id).join(',');

        let branchCondition = '';

        if (User_Id) {
            const getBranches = await new sql.Request()
                .input('User_Id', User_Id)
                .query(`SELECT Branch_Id FROM tbl_userbranchrights WHERE User_Id = @User_Id`);
            
            const allowedBranches = getBranches.recordset.map(b => b.Branch_Id);

            if (Branch_Id) {
                const selectedBranches = Branch_Id.split(',').map(Number).filter(n => !isNaN(n));
                const finalBranches = selectedBranches.filter(b => allowedBranches.length ? allowedBranches.includes(b) : true);

                if (finalBranches.length) {
                    branchCondition = ` AND Branch_Id IN (${finalBranches.join(',')}) `;
                } else {
                    return res.json({ data: [], message: "No data", success: true, others: {} });
                }
            } else if (allowedBranches.length) {
                branchCondition = ` AND Branch_Id IN (${allowedBranches.join(',')}) `;
            }
        }

        // Build mobile filter conditions
        let mobileFilterConditions = [];
        
        if (filter1 && mobileFilters.recordset.length >= 1) {
            const filterConfig = mobileFilters.recordset[0];
            const condition = buildFilterCondition(filterConfig, 'filter1');
            if (condition) {
                mobileFilterConditions.push(condition);
                console.log(`Applied filter1: ${condition}`);
            }
        }

        if (filter2 && mobileFilters.recordset.length >= 2) {
            const filterConfig = mobileFilters.recordset[1];
            const condition = buildFilterCondition(filterConfig, 'filter2');
            if (condition) {
                mobileFilterConditions.push(condition);
            }
        }

        if (filter3 && mobileFilters.recordset.length >= 3) {
            const filterConfig = mobileFilters.recordset[2];
            const condition = buildFilterCondition(filterConfig, 'filter3');
            if (condition) {
                mobileFilterConditions.push(condition);
            }
        }

        const mobileFilterCondition = mobileFilterConditions.length > 0 
            ? ` AND ${mobileFilterConditions.join(' AND ')} `
            : '';

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate);

        if (Retailer_Id) request.input('retailer', Retailer_Id);
        if (Cancel_status) request.input('cancel', Cancel_status);
        if (Created_by) request.input('creater', Created_by);
        if (VoucherType) request.input('VoucherType', VoucherType);
        
        // Add filter parameters
        if (filter1) request.input('filter1', filter1);
        if (filter2) request.input('filter2', filter2);
        if (filter3) request.input('filter3', filter3);

     
        let ledgerColumns = '';
        try {
            const columnCheck = await new sql.Request().query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'tbl_Ledger_LOL' 
                ORDER BY ORDINAL_POSITION
            `);
            
            const availableColumns = columnCheck.recordset.map(col => col.COLUMN_NAME);
           
            

            if (availableColumns.length > 0) {
                ledgerColumns = availableColumns.map(col => `ll.${col}`).join(', ');
            } else {
                ledgerColumns = 'NULL AS Ledger_Info_Not_Available';
            }
        } catch (error) {
            console.log('Error checking tbl_Ledger_LOL columns, using safe fallback');
            ledgerColumns = 'NULL AS Ledger_Info_Not_Available';
        }

        const sqlQuery = `
            DECLARE @FilteredInvoice TABLE (Do_Id INT);

            INSERT INTO @FilteredInvoice (Do_Id)
            SELECT Do_Id
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            WHERE 
                Do_Date BETWEEN @Fromdate AND @Todate
                ${Retailer_Id ? ' AND Retailer_Id = @retailer ' : ''}
                ${Cancel_status ? ' AND Cancel_status = @cancel ' : ''}
                ${Created_by ? ' AND Created_by = @creater ' : ''}
                ${VoucherType ? ' AND Voucher_Type = @VoucherType ' : ''}
                ${branchCondition}
                ${mobileFilterCondition};

            SELECT 
                sdgi.Do_Id, sdgi.Do_Inv_No, sdgi.Voucher_Type, sdgi.Do_No, sdgi.Do_Year,
                sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
                sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, 
                sdgi.Total_Expences, sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
                sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on, sdgi.Stock_Item_Ledger_Name,
                ${ledgerColumns},
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
            LEFT JOIN tbl_Users cb ON cb.UserId = sdgi.Created_by
            LEFT JOIN tbl_Voucher_Type v ON v.Vocher_Type_Id = sdgi.Voucher_Type
            LEFT JOIN tbl_Ledger_LOL ll ON ll.Ret_Id = sdgi.Retailer_Id 
            WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);

            SELECT
                oi.*, pm.Product_Id,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info oi
            LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);

            -- expense details
            SELECT 
                exp.*, em.Account_name AS Expence_Name, 
                CASE WHEN exp.Expence_Value_DR > 0 THEN -exp.Expence_Value_DR ELSE exp.Expence_Value_CR END AS Expence_Value
            FROM tbl_Sales_Delivery_Expence_Info exp
            LEFT JOIN tbl_Account_Master em ON em.Acc_Id = exp.Expense_Id
            WHERE exp.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
            ${excludeList ? ` AND exp.Expense_Id NOT IN (${excludeList})` : ''};

            -- staff involved
            SELECT 
                stf.*, e.Cost_Center_Name AS Emp_Name, cc.Cost_Category AS Involved_Emp_Type
            FROM tbl_Sales_Delivery_Staff_Info stf
            LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = stf.Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
            WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice);
        `;

        const result = await request.query(sqlQuery);

        const SalesGeneralInfo = toArray(result.recordsets[0]);
        const Products_List = toArray(result.recordsets[1]);
        const Expence_Array = toArray(result.recordsets[2]);
        const Staffs_Array = toArray(result.recordsets[3]);

        if (SalesGeneralInfo.length > 0) {
            const resData = SalesGeneralInfo.map(row => ({
                ...row,
                Products_List: Products_List.filter(fil => isEqualNumber(fil.Delivery_Order_Id, row.Do_Id)),
                Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id)),
                Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id))
            }));

            dataFound(res, resData);
        } else {
            noData(res);
        }

    } catch (e) {
        console.error('API Error:', e);
        servError(e, res);
    }
};

// const getMobileReportDropdowns = async (req, res) => {
//     try {
//         const { reportName } = req.query;

//         if (!reportName) {
//             return res.status(400).json({
//                 success: false,
//                 message: "reportName is required"
//             });
//         }

//         console.log('Fetching dropdowns for report:', reportName);


//         const mobileReportQuery = `
//             SELECT 
//                 mrd.Type AS filterType,
//                 mrd.Table_Id AS tableId,
//                 mrd.Column_Name AS columnName,
//                 mrd.List_Type AS listType,
//                 tm.Table_Name AS tableName
//             FROM tbl_Mobile_Report_Details mrd
//             INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
//             LEFT JOIN tbl_Table_Master tm ON tm.Table_Id = mrd.Table_Id
//             WHERE mrt.Report_Name = @reportName
//             ORDER BY mrd.Type
//         `;

//         const mobileReportResult = await new sql.Request()
//             .input('reportName', reportName)
//             .query(mobileReportQuery);

//         console.log('Mobile report configuration:', mobileReportResult.recordset);

//         if (mobileReportResult.recordset.length === 0) {
//             return res.json({
//                 success: true,
//                 data: [],
//                 message: "No dropdown configuration found for this report"
//             });
//         }

//         const dropdownPromises = mobileReportResult.recordset.map(async (config) => {
//             try {
//          const tableInfoQuery = `
//                     SELECT 
//                         COLUMN_NAME, 
//                         DATA_TYPE,
//                         IS_NULLABLE,
//                         COLUMNPROPERTY(OBJECT_ID('${config.tableName}'), COLUMN_NAME, 'IsIdentity') AS IsIdentity
//                     FROM INFORMATION_SCHEMA.COLUMNS 
//                     WHERE TABLE_NAME = '${config.tableName}'
//                     ORDER BY ORDINAL_POSITION
//                 `;
                
//                 const tableInfo = await new sql.Request().query(tableInfoQuery);
//                 console.log(`Columns in ${config.tableName}:`, tableInfo.recordset);

          
//                 let valueColumn = null;
                
               
//                 const identityColumn = tableInfo.recordset.find(col => col.IsIdentity === 1);
//                 if (identityColumn) {
//                     valueColumn = identityColumn.COLUMN_NAME;
//                 }
                
       
//                 if (!valueColumn) {
//                     const possiblePKs = tableInfo.recordset.filter(col => 
//                         col.COLUMN_NAME.toLowerCase().includes('id') || 
//                         col.COLUMN_NAME.toLowerCase().includes('_pk') ||
//                         col.COLUMN_NAME === config.tableName.replace('tbl_', '') + 'Id' ||
//                         col.COLUMN_NAME === config.tableName.replace('tbl_', '') + '_Id' ||
//                         col.COLUMN_NAME === 'Id'
//                     );
//                     if (possiblePKs.length > 0) {
//                         valueColumn = possiblePKs[0].COLUMN_NAME;
//                     }
//                 }
//                          if (!valueColumn && tableInfo.recordset.length > 0) {
//                     valueColumn = tableInfo.recordset[0].COLUMN_NAME;
//                 }

//                 const labelColumn = config.columnName;


//                 const labelColumnExists = tableInfo.recordset.some(col => 
//                     col.COLUMN_NAME === labelColumn
//                 );

//                 if (!labelColumnExists) {
//                     return {
//                         filterType: config.filterType,
//                         tableId: config.tableId,
//                         columnName: config.columnName,
//                         tableName: config.tableName,
//                         values: [],
//                         error: `Column '${labelColumn}' not found in table '${config.tableName}'. Available columns: ${tableInfo.recordset.map(col => col.COLUMN_NAME).join(', ')}`
//                     };
//                 }


//                 const dropdownQuery = `
//                     SELECT DISTINCT
//                         ${labelColumn} AS value,
//                         ${labelColumn} AS label
//                     FROM ${config.tableName}
//                     WHERE ${labelColumn} IS NOT NULL 
//                     AND ${labelColumn} != ''
//                     ORDER BY ${labelColumn}
//                 `;

//                 console.log(`Dropdown query for ${config.tableName}:`, dropdownQuery);
//                 const result = await new sql.Request().query(dropdownQuery);

//                 // Additional client-side duplicate removal for safety
//                 const uniqueOptions = result.recordset.filter((option, index, self) =>
//                     index === self.findIndex((o) => (
//                         o.value === option.value && o.label === option.label
//                     ))
//                 );

//                 console.log(`Found ${result.recordset.length} records, ${uniqueOptions.length} unique after filtering`);

//                 return {
//                     filterType: config.filterType,
//                     tableId: config.tableId,
//                     columnName: config.columnName,
//                     tableName: config.tableName,
//                     valueColumn: valueColumn,
//                     labelColumn: labelColumn,
//                     values: uniqueOptions
//                 };

//             } catch (error) {
//                 console.error(`Error processing filter ${config.filterType}:`, error);
//                 return {
//                     filterType: config.filterType,
//                     tableId: config.tableId,
//                     columnName: config.columnName,
//                     tableName: config.tableName,
//                     values: [],
//                     error: error.message
//                 };
//             }
//         });

//         const dropdownResults = await Promise.all(dropdownPromises);

//         const formattedResponse = dropdownResults.map(dropdown => ({
//             filterType: dropdown.filterType,
//             tableId: dropdown.tableId,
//             columnName: dropdown.columnName,
//             tableName: dropdown.tableName,
//             valueColumn: dropdown.valueColumn,
//             labelColumn: dropdown.labelColumn,
//             options: dropdown.values,
//             error: dropdown.error
//         }));

//         res.json({
//             success: true,
//             data: formattedResponse,
//             message: "Dropdown options fetched successfully"
//         });

//     } catch (error) {
//         console.error('Mobile Report Dropdown API Error:', error);
//         res.status(500).json({
//             success: false,
//             message: "Error fetching dropdown options",
//             error: error.message
//         });
//     }
// };



const getMobileReportDropdowns = async (req, res) => {
    try {
        const { reportName } = req.query;

        if (!reportName) {
         return invalidInput(res, 'Report Name is Required')
        }

        const mobileReportQuery = `
            SELECT 
                mrd.Type AS filterType,
                mrd.Table_Id AS tableId,
                mrd.Column_Name AS columnName,
                STUFF((
                    SELECT DISTINCT ',' + CAST(mrd2.List_Type AS VARCHAR(10))
                    FROM tbl_Mobile_Report_Details mrd2
                    WHERE mrd2.Type = mrd.Type 
                    AND mrd2.Table_Id = mrd.Table_Id 
                    AND mrd2.Column_Name = mrd.Column_Name
                    AND mrd2.Mob_Rpt_Id = mrd.Mob_Rpt_Id
                    FOR XML PATH('')
                ), 1, 1, '') AS listTypes,
                tm.Table_Name AS tableName
            FROM tbl_Mobile_Report_Details mrd
            INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
            LEFT JOIN tbl_Table_Master tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = @reportName
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name
            ORDER BY mrd.Type
        `;

        const mobileReportResult = await new sql.Request()
            .input('reportName', reportName)
            .query(mobileReportQuery);

        if (mobileReportResult.recordset.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: "No dropdown configuration found for this report"
            });
        }

        const dropdownPromises = mobileReportResult.recordset.map(async (config) => {
            try {
                if (config.tableName && config.columnName) {
                    
                    const columnCheckQuery = `
                        SELECT COUNT(*) as columnExists
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${config.tableName}' 
                        AND COLUMN_NAME = '${config.columnName}'
                    `;
                    
                    const columnCheck = await new sql.Request().query(columnCheckQuery);
                    
                    if (columnCheck.recordset[0].columnExists === 0) {
                        return {
                            filterType: config.filterType,
                            tableId: config.tableId,
                            columnName: config.columnName,
                            tableName: config.tableName,
                            listTypes: config.listTypes,
                            options: [],
                            error: `Column '${config.columnName}' not found in table '${config.tableName}'`
                        };
                    }

                    const tableInfoQuery = `
                        SELECT COLUMN_NAME, DATA_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${config.tableName}'
                        ORDER BY ORDINAL_POSITION
                    `;
                    
                    const tableInfo = await new sql.Request().query(tableInfoQuery);
                    
                    let valueColumn = null;
                    
                    const possibleIdColumns = tableInfo.recordset.filter(col => 
                        col.COLUMN_NAME.toLowerCase() === 'id' ||
                        col.COLUMN_NAME.toLowerCase().includes('_id') ||
                        col.COLUMN_NAME.toLowerCase().includes('id_') ||
                        col.COLUMN_NAME.toLowerCase().endsWith('id') ||
                        col.COLUMN_NAME.toLowerCase() === config.tableName.replace('tbl_', '').toLowerCase() + 'id' ||
                        col.COLUMN_NAME.toLowerCase() === config.tableName.replace('tbl_', '').toLowerCase() + '_id'
                    );

                    if (possibleIdColumns.length > 0) {
                        valueColumn = possibleIdColumns[0].COLUMN_NAME;
                    } else {
                        const otherColumns = tableInfo.recordset.filter(col => 
                            col.COLUMN_NAME !== config.columnName
                        );
                        if (otherColumns.length > 0) {
                            valueColumn = otherColumns[0].COLUMN_NAME;
                        } else {
                            valueColumn = config.columnName;
                        }
                    }

                    const dataCheckQuery = `
                        SELECT 
                            COUNT(*) as totalRecords,
                            COUNT(${config.columnName}) as nonNullCount,
                            COUNT(CASE WHEN ${config.columnName} = '' THEN 1 END) as emptyCount,
                            COUNT(CASE WHEN ${config.columnName} IS NULL THEN 1 END) as nullCount
                        FROM ${config.tableName}
                    `;

                    const dataCheck = await new sql.Request().query(dataCheckQuery);

                    let dropdownQuery;
                    let result;
                    
                    if (dataCheck.recordset[0].nonNullCount === 0) {
                        const alternativeColumnQuery = `
                            SELECT COLUMN_NAME 
                            FROM INFORMATION_SCHEMA.COLUMNS 
                            WHERE TABLE_NAME = '${config.tableName}'
                            AND (COLUMN_NAME LIKE '%name%' OR COLUMN_NAME LIKE '%desc%' OR COLUMN_NAME LIKE '%title%')
                            AND COLUMN_NAME != '${config.columnName}'
                        `;
                        
                        const altColumns = await new sql.Request().query(alternativeColumnQuery);

                        if (altColumns.recordset.length > 0) {
                            const altColumn = altColumns.recordset[0].COLUMN_NAME;
                         
                            
                            dropdownQuery = `
                                SELECT DISTINCT
                                    ${valueColumn} AS value,
                                    ${altColumn} AS label
                                FROM ${config.tableName}
                                WHERE ${altColumn} IS NOT NULL 
                                AND ${altColumn} != ''
                                ORDER BY ${altColumn}
                            `;
                        } else {
                            dropdownQuery = `
                                SELECT DISTINCT
                                    ${valueColumn} AS value,
                                    ${valueColumn} AS label
                                FROM ${config.tableName}
                                WHERE ${valueColumn} IS NOT NULL
                                ORDER BY ${valueColumn}
                            `;
                        }
                    } else {
                        dropdownQuery = `
                            SELECT DISTINCT
                                ${valueColumn} AS value,
                                ${config.columnName} AS label
                            FROM ${config.tableName}
                            WHERE ${config.columnName} IS NOT NULL 
                            AND ${config.columnName} != ''
                            ORDER BY ${config.columnName}
                        `;
                    }

                    result = await new sql.Request().query(dropdownQuery);

                    // Remove duplicates based on label (keep first occurrence)
                    const seenLabels = new Set();
                    const uniqueOptions = result.recordset.filter(item => {
                        if (seenLabels.has(item.label)) {
                            return false;
                        }
                        seenLabels.add(item.label);
                        return true;
                    });

                    return {
                        filterType: config.filterType,
                        tableId: config.tableId,
                        columnName: config.columnName,
                        tableName: config.tableName,
                        valueColumn: valueColumn,
                        listTypes: config.listTypes,
                        options: uniqueOptions,
                        dataSummary: dataCheck.recordset[0]
                    };

                } else {
                    return {
                        filterType: config.filterType,
                        tableId: config.tableId,
                        columnName: config.columnName,
                        tableName: config.tableName,
                        listTypes: config.listTypes,
                        options: [], 
                        error: "Invalid configuration - missing tableName or columnName"
                    };
                }

            } catch (error) {
                console.error(`Error fetching dropdown for filter ${config.filterType}:`, error);
                return {
                    filterType: config.filterType,
                    tableId: config.tableId,
                    columnName: config.columnName,
                    tableName: config.tableName,
                    listTypes: config.listTypes,
                    options: [],
                    error: error.message
                };
            }
        });

        const dropdownResults = await Promise.all(dropdownPromises);

        const formattedResponse = dropdownResults.map(dropdown => ({
            filterType: dropdown.filterType,
            tableId: dropdown.tableId,
            columnName: dropdown.columnName,
            tableName: dropdown.tableName,
            valueColumn: dropdown.valueColumn,
            listTypes: dropdown.listTypes,
            options: dropdown.options,
            error: dropdown.error,
            dataSummary: dropdown.dataSummary
        }));

        res.json({
            success: true,
            data: formattedResponse,
            message: "Dropdown options fetched successfully"
        });

    } catch (error) {
        console.error('Mobile Report Dropdown API Error:', error);
        res.status(500).json({
            success: false,
            message: "Error fetching dropdown options",
            error: error.message
        });
    }
};


    const salesInvoiceReport = async (req, res) => {
        try {
            const Fromdate = req.query.Fromdate
                ? ISOString(req.query.Fromdate)
                : ISOString();
            const Todate = req.query.Todate
                ? ISOString(req.query.Todate)
                : ISOString();

            const salesQuery = `
      SELECT DISTINCT
          fnd.Product_Id,
          fnd.Product_Name,
          fnd.bill_qty AS Sales_Quantity,
          stl.Stock_Item,
          stl.Stock_Group,
          stl.S_Sub_Group_1,
          stl.Grade_Item_Group,
          stl.Item_Name_Modified,
          fnd.BranchId,
          fnd.BranchName,
          fnd.GoDown_Id,
          fnd.Godown_Name
      FROM Avg_Live_Sales_Fn_3(@Fromdate, @Todate) fnd
      LEFT JOIN tbl_Stock_Los stl 
            ON stl.Pro_Id = fnd.Product_Id
      ORDER BY fnd.BranchName, fnd.Godown_Name, fnd.Product_Name;
    `;

            const salesRequest = new sql.Request()
                .input("Fromdate", sql.DateTime, Fromdate)
                .input("Todate", sql.DateTime, Todate);

            const salesResult = await salesRequest.query(salesQuery);


            const groupedData = salesResult.recordset.reduce((branchAcc, item) => {
                const branchKey = item.BranchId || 0;
                const godownKey = item.GoDown_Id || 0;

                if (!branchAcc[branchKey]) {
                    branchAcc[branchKey] = {
                        BranchId: item.BranchId,
                        BranchName: item.BranchName,
                        Godowns: {},
                    };
                }

                if (!branchAcc[branchKey].Godowns[godownKey]) {
                    branchAcc[branchKey].Godowns[godownKey] = {
                        GoDown_Id: item.GoDown_Id,
                        Godown_Name: item.Godown_Name,
                        Products: [],
                    };
                }

                branchAcc[branchKey].Godowns[godownKey].Products.push({
                    Product_Id: item.Product_Id,
                    Product_Name: item.Product_Name,
                    Stock_Item: item.Stock_Item,
                    Item_Name_Modified: item.Item_Name_Modified,
                    Stock_Group: item.Stock_Group,
                    S_Sub_Group_1: item.S_Sub_Group_1,
                    Grade_Item_Group: item.Grade_Item_Group,
                    Sales_Quantity: item.Sales_Quantity,
                });

                return branchAcc;
            }, {});


            const resultArray = Object.values(groupedData).map(branch => ({
                ...branch,
                Godowns: Object.values(branch.Godowns),
            }));

            sentData(res, resultArray);
        } catch (e) {
            console.error("Error in sales report:", e);
            servError(e, res);
        }
    };

    const createSalesTransaction = async (req, res) => {
        const {
            transactionType,
            Retailer_Id,
            Sales_Person_Id = 0,
            Branch_Id,
            Narration = null,
            Created_by,
            ProductList = [],
            Product_Array = [],
            GST_Inclusive = 1,
            IS_IGST = 0,
            Voucher_Type,
            staff_Involved_List = [],
            Staffs_Array = [],
            Expence_Array = [],
            Pre_Id,
            So_No,
            So_Id,
            Cancel_status = 1,
            Stock_Item_Ledger_Name = '',
            Round_off = 0,
            Do_Date
        } = req.body;

        if (
            !checkIsNumber(Retailer_Id) ||
            !checkIsNumber(Created_by) ||
            !checkIsNumber(Voucher_Type) ||
            !checkIsNumber(Branch_Id)
        ) {
            return invalidInput(res, 'Retailer_Id, Created_by, VoucherType,Branch_Id are required');
        }

        if ((transactionType === 'order' || transactionType === 'both') && !checkIsNumber(Sales_Person_Id)) {
            return invalidInput(res, 'Sales_Person_Id is required for order creation');
        }

        if (transactionType === 'invoice' && !checkIsNumber(So_Id)) {
            return invalidInput(res, 'So_No is required for invoice creation');
        }

        const transaction = new sql.Transaction();
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        try {
            const productsData = (await getProducts()).dataArray || [];
            const Alter_Id = Math.floor(Math.random() * 999999);

            const transactionDate = ISOString(req?.body?.Do_Date) || ISOString();


            const yearData = await new sql.Request()
                .input('TransactionDate', transactionDate)
                .query(`
                SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE Fin_Start_Date <= @TransactionDate 
                  AND Fin_End_Date >= @TransactionDate
            `);

            if (yearData.recordset.length === 0) throw new Error('Year_Id not found');
            const { Year_Id, Year_Desc } = yearData.recordset[0];


            const voucherData = await new sql.Request()
                .input('Voucher_Type', Voucher_Type)
                .query(`SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Voucher_Type`);

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;
            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            await transaction.begin();

            let soId = null, doId = null, soInvNo = null, doInvNo = null;

            if (transactionType === 'order' || transactionType === 'both') {

                const So_Id_Get = await getNextId({ table: 'tbl_Sales_Order_Gen_Info', column: 'So_Id' });
                if (!So_Id_Get.status || !checkIsNumber(So_Id_Get.MaxId)) throw new Error('Failed to get So_Id');
                soId = So_Id_Get.MaxId;

                const So_Branch_Inv_Id = Number((await new sql.Request()
                    .input('So_Year', Year_Id)
                    .input('Voucher_Type', Voucher_Type)
                    .query(`
                    SELECT COALESCE(MAX(So_Branch_Inv_Id), 0) AS So_Branch_Inv_Id
                    FROM tbl_Sales_Order_Gen_Info
                    WHERE So_Year = @So_Year
                      AND VoucherType = @Voucher_Type
                `)
                )?.recordset[0]?.So_Branch_Inv_Id) + 1;

                if (!checkIsNumber(So_Branch_Inv_Id)) throw new Error('Failed to get Order Id');


                soInvNo = `${VoucherCode}/${createPadString(So_Branch_Inv_Id, 6)}/${Year_Desc}`;

                const orderTotals = ProductList.reduce((acc, item) => {

                    const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                    const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                    const Amount = Multiplication(billQty, itemRate);
                    const discount = toNumber(item?.Disc_Val) || 0;

                    if (isNotTaxableBill) {
                        acc.TotalValue = Addition(acc.TotalValue, Addition(Amount, -discount));
                        acc.TotalTax = Addition(acc.TotalTax, 0);
                        acc.TotalInvoice = Addition(acc.TotalInvoice, Addition(Amount, -discount));
                        return acc;
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1)
                        ? (product?.Igst_P ?? product?.Gst_P ?? 0)
                        : (product?.Gst_P ?? 0);

                    const taxPerc = (product && product.Gst_P != null)
                        ? gstPercentage
                        : (toNumber(item?.Tax_Rate) || toNumber(item?.Tax_Per) || 0);

                    const totalAfterDiscount = Addition(Amount, -discount);
                    const taxInfo = calculateGSTDetails(totalAfterDiscount, taxPerc, isInclusive ? 'remove' : 'add');

                    acc.TotalValue = Addition(acc.TotalValue, taxInfo.without_tax ?? 0);
                    acc.TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount ?? 0);
                    acc.TotalInvoice = Addition(acc.TotalInvoice, taxInfo.with_tax ?? 0);

                    return acc;
                }, { TotalValue: 0, TotalTax: 0, TotalInvoice: 0 });

                const Total_Invoice_value1 = RoundNumber(orderTotals.TotalInvoice);

                const Round_Off1 = RoundNumber(Math.round(Total_Invoice_value1) - Total_Invoice_value1);



                const soRequest = new sql.Request(transaction)
                    .input('So_Id', soId)
                    .input('So_Inv_No', soInvNo)
                    .input('So_Year', Year_Id)
                    .input('Pre_Id', toNumber(Pre_Id) || null)
                    .input('So_Branch_Inv_Id', So_Branch_Inv_Id)
                    .input('So_Date', transactionDate)
                    .input('Retailer_Id', Retailer_Id)
                    .input('Sales_Person_Id', Sales_Person_Id)
                    .input('Branch_Id', Branch_Id)
                    .input('VoucherType', Voucher_Type)
                    .input('GST_Inclusive', GST_Inclusive)
                    .input('CSGT_Total', isIGST ? 0 : (orderTotals.TotalTax / 2))
                    .input('SGST_Total', isIGST ? 0 : (orderTotals.TotalTax / 2))
                    .input('IGST_Total', isIGST ? orderTotals.TotalTax : 0)
                    .input('IS_IGST', isIGST ? 1 : 0)
                    .input('Round_off', Round_Off1)
                    .input('Total_Invoice_value', Math.round(Total_Invoice_value1))
                    .input('Total_Before_Tax', orderTotals.TotalValue)
                    .input('Total_Tax', orderTotals.TotalTax)
                    .input('Narration', Narration)
                    .input('Cancel_status', 0)
                    .input('Created_by', Created_by)
                    .input('Altered_by', Created_by)
                    .input('Alter_Id', Alter_Id)
                    .input('Created_on', new Date())
                    .input('Alterd_on', new Date())
                    .input('Trans_Type', 'INSERT');

                const soInsertQuery = `
                INSERT INTO tbl_Sales_Order_Gen_Info (
                    So_Id, So_Inv_No, So_Year, Pre_Id, So_Branch_Inv_Id, So_Date, 
                    Retailer_Id, Sales_Person_Id, Branch_Id, VoucherType, CSGT_Total, 
                    SGST_Total, IGST_Total, GST_Inclusive, IS_IGST, Round_off, 
                    Total_Invoice_value, Total_Before_Tax, Total_Tax, Narration, Cancel_status, 
                    Created_by, Altered_by, Alter_Id, Created_on, Alterd_on, Trans_Type
                ) VALUES (
                    @So_Id, @So_Inv_No, @So_Year, @Pre_Id, @So_Branch_Inv_Id, @So_Date, 
                    @Retailer_Id, @Sales_Person_Id, @Branch_Id, @VoucherType, @CSGT_Total, 
                    @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                    @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                    @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                );
            `;
                const soRes = await soRequest.query(soInsertQuery);
                if (soRes.rowsAffected[0] === 0) throw new Error('Failed to create order, Try again.');

                for (let i = 0; i < ProductList.length; i++) {
                    const product = ProductList[i];
                    const productDetails = findProductDetails(productsData, product.Item_Id);

                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? (productDetails?.Igst_P ?? product?.Tax_Per ?? 0) : (productDetails?.Gst_P ?? product?.Tax_Per ?? 0);
                    const Taxble = gstPercentage > 0 ? 1 : 0;
                    const Bill_Qty = Number(product.Bill_Qty ?? product.Qty ?? 0);
                    const Item_Rate = RoundNumber(product.Item_Rate ?? product.Rate ?? 0);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);
                    const discount = toNumber(product?.Disc_Val) || 0;
                    const netAmount = Addition(Amount, -discount);

                    const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                    const gstInfo = calculateGSTDetails(netAmount, gstPercentage, taxType);

                    const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                    const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                    const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                    const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                    const soStockReq = new sql.Request(transaction)
                        .input('So_Date', transactionDate)
                        .input('Sales_Order_Id', soId)
                        .input('S_No', i + 1)
                        .input('Item_Id', product.Item_Id)
                        .input('Pre_Id', toNumber(Pre_Id) || null)
                        .input('Bill_Qty', Bill_Qty)
                        .input('Item_Rate', Item_Rate)
                        .input('Amount', Amount)
                        .input('Free_Qty', 0)
                        .input('Total_Qty', Bill_Qty)
                        .input('Taxble', Taxble)
                        .input('Taxable_Rate', itemRateGst.base_amount)
                        .input('HSN_Code', productDetails?.HSN_Code ?? '')
                        .input('Unit_Id', product.UOM ?? '')
                        .input('Unit_Name', product.Units ?? '')
                        .input('Taxable_Amount', gstInfo.base_amount)
                        .input('Tax_Rate', gstPercentage)
                        .input('Cgst', cgstPer ?? 0)
                        .input('Cgst_Amo', Cgst_Amo)
                        .input('Sgst', cgstPer ?? 0)
                        .input('Sgst_Amo', Cgst_Amo)
                        .input('Igst', igstPer ?? 0)
                        .input('Igst_Amo', Igst_Amo)
                        .input('Final_Amo', gstInfo.with_tax)
                        .input('Created_on', new Date());

                    const soStockQuery = `
                    INSERT INTO tbl_Sales_Order_Stock_Info (
                        So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                        Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                        Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    ) VALUES (
                        @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                        @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                        @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                    );
                `;
                    const soStockRes = await soStockReq.query(soStockQuery);
                    if (soStockRes.rowsAffected[0] === 0) throw new Error('Failed to create order stock row, Try again.');
                }

                for (const staff of toArray(staff_Involved_List)) {
                    const staffReq = new sql.Request(transaction)
                        .input('So_Id', sql.Int, soId)
                        .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id || staff?.Emp_Id || 0)
                        .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id || null);

                    await staffReq.query(`
                    INSERT INTO tbl_Sales_Order_Staff_Info (So_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                    VALUES (@So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);
                `);
                }
            }

            if (transactionType === 'invoice' || transactionType === 'both') {

                const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });
                if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');
                doId = getDo_Id.MaxId;


                const Do_No = Number((await new sql.Request()
                    .input('Do_Year', Year_Id)
                    .input('Voucher_Type', Voucher_Type)
                    .query(`
                    SELECT COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Do_Year = @Do_Year
                      AND Voucher_Type = @Voucher_Type
                `)
                ).recordset[0]?.Do_No) + 1;

                if (!checkIsNumber(Do_No)) throw new Error('Failed to get Order Id');

                doInvNo = `${VoucherCode}/${createPadString(Do_No, 6)}/${Year_Desc}`;


                const invoiceTotals = (() => {
                    const productTax = Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                        const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                        const Amount = Multiplication(billQty, itemRate);
                        const discount = toNumber(item?.Disc_Val) || 0;
                        const net = Addition(Amount, -discount);

                        if (isNotTaxableBill) {
                            acc.TotalValue = Addition(acc.TotalValue, net);
                            return acc;
                        }

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? (product?.Igst_P ?? product?.Gst_P ?? item?.Tax_Per ?? 0) : (product?.Gst_P ?? item?.Tax_Per ?? 0);
                        const taxInfo = calculateGSTDetails(net, gstPercentage, isInclusive ? 'remove' : 'add');

                        acc.TotalValue = Addition(acc.TotalValue, taxInfo.without_tax);
                        acc.TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount);
                        acc.TotalInvoice = Addition(acc.TotalInvoice, taxInfo.with_tax);
                        return acc;
                    }, { TotalValue: 0, TotalTax: 0, TotalInvoice: 0 });


                    const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => {
                        return Addition(acc, IS_IGST ? (exp?.Igst_Amo || 0) : Addition(exp?.Cgst_Amo || 0, exp?.Sgst_Amo || 0));
                    }, 0);

                    return {
                        TotalValue: productTax.TotalValue,
                        TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
                        TotalInvoice: productTax.TotalInvoice
                    };
                })();

                const TotalExpences = toNumber(RoundNumber(
                    toArray(Expence_Array).reduce((acc, exp) => Addition(acc, exp?.Expence_Value || exp?.Amount || 0), 0)
                ));

                const Total_Invoice_value = RoundNumber(
                    Addition(TotalExpences, Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                        const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                        const Amount = Multiplication(billQty, itemRate);
                        const discount = toNumber(item?.Disc_Val) || 0;
                        const net = Addition(Amount, -discount);

                        if (isNotTaxableBill) return Addition(acc, net);

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? (product?.Igst_P ?? product?.Gst_P ?? item?.Tax_Per ?? 0) : (product?.Gst_P ?? item?.Tax_Per ?? 0);

                        if (isInclusive) {
                            return Addition(acc, calculateGSTDetails(net, gstPercentage, 'remove').with_tax);
                        } else {
                            return Addition(acc, calculateGSTDetails(net, gstPercentage, 'add').with_tax);
                        }
                    }, 0))
                );

                const CGST = isIGST ? 0 : invoiceTotals.TotalTax / 2;
                const SGST = isIGST ? 0 : invoiceTotals.TotalTax / 2;
                const IGST = isIGST ? invoiceTotals.TotalTax : 0;

                const soNoForInvoice = (transactionType === 'both' && checkIsNumber(soId)) ? soId : (checkIsNumber(So_Id) ? toNumber(So_Id) : null);
                const doRequest = new sql.Request(transaction)
                    .input('Do_Id', doId)
                    .input('Do_Inv_No', doInvNo)
                    .input('Voucher_Type', Voucher_Type)
                    .input('Do_No', Do_No)
                    .input('Do_Year', Year_Id)
                    .input('Do_Date', transactionDate)
                    .input('Branch_Id', sql.Int, Branch_Id)
                    .input('Retailer_Id', Retailer_Id)
                    .input('Delivery_Person_Id', 0)
                    .input('Narration', Narration)
                    .input('So_No', soNoForInvoice)
                    .input('Cancel_status', toNumber(Cancel_status))
                    .input('GST_Inclusive', sql.Int, GST_Inclusive)
                    .input('IS_IGST', isIGST ? 1 : 0)
                    .input('CSGT_Total', CGST)
                    .input('SGST_Total', SGST)
                    .input('IGST_Total', IGST)
                    .input('Round_off', Round_off || RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                    .input('Total_Expences', TotalExpences)
                    .input('Total_Before_Tax', invoiceTotals.TotalValue)
                    .input('Total_Tax', invoiceTotals.TotalTax)
                    .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                    .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)
                    .input('Trans_Type', 'INSERT')
                    .input('Alter_Id', sql.BigInt, Alter_Id)
                    .input('Created_by', sql.BigInt, Created_by)
                    .input('Created_on', sql.DateTime, new Date());

                const doInsertQuery = `
                INSERT INTO tbl_Sales_Delivery_Gen_Info (
                    Do_Id, Do_Inv_No, Voucher_Type, Do_No, Do_Year, 
                    Do_Date, Branch_Id, Retailer_Id, Delivery_Person_Id, Narration, So_No, Cancel_status,
                    GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, Round_off, 
                    Total_Before_Tax, Total_Tax, Total_Invoice_value, Stock_Item_Ledger_Name,
                    Trans_Type, Alter_Id, Created_by, Created_on
                ) VALUES (
                    @Do_Id, @Do_Inv_No, @Voucher_Type, @Do_No, @Do_Year,
                    @Do_Date, @Branch_Id, @Retailer_Id, @Delivery_Person_Id, @Narration, @So_No, @Cancel_status,
                    @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, @Round_off, 
                    @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Stock_Item_Ledger_Name,
                    @Trans_Type, @Alter_Id, @Created_by, @Created_on
                );
            `;
                const doResult = await doRequest.query(doInsertQuery);
                if (doResult.rowsAffected[0] === 0) throw new Error('Failed to create general info in sales invoice');


                const isSO = checkIsNumber(So_No) || transactionType === 'both';

                for (const [index, product] of Product_Array.entries()) {
                    const productDetails = findProductDetails(productsData, product.Item_Id);

                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? (productDetails?.Igst_P ?? product?.Tax_Per ?? 0) : (productDetails?.Gst_P ?? product?.Tax_Per ?? 0);
                    const Taxble = gstPercentage > 0 ? 1 : 0;
                    const Bill_Qty = Number(product.Bill_Qty ?? product.Qty ?? 0);
                    const Item_Rate = RoundNumber(product.Item_Rate ?? product.Rate ?? 0);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);
                    const netDiscount = toNumber(product?.Disc_Val) || 0;

                    const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                    const gstInfo = calculateGSTDetails(Addition(Amount, -netDiscount), gstPercentage, taxType);

                    const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                    const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                    const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                    const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                    const request2 = new sql.Request(transaction)
                        .input('Do_Date', transactionDate)
                        .input('DeliveryOrder', doId)
                        .input('S_No', index + 1)
                        .input('Item_Id', product.Item_Id)
                        .input('Bill_Qty', Bill_Qty)

                        .input('Act_Qty', Bill_Qty)
                        .input('Alt_Act_Qty', isSO ? toNumber(product?.Alt_Act_Qty) : toNumber(product?.Act_Qty) || Bill_Qty)
                        .input('Item_Rate', toNumber(Item_Rate))
                        .input('GoDown_Id', checkIsNumber(product?.GoDown_Id) ? Number(product?.GoDown_Id) : null)
                        .input('Amount', toNumber(Amount))
                        .input('Free_Qty', 0)
                        .input('Total_Qty', Bill_Qty)
                        .input('Taxble', Taxble)
                        .input('Taxable_Rate', itemRateGst.base_amount)
                        .input('HSN_Code', productDetails?.HSN_Code ?? '')
                        .input('Unit_Id', product.Unit_Id ?? '')
                        .input('Act_unit_Id', isSO ? product.Act_unit_Id : product.Unit_Id)
                        .input('Alt_Act_Unit_Id', isSO ? product.Alt_Act_Unit_Id : product.Unit_Id)
                        .input('Unit_Name', product.Unit_Name ?? '')
                        .input('Taxable_Amount', gstInfo.base_amount)
                        .input('Tax_Rate', gstPercentage)
                        .input('Cgst', cgstPer ?? 0)
                        .input('Cgst_Amo', Cgst_Amo)
                        .input('Sgst', cgstPer ?? 0)
                        .input('Sgst_Amo', Cgst_Amo)
                        .input('Igst', igstPer ?? 0)
                        .input('Igst_Amo', Igst_Amo)
                        .input('Final_Amo', gstInfo.with_tax)
                        .input('Created_on', new Date())
                        .query(`
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, 
                            Bill_Qty, Act_Qty, Alt_Act_Qty, 
                            Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code, 
                            Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id, 
                            Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @DeliveryOrder, @S_No, @Item_Id,
                            @Bill_Qty, @Act_Qty, @Alt_Act_Qty, 
                            @Item_Rate, @GoDown_Id, @Amount, @Free_Qty, @Total_Qty,
                            @Taxble, @Taxable_Rate, @HSN_Code, 
                            @Unit_Id, @Unit_Name, @Act_unit_Id, @Alt_Act_Unit_Id, 
                            @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );
                    `);

                    const result2 = await request2;
                    if (result2.rowsAffected[0] === 0) throw new Error('Failed to create order, Try again.');
                }
                if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
                    for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                        const exp = Expence_Array[expInd];
                        const Expence_Value_DR = toNumber(exp?.Expence_Value || exp?.Amount) >= 0 ? toNumber(exp?.Expence_Value || exp?.Amount) : 0;
                        const Expence_Value_CR = toNumber(exp?.Expence_Value || exp?.Amount) < 0 ? Math.abs(toNumber(exp?.Expence_Value || exp?.Amount)) : 0;

                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Sno', expInd + 1)
                            .input('Expense_Id', toNumber(exp?.Expense_Id))
                            .input('Expence_Value_DR', Expence_Value_DR)
                            .input('Expence_Value_CR', Expence_Value_CR)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert Expence row in sales invoice creation');
                        }
                    }
                }

                const taxTypes = [
                    { expName: 'CGST', Value: CGST },
                    { expName: 'SGST', Value: SGST },
                    { expName: 'IGST', Value: IGST },
                    { expName: 'ROUNDOFF', Value: Round_off || (Math.round(Total_Invoice_value) - Total_Invoice_value) }
                ].filter(fil => toNumber(fil.Value) !== 0);

                let snoOffset = toNumber(Expence_Array?.length) || 0;

                if (taxTypes.length > 0) {
                    const getExpName = new sql.Request();
                    taxTypes.forEach((t, i) => getExpName.input(`exp${i}`, t.expName));
                    const inClause = taxTypes.map((_, i) => `@exp${i}`).join(', ');

                    const getCurrespondingAccount = getExpName.query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE AC_Reason IN (${inClause}) 
                    AND Acc_Id IS NOT NULL;
                `);

                    const expData = (await getCurrespondingAccount).recordset;

                    const missing = taxTypes.filter(exp =>
                        !expData.some(row => stringCompare(row.AC_Reason, exp.expName))
                    );

                    if (missing.length > 0) {
                        throw new Error(`Expense id not mapped: ${missing.map(m => m.expName).join(', ')}`);
                    }

                    for (let i = 0; i < taxTypes.length; i++) {
                        const { expName, Value } = taxTypes[i];
                        const numValue = Number(Value);
                        const Expense_Id = expData.find(exp => stringCompare(exp.AC_Reason, expName)).Acc_Id;

                        const Expence_Value_DR = numValue >= 0 ? numValue : 0;
                        const Expence_Value_CR = numValue < 0 ? Math.abs(numValue) : 0;

                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Sno', snoOffset + i + 1)
                            .input('Expense_Id', Expense_Id)
                            .input('Expence_Value_DR', Expence_Value_DR)
                            .input('Expence_Value_CR', Expence_Value_CR)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert tax expense row');
                        }
                    }
                }

                if (Array.isArray(staff_Involved_List) && staff_Involved_List.length > 0) {
                    for (const staff of staff_Involved_List) {
                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id || staff?.Emp_Id || 0)
                            .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id || null)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Staff_Info (
                                Do_Id, Emp_Id, Emp_Type_Id
                            ) VALUES (
                                @Do_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert Staff row in sales invoice creation');
                        }
                    }
                }

                if (checkIsNumber(Pre_Id)) {
                    const updatePresalesOrder = new sql.Request(transaction)
                        .input('Pre_Id', toNumber(Pre_Id) || null)
                        .query(`
                        UPDATE tbl_Pre_Sales_Order_Gen_Info
                        SET isConverted = 2, Cancel_status = 'Progress'
                        WHERE Pre_Id = @Pre_Id
                    `);

                    const updateResult = await updatePresalesOrder;
                    if (updateResult.rowsAffected[0] === 0) {
                        throw new Error('Failed to update Pre-Sales Order');
                    }
                }
            }
            await transaction.commit();

            let message = '';
            let data = {};
            if (transactionType === 'order') {
                message = 'Order Created!';
                data = { So_Id: soId, So_Inv_No: soInvNo };
            } else if (transactionType === 'invoice') {
                message = 'Invoice Created!';
                data = { Do_Id: doId, Do_Inv_No: doInvNo };
            } else {
                message = 'Order and Invoice Created!';
                data = { So_Id: soId, So_Inv_No: soInvNo, Do_Id: doId, Do_Inv_No: doInvNo };
            }

            return success(res, message, data);
        } catch (e) {

            try {
                if (transaction._aborted === false) await transaction.rollback();
            } catch (rbErr) {
                console.error('Rollback failed:', rbErr);
            }
            console.error('createSalesTransaction error:', e);
            return servError(e, res);
        }
    };

    const getSaleOrderWithDeliveries = async (req, res) => {
        try {
            const { So_Id } = req.query;

            if (!So_Id) {
                return res.status(400).json({ success: false, message: "So_Id is required" });
            }

            const pool = await sql.Request()

                .input("SoIdParam", sql.Int, So_Id)
                .query(`
        -- 1. Sales Order Details
        SELECT 
            so.*, 
            rm.Retailer_Name, 
            u.Name AS CreatedByName
        FROM tbl_Sales_Order_Gen_Info so
        LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = so.Retailer_Id
        LEFT JOIN tbl_Users u ON u.UserId = so.Created_by
        WHERE so.So_Id = @SoIdParam;

        -- 2. Sales Order Products
        SELECT 
            si.*, 
            pm.Product_Name
        FROM tbl_Sales_Order_Stock_Info si
        LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = si.Item_Id
        WHERE si.Sales_Order_Id = @SoIdParam;

      
        SELECT 
            dgi.*, 
            st.Status AS DeliveryStatusName
        FROM tbl_Sales_Delivery_Gen_Info dgi
        LEFT JOIN tbl_Status st ON st.Status_Id = dgi.Delivery_Status
        WHERE dgi.So_No = @SoIdParam;

        -- 4. Delivery Products (if Act_Qty is NULL, use Bill_Qty)
        SELECT 
            dsi.*, 
            pm.Product_Name,
            COALESCE(dsi.Act_Qty, dsi.Bill_Qty) AS Act_Qty_Updated
        FROM tbl_Sales_Delivery_Stock_Info dsi
        LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = dsi.Item_Id
        WHERE dsi.Delivery_Order_Id IN (
            SELECT Do_Id 
            FROM tbl_Sales_Delivery_Gen_Info 
            WHERE So_No = @SoIdParam
        );
      `);

            const [orderInfo, orderProducts, deliveryOrders, deliveryProducts] = result.recordsets;

            if (!orderInfo.length) {
                return res.status(404).json({ success: false, message: "Sales order not found" });
            }

            const response = {
                ...orderInfo[0],
                Products_List: orderProducts || [],
                Deliveries: (deliveryOrders || []).map(doRow => ({
                    ...doRow,
                    Products: (deliveryProducts || []).filter(p => p.Delivery_Order_Id === doRow.Do_Id)
                }))
            };

            dataFound(res, response);

        } catch (err) {
            console.error(err);
            servError(err, res);
        }
    };

    return {
        createSalesInvoice,
        updateSalesInvoice,
        getSalesInvoice,
        getFilterValues,
        getStockInHandGodownWise,
        getSalesExpenceAccount,
        salesTallySync,
        liveSalesCreation,
        getSalesInvoiceMobile,
        salesInvoiceReport,
        createSalesTransaction,
        getSaleOrderWithDeliveries,
        getMobileReportDropdowns
    }
}

export default SalesInvoice();




                    // DECLARE @batchTransaction TABLE (
                    //     batch_id uniqueidentifier, batch nvarchar(50), trans_date date, item_id bigint, godown_id bigint, 
                    //     quantity decimal(18, 2), type nvarchar(50), reference_id nvarchar(100), created_by nvarchar(100)
                    // );
                    // INSERT INTO @batchTransaction (
                    //     batch_id, batch, trans_date, item_id, godown_id, 
                    //     quantity, type, reference_id, created_by
                    // ) 
                    // SELECT *
                    // FROM ( 
                    //     SELECT
                    //         COALESCE((
                    //             SELECT TOP(1) id 
                    //             FROM tbl_Batch_Master
                    //             WHERE batch = sd.Batch_Name AND item_id = sd.Item_Id AND godown_id = sd.GoDown_Id
                    //             ORDER BY id DESC
                    //         ), NULL) AS batch_id,
                    //         COALESCE(sd.Batch_Name, '') batch,
                    //         GETDATE() trans_date,
                    //         sd.Item_Id item_id,
                    //         sd.GoDown_Id godown_id,
                    //         -sd.Bill_Qty quantity,
                    //         'REVERSAL_SALES' type,
                    //         sd.DO_St_Id reference_id,
                    //         @created_by created_by
                    //     FROM tbl_Sales_Delivery_Stock_Info AS sd
                    //     WHERE sd.Delivery_Order_Id = @Do_Id AND sd.Batch_Name <> '' AND sd.Batch_Name IS NOT NULL
                    // ) AS batchDetails
                    // WHERE batchDetails.batch_id IS NOT NULL;