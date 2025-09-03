import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../helper_functions.mjs';
import { failed, invalidInput, servError, dataFound, noData, sentData, success } from '../../res.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';
import receiptMaster from '../Receipts/receiptMaster.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};


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

            const isSO = checkIsNumber(So_No)

            for (const [index, product] of Product_Array.entries()) {
                const productDetails = findProductDetails(productsData, product.Item_Id)

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

                const request2 = new sql.Request(transaction)
                    .input('Do_Date', Do_Date)
                    .input('DeliveryOrder', Do_Id)
                    .input('S_No', index + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Act_Qty', toNumber(product?.Act_Qty))
                    .input('Alt_Act_Qty', isSO ? toNumber(product?.Alt_Act_Qty) : toNumber(product?.Act_Qty))
                    .input('Item_Rate', toNumber(Item_Rate))
                    .input('GoDown_Id', checkIsNumber(product?.GoDown_Id) ? Number(product?.GoDown_Id) : null)
                    .input('Amount', toNumber(Amount))
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('HSN_Code', productDetails.HSN_Code)
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
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
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
                        Altered_by = @Altered_by
                    WHERE
                        Do_Id = @Do_Id`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create general info in sales invoice')
            }

            const deleteDetailsRows = new sql.Request(transaction)
                .input('Do_Id', Do_Id)
                .query(`
                    DELETE FROM tbl_Sales_Delivery_Stock_Info WHERE Delivery_Order_Id = @Do_Id;
                    DELETE FROM tbl_Sales_Delivery_Expence_Info WHERE Do_Id = @Do_Id;
                    DELETE FROM tbl_Sales_Delivery_Staff_Info WHERE Do_Id = @Do_Id;`
                );

            await deleteDetailsRows;

            const isSO = checkIsNumber(So_No)

            for (const [index, product] of Product_Array.entries()) {
                const productDetails = findProductDetails(productsData, product.Item_Id)

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

                const request2 = new sql.Request(transaction)
                    .input('Do_Date', Do_Date)
                    .input('DeliveryOrder', Do_Id)
                    .input('S_No', index + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Act_Qty', toNumber(product?.Act_Qty))
                    .input('Alt_Act_Qty', isSO ? toNumber(product?.Alt_Act_Qty) : toNumber(product?.Act_Qty))
                    .input('Item_Rate', toNumber(Item_Rate))
                    .input('GoDown_Id', checkIsNumber(product?.GoDown_Id) ? product?.GoDown_Id : null)
                    .input('Amount', toNumber(Amount))
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('Unit_Id', product.Unit_Id ?? '')
                    .input('Act_unit_Id', isSO ? product.Act_unit_Id : product.Unit_Id)
                    .input('Alt_Act_Unit_Id', isSO ? product.Alt_Act_Unit_Id : product.Unit_Id)
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
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
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

    const getSalesInvoiceMobile = async (req, res) => {
        try {
            const {
                Retailer_Id,
                Cancel_status,
                Created_by,
                VoucherType,
                Fromdate,
                Todate
            } = req.query;

            const fromDate = Fromdate
                ? new Date(Fromdate).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);
            const toDate = Todate
                ? new Date(Todate).toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10);

            const request = new sql.Request()
                .input('Fromdate', sql.Date, fromDate)
                .input('Todate', sql.Date, toDate)
                .input('Retailer_Id', sql.Int, Retailer_Id || null)
                .input('Cancel_status', sql.Int, Cancel_status || null)
                .input('Created_by', sql.Int, Created_by || null)
                .input('VoucherType', sql.Int, VoucherType || null);

            const sqlQuery = `
            SELECT
                COALESCE((
                    SELECT
                        COUNT(DISTINCT sdgi.Do_Id) AS Total_Invoices,
                        SUM(sdgi.Total_Invoice_value) AS Total_Invoice_Value
                    FROM tbl_Sales_Delivery_Gen_Info sdgi
                    WHERE sdgi.Do_Date BETWEEN @Fromdate AND @Todate
                        AND (@Retailer_Id IS NULL OR sdgi.Retailer_Id = @Retailer_Id)
                        AND (@Cancel_status IS NULL OR sdgi.Cancel_status = @Cancel_status)
                        AND (@Created_by IS NULL OR sdgi.Created_by = @Created_by)
                        AND (@VoucherType IS NULL OR sdgi.Voucher_Type = @VoucherType)
                    FOR JSON PATH
                ), '[]') AS Total,
                COALESCE((
                    SELECT
                        sdgi.Retailer_Id,
                        COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                        COUNT(DISTINCT sdgi.Do_Id) AS Invoice_Count,
                        SUM(sdgi.Total_Invoice_value) AS Total_Invoice_Value
                    FROM tbl_Sales_Delivery_Gen_Info sdgi
                    LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
                    WHERE sdgi.Do_Date BETWEEN @Fromdate AND @Todate
                        AND (@Retailer_Id IS NULL OR sdgi.Retailer_Id = @Retailer_Id)
                        AND (@Cancel_status IS NULL OR sdgi.Cancel_status = @Cancel_status)
                        AND (@Created_by IS NULL OR sdgi.Created_by = @Created_by)
                        AND (@VoucherType IS NULL OR sdgi.Voucher_Type = @VoucherType)
                    GROUP BY sdgi.Retailer_Id, rm.Retailer_Name
                    FOR JSON PATH
                ), '[]') AS Summary;`;

            const result = await request.query(sqlQuery);

            if (result.recordset.length > 0) {
                const row = result.recordset[0];
                return dataFound(res, {
                    Total: row.Total ? JSON.parse(row.Total) : [],
                    Summary: row.Summary ? JSON.parse(row.Summary) : []
                });
            } else {
                return noData(res);
            }
        } catch (e) {
            servError(e, res);
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
        salesInvoiceReport
    }
}

export default SalesInvoice();