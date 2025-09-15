import sql from 'mssql'
import { dataFound, invalidInput, noData, sentData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, Multiplication, RoundNumber, Addition, NumberFormat, createPadString, toNumber, toArray } from '../../helper_functions.mjs'
import getImage from '../../middleware/getImageIfExist.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';



const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

const SaleOrder = () => {

    const saleOrderCreation = async (req, res) => {
        const {
            Retailer_Id, Sales_Person_Id, Branch_Id,
            Narration = null, Created_by, Product_Array = [], GST_Inclusive = 1, IS_IGST = 0, VoucherType = '',
            Staff_Involved_List = []
        } = req.body;

        const So_Date = ISOString(req?.body?.So_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Sales_Person_Id)
            || !checkIsNumber(Created_by)
            || (!Array.isArray(Product_Array) || Product_Array.length === 0)
            || !checkIsNumber(VoucherType)
        ) {
            return invalidInput(res, 'Retailer_Id, Sales_Person_Id, VoucherType, Items is Required')
        }

        const transaction = new sql.Transaction();

        try {

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            // unique Sale order id

            const So_Id_Get = await getNextId({ table: 'tbl_Sales_Order_Gen_Info', column: 'So_Id' });

            if (!So_Id_Get.status || !checkIsNumber(So_Id_Get.MaxId)) throw new Error('Failed to get So_Id_Get');

            const So_Id = So_Id_Get.MaxId;

            // year id and year code

            const So_Year_Master = await new sql.Request()
                .input('So_Date', So_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @So_Date 
                        AND Fin_End_Date >= @So_Date
                    `);

            if (So_Year_Master.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = So_Year_Master.recordset[0];

            // voucher code

            const voucherData = await new sql.Request()
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT Voucher_Code 
                    FROM tbl_Voucher_Type 
                    WHERE Vocher_Type_Id = @Voucher_Type`
                );

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;

            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            // year id and year code

            const So_Branch_Inv_Id = Number((await new sql.Request()
                .input('So_Year', Year_Id)
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT COALESCE(MAX(So_Branch_Inv_Id), 0) AS So_Branch_Inv_Id
                    FROM tbl_Sales_Order_Gen_Info
                    WHERE 
                        So_Year = @So_Year
                        AND VoucherType = @Voucher_Type`)
            )?.recordset[0]?.So_Branch_Inv_Id) + 1;

            if (!checkIsNumber(So_Branch_Inv_Id)) throw new Error('Failed to get Order Id');

            // creating invoice code

            const So_Inv_No = `${VoucherCode}/${createPadString(So_Branch_Inv_Id, 6)}/${Year_Desc}`;

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
            }, 0))

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
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

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('So_Id', So_Id)
                .input('So_Inv_No', So_Inv_No)
                .input('So_Year', Year_Id)
                .input('So_Branch_Inv_Id', So_Branch_Inv_Id)
                .input('So_Date', So_Date)
                .input('Retailer_Id', Retailer_Id)
                .input('Sales_Person_Id', Sales_Person_Id)
                .input('Branch_Id', Branch_Id)
                .input('VoucherType', VoucherType)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Narration', Narration)
                .input('Cancel_status', 0)
                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)
                .input('Alter_Id', Alter_Id)
                .input('Created_on', new Date())
                .input('Alterd_on', new Date())
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
                        @Retailer_Id, @Sales_Person_Id, @Branch_Id, @VoucherType, @CSGT_Total, 
                        @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                        @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                        @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create order, Try again.');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
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
                    .input('So_Date', So_Date)
                    .input('Sales_Order_Id', So_Id)
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
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Sales_Order_Stock_Info (
                            So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (const staff of toArray(Staff_Involved_List)) {
                await new sql.Request(transaction)
                    .input('So_Id', sql.Int, So_Id)
                    .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id)
                    .query(`
                    INSERT INTO tbl_Sales_Order_Staff_Info (
                        So_Id, Involved_Emp_Id, Cost_Center_Type_Id
                    ) VALUES (
                        @So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                    );`
                    );
            }

            await transaction.commit();

            success(res, 'Order Created!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const editSaleOrder = async (req, res) => {
        const {
            So_Id, Retailer_Id, Sales_Person_Id, Branch_Id,
            Narration = null, Created_by, Product_Array, GST_Inclusive = 1, IS_IGST = 0, VoucherType = '',
            Staff_Involved_List = []
        } = req.body;

        const So_Date = ISOString(req?.body?.So_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(So_Id)
            || !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Sales_Person_Id)
            || !checkIsNumber(Created_by)
            || !checkIsNumber(VoucherType)
            || (!Array.isArray(Product_Array) || Product_Array.length === 0)
        ) {
            return invalidInput(res, 'Retailer_Id, Sales_Person_Id, VoucherType, Product_Array is Required')
        }

        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

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
            }, 0))

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
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

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('soid', So_Id)
                .input('date', So_Date)
                .input('retailer', Retailer_Id)
                .input('salesperson', Sales_Person_Id)
                .input('branch', Branch_Id)
                .input('VoucherType', VoucherType)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('roundoff', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('totalinvoice', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('narration', Narration)
                .input('alterby', Created_by)
                .input('Alter_Id', Alter_Id)
                .input('alteron', new Date())
                .input('Trans_Type', 'UPDATE')
                .query(`
                    UPDATE 
                        tbl_Sales_Order_Gen_Info
                    SET
                        So_Date = @date, 
                        Retailer_Id = @retailer, 
                        Sales_Person_Id = @salesperson, 
                        Branch_Id = @branch, 
                        VoucherType = @VoucherType, 
                        GST_Inclusive = @GST_Inclusive, 
                        IS_IGST = @IS_IGST, 
                        CSGT_Total = @CSGT_Total, 
                        SGST_Total = @SGST_Total, 
                        IGST_Total = @IGST_Total, 
                        Round_off = @roundoff, 
                        Total_Invoice_value = @totalinvoice, 
                        Total_Before_Tax = @Total_Before_Tax, 
                        Total_Tax = @Total_Tax,
                        Narration = @narration,  
                        Altered_by = @alterby, 
                        Alter_Id = @Alter_Id, 
                        Alterd_on = @alteron,
                        Trans_Type = @Trans_Type
                    WHERE
                        So_Id = @soid;
                    `
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to update order, Try again')
            }

            await new sql.Request(transaction)
                .input('soid', So_Id)
                .query(`
                    DELETE FROM tbl_Sales_Order_Stock_Info WHERE Sales_Order_Id = @soid;
                    DELETE FROM tbl_Sales_Order_Staff_Info WHERE So_Id = @soid;`
                );

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
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
                    .input('So_Date', So_Date)
                    .input('Sales_Order_Id', So_Id)
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
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                            INSERT INTO tbl_Sales_Order_Stock_Info (
                                So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                                Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                                Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                            ) VALUES (
                                @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                                @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                                @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                            );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (const staff of toArray(Staff_Involved_List)) {
                await new sql.Request(transaction)
                    .input('So_Id', sql.Int, So_Id)
                    .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id)
                    .query(`
                    INSERT INTO tbl_Sales_Order_Staff_Info (
                        So_Id, Involved_Emp_Id, Cost_Center_Type_Id
                    ) VALUES (
                        @So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                    );`
                    );
            }

            await transaction.commit();
            success(res, 'Changes Saved!')

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }



    // const getSaleOrder = async (req, res) => {
    //     try {
    //         const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType } = req.query;

    //         const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
    //         const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

    //         const request = new sql.Request()
    //             .input('Fromdate', Fromdate)
    //             .input('Todate', Todate)
    //             .input('retailer', Retailer_Id)
    //             .input('cancel', Cancel_status)
    //             .input('creater', Created_by)
    //             .input('salesPerson', Sales_Person_Id)
    //             .input('VoucherType', VoucherType);

    //         const result = await request.query(`
    //             -- Step 1: Declare and populate filtered sales orders
    //             DECLARE @FilteredOrders TABLE (So_Id INT);
    //             INSERT INTO @FilteredOrders (So_Id)
    //             SELECT so.So_Id
    //             FROM tbl_Sales_Order_Gen_Info AS so
    //             WHERE 
    //                 CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
    //                 ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer ' : ''}
    //                 ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel ' : ''}
    //                 ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater ' : ''}
    //                 ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson ' : ''}
    //                 ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''};
    //             -- Step 2: Sales Order General Info
    //             SELECT 
    //                 so.*, 
    //                 COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
    //                 COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
    //                 COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
    //                 COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
    //                 COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
    //             FROM tbl_Sales_Order_Gen_Info AS so
    //             LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
    //             LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
    //             LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
    //             LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
    //             LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
    //             WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);
    //             -- Step 3: Product Details
    //             SELECT 
    //                 si.*,
    //                 COALESCE(pm.Product_Name, 'not available') AS Product_Name,
    //                 COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
    //                 COALESCE(u.Units, 'not available') AS UOM,
    //                 COALESCE(b.Brand_Name, 'not available') AS BrandGet
    //             FROM tbl_Sales_Order_Stock_Info AS si
    //             LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
    //             LEFT JOIN tbl_UOM AS u ON u.Unit_Id = si.Unit_Id
    //             LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
    //             WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders);
    //             -- Step 4: Staff involved
    //             SELECT 
    //             	sosi.So_Id, 
    //             	sosi.Involved_Emp_Id,
    //             	sosi.Cost_Center_Type_Id,
    //             	c.Cost_Center_Name AS EmpName,
    //             	cc.Cost_Category AS EmpType
    //             FROM tbl_Sales_Order_Staff_Info AS sosi
    //             LEFT JOIN tbl_ERP_Cost_Center AS c
    //             	ON c.Cost_Center_Id = sosi.Involved_Emp_Id
    //             LEFT JOIN tbl_ERP_Cost_Category cc
    //             	ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
    //             WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders)
    //             -- Step 5: Delivery General Info
    //             SELECT 
    //                 dgi.*,
    //                 rm.Retailer_Name AS Retailer_Name,
    //                 bm.BranchName AS Branch_Name,
    //                 st.Status AS DeliveryStatusName,
    //                 COALESCE((
    //                     SELECT SUM(collected_amount)
    //                     FROM tbl_Sales_Receipt_Details_Info
    //                     WHERE bill_id = dgi.Do_Id
    //                 ), 0) AS receiptsTotalAmount
    //             FROM tbl_Sales_Delivery_Gen_Info AS dgi
    //             LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
    //             LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
    //             LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
    //             WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);
    //             -- Step 6: Delivery Product Details
    //             SELECT 
    //                 oi.*,
    //                 COALESCE(pm.Product_Name, 'not available') AS Product_Name,
    //                 COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
    //                 COALESCE(u.Units, 'not available') AS UOM,
    //                 COALESCE(b.Brand_Name, 'not available') AS BrandGet
    //             FROM tbl_Sales_Delivery_Stock_Info AS oi
    //             LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
    //             LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
    //             LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
    //             WHERE oi.Delivery_Order_Id IN (
    //                 SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
    //                 WHERE So_No IN (SELECT So_Id FROM @FilteredOrders)
    //             );`
    //         );

    //         const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = result.recordsets.map(toArray);

    //         if (OrderData.length > 0) {
    //             const resData = OrderData.map(order => {
    //                 const deliveryList = DeliveryData.filter(d => isEqualNumber(d.So_No, order.So_Id));
    //                 const mappedDeliveries = deliveryList.map(d => ({
    //                     ...d,
    //                     InvoicedProducts: DeliveryItems.filter(p => isEqualNumber(p.Delivery_Order_Id, d.Do_Id)).map(prod => ({
    //                         ...prod,
    //                         ProductImageUrl: getImage('products', prod.Product_Image_Name)
    //                     }))
    //                 }));

    //                 return {
    //                     ...order,
    //                     Products_List: ProductDetails.filter(p => isEqualNumber(p.Sales_Order_Id, order.So_Id)).map(p => ({
    //                         ...p,
    //                         ProductImageUrl: getImage('products', p.Product_Image_Name)
    //                     })),
    //                     Staff_Involved_List: StaffInvolved.filter(s => isEqualNumber(s.So_Id, order.So_Id)),
    //                     ConvertedInvoice: mappedDeliveries
    //                 };
    //             });

    //             dataFound(res, resData);
    //         } else {
    //             noData(res);
    //         }

    //     } catch (e) {
    //         servError(e, res);
    //     }
    // };


    const getSaleOrder = async (req, res) => {
    try {
        const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType } = req.query;

        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('retailer', Retailer_Id)
            .input('cancel', Cancel_status)
            .input('creater', Created_by)
            .input('salesPerson', Sales_Person_Id)
            .input('VoucherType', VoucherType);

        const result = await request.query(`
            -- Step 1: Declare and populate filtered sales orders
            DECLARE @FilteredOrders TABLE (So_Id INT);
            INSERT INTO @FilteredOrders (So_Id)
            SELECT so.So_Id
            FROM tbl_Sales_Order_Gen_Info AS so
            WHERE 
                CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer ' : ''}
                ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel ' : ''}
                ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater ' : ''}
                ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson ' : ''}
                ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''};

            -- Step 2: Sales Order General Info
            SELECT 
                so.*, 
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Step 3: Product Details
            SELECT 
                si.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Order_Stock_Info AS si
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = si.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Step 4: Staff involved
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c
                ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc
                ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Step 5: Delivery General Info (✅ with custom status check)
            SELECT 
                dgi.*,
                rm.Retailer_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount,

                CASE 
                    WHEN NOT EXISTS (
                        SELECT 1
                        FROM tbl_Sales_Delivery_Stock_Info AS di
                        WHERE di.Delivery_Order_Id = dgi.Do_Id
                          AND ISNULL(di.Bill_Qty, 0) <> ISNULL(di.Act_Qty, 0)
                    ) 
                    THEN 'Completed'
                    ELSE 'New'
                END AS CustomDeliveryStatus

            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);

            -- Step 6: Delivery Product Details
            SELECT 
                oi.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info AS oi
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (
                SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
                WHERE So_No IN (SELECT So_Id FROM @FilteredOrders)
            );`
        );

        const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = result.recordsets.map(toArray);

        if (OrderData.length > 0) {
            const resData = OrderData.map(order => {
                const deliveryList = DeliveryData.filter(d => isEqualNumber(d.So_No, order.So_Id));
                const mappedDeliveries = deliveryList.map(d => ({
                    ...d,
                    InvoicedProducts: DeliveryItems.filter(p => isEqualNumber(p.Delivery_Order_Id, d.Do_Id)).map(prod => ({
                        ...prod,
                        ProductImageUrl: getImage('products', prod.Product_Image_Name)
                    }))
                }));

                return {
                    ...order,
                    Products_List: ProductDetails.filter(p => isEqualNumber(p.Sales_Order_Id, order.So_Id)).map(p => ({
                        ...p,
                        ProductImageUrl: getImage('products', p.Product_Image_Name)
                    })),
                    Staff_Involved_List: StaffInvolved.filter(s => isEqualNumber(s.So_Id, order.So_Id)),
                    ConvertedInvoice: mappedDeliveries
                };
            });

            dataFound(res, resData);
        } else {
            noData(res);
        }

    } catch (e) {
        servError(e, res);
    }
};

    
    const getDeliveryorder = async (req, res) => {
        try {
            const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType } = req.query;

            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('from', Fromdate)
                .input('to', Todate)
                .input('retailer', Retailer_Id)
                .input('cancel', Cancel_status)
                .input('creater', Created_by)
                .input('salesPerson', Sales_Person_Id)
                .input('VoucherType', VoucherType)
                .query(`
                    WITH SALES AS (
                    	SELECT 
                    		so.*,
                    		COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                            COALESCE(rm.Latitude, 'unknown') AS Latitude,
							COALESCE(rm.Longitude, 'unknown') AS Longitude,
                    		COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                    		COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    		COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    		COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                    	FROM 
                    		tbl_Sales_Order_Gen_Info AS so
                    		LEFT JOIN tbl_Retailers_Master AS rm
                    		    ON rm.Retailer_Id = so.Retailer_Id
                    		LEFT JOIN tbl_Users AS sp
                    		    ON sp.UserId = so.Sales_Person_Id
                    		LEFT JOIN tbl_Branch_Master bm
                    		    ON bm.BranchId = so.Branch_Id
                    		LEFT JOIN tbl_Users AS cb
                    		    ON cb.UserId = so.Created_by
                    	    LEFT JOIN tbl_Voucher_Type AS v
                    	        ON v.Vocher_Type_Id = so.VoucherType
                        WHERE
                            CONVERT(DATE, so.So_Date) >= CONVERT(DATE, @from)
                        	AND
                        	CONVERT(DATE, so.So_Date) <= CONVERT(DATE, @to)
                    		${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer ' : ''}
                            ${(Number(Cancel_status) === 0 || Number(Cancel_status) === 1) ? ' AND so.Cancel_status = @cancel ' : ''}
                            ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater ' : ''}
                            ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson ' : ''}
                            ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''}
                    ), SALES_DETAILS AS (
                        SELECT
                    		oi.*,
                    		COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                            COALESCE(u.Units, 'not available') AS UOM,
                            COALESCE(b.Brand_Name, 'not available') AS BrandGet
                    	FROM
                    		tbl_Sales_Order_Stock_Info AS oi
                            LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                            LEFT JOIN tbl_UOM AS u
                            ON u.Unit_Id = oi.Unit_Id
                            LEFT JOIN tbl_Brand_Master AS b
                            ON b.Brand_Id = pm.Brand
                    	WHERE oi.Sales_Order_Id IN (SELECT So_Id FROM SALES)
                    )
                    SELECT 
                    	sg.*,
                    	COALESCE((
                    		SELECT *
                    		FROM SALES_DETAILS
                    		WHERE Sales_Order_Id = sg.So_Id
                            FOR JSON PATH
                    	), '[]') AS Products_List
                    FROM SALES AS sg
                    ORDER BY CONVERT(DATETIME, sg.So_Id) DESC`
                )

            const result = await request

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: JSON.parse(o?.Products_List)
                }))
                const withImage = parsed.map(o => ({
                    ...o,
                    Products_List: o?.Products_List.map(oo => ({
                        ...oo,
                        ProductImageUrl: getImage('products', oo?.Product_Image_Name)
                    }))
                }));
                dataFound(res, withImage);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const importFromPos = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
            const Retailer_Id = req.query?.Retailer_Id;

            if (!checkIsNumber(Retailer_Id)) return invalidInput(res, 'Select Retailer');

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .input('Retailer_Id', sql.Int, Retailer_Id)
                .query(`
                    SELECT 
                    	gt.Pre_Id,
                    	gt.Pos_Id,
                    	gt.Pre_Date,
                    	gt.Custome_Id,
                    	COALESCE(r.Retailer_Name, 'Not Found') AS Retailer_Name,
                    	gt.Total_Invoice_value,
                    	st.S_No,
                    	st.Item_Id,
                    	COALESCE(p.Product_Name, 'Not Found') AS Product_Name,
                    	st.Unit_Id,
                    	COALESCE(uom.Units, 'Not Found') AS Units,
                    	st.Bill_Qty,
                    	st.Rate AS Item_Rate,
                    	st.Amount,
                        COALESCE(TRY_CAST(pck.Pack AS DECIMAL(18, 2)), 0) AS PackValue,
                        COALESCE(TRY_CAST(pck.Pack AS DECIMAL(18, 2)) * st.Bill_Qty, 0) AS Tonnage
                    FROM tbl_Pre_Sales_Order_Gen_Info AS gt
                    JOIN tbl_Pre_Sales_Order_Stock_Info AS st
                        ON st.Pre_Id = gt.Pre_Id
                    LEFT JOIN tbl_Sales_Order_Stock_Info AS sosi
                        ON sosi.Pre_Id = gt.Pre_Id
                    LEFT JOIN tbl_Retailers_Master AS r
                        ON r.Retailer_Id = gt.Custome_Id
                    LEFT JOIN tbl_Product_Master AS p
                        ON p.Product_Id = st.Item_Id
                    LEFT JOIN tbl_UOM AS uom
                        ON uom.Unit_Id = st.Unit_Id
                    LEFT JOIN tbl_Pack_Master AS pck
                        ON pck.Pack_Id = p.Pack_Id  
                    WHERE 
                    	CONVERT(DATE, gt.Pre_Date) BETWEEN @Fromdate AND @Todate
                    	AND gt.Custome_Id = @Retailer_Id
                        AND sosi.Pre_Id IS NULL
                    ORDER BY gt.Pos_Id`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailerNameForSearch = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        so.Retailer_Id,  
                        r.Retailer_Name,
                        SUM(so.Total_Invoice_value) AS TotalSales,
                        COUNT(so.S_Id) AS OrderCount
                    FROM tbl_Sales_Order_Gen_Info AS so
                    LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = so.Retailer_Id
                    WHERE r.Retailer_Name IS NOT NULL
                    GROUP BY so.Retailer_Id, r.Retailer_Name
                    ORDER BY r.Retailer_Name;
                `);

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getPresaleOrder = async (req, res) => {

        const Fromdate = req.query?.FromDate ? ISOString(req.query?.FromDate) : ISOString();
        const Todate = req.query?.ToDate ? ISOString(req.query?.ToDate) : ISOString();
        try {

            let query = `
              SELECT 
               gt.*,
               rm.Retailer_Name,
			   COALESCE(cc1.Cost_Center_Name,'') AS Broker_Name,
               COALESCE(cc2.Cost_Center_Name,'') AS Transporter_Name,
			   ISNULL((cc2.User_Type),0) AS TrasnportType,
			   ISNULL((cc1.user_Type),0) AS Broker_Type,

               (
                    SELECT 
                        st.S_No,
                        st.Item_Id,
                        COALESCE(p.Product_Name, 'Not Found') AS Product_Name,
                        st.Bill_Qty,
                        st.Rate AS Item_Rate,
                        st.Amount,
                        p.UOM_Id as Unit_Id,
						uom.Units AS Unit_Name,
                        COALESCE(TRY_CAST(pck.Pack AS DECIMAL(18, 2)), 0) AS PackValue,
                        COALESCE(TRY_CAST(pck.Pack AS DECIMAL(18, 2)) * st.Bill_Qty, 0) AS Tonnage
                    FROM tbl_Pre_Sales_Order_Stock_Info AS st
                    LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = st.Item_Id
                    LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                    LEFT JOIN tbl_UOM AS uom ON uom.Unit_Id=p.UOM_Id
                    WHERE st.Pre_Id = gt.Pre_Id
                    FOR JSON PATH
                ) AS ProductList,
                (
                  SELECT CASE 
                    WHEN EXISTS (
                      SELECT 1 FROM tbl_Sales_Order_Stock_Info AS sosi WHERE sosi.Pre_Id = gt.Pre_Id
                    ) THEN 'Converted' 
                    ELSE 'Pending' 
                  END
                ) AS Status
            FROM tbl_Pre_Sales_Order_Gen_Info AS gt
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = gt.Custome_Id
			LEFT JOIN tbl_ERP_Cost_Center AS cc1 ON cc1.Cost_Center_Id=gt.Broker_Id
            LEFT JOIN tbl_ERP_Cost_Center AS cc2 ON cc2.Cost_Center_Id=gt.Transporter_Id
            WHERE
                CONVERT(DATE, gt.Pre_Date) >= CONVERT(DATE, @Fromdate)
            AND CONVERT(DATE, gt.Pre_Date) <= CONVERT(DATE, @Todate)
            ORDER BY gt.Pos_Id ASC`;

            const request = new sql.Request();
            request.input('Fromdate', sql.DateTime, Fromdate)
            request.input('Todate', sql.DateTime, Todate);
            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    ProductList: JSON.parse(o?.ProductList)
                }));

                dataFound(res, parsed);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const saleOrderCreationWithPso = async (req, res) => {
        const {
            Retailer_Id, Pre_Id,
            Narration = null, Created_by, Product_Array = [], GST_Inclusive = 2, IS_IGST = 0, VoucherType = 0,
            Staffs_Array = []
        } = req.body;

        const So_Date = ISOString(req?.body?.So_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(Retailer_Id)
        ) {
            return invalidInput(res, 'Retailer_Id, Sales_Person_Id, Created_by, Product_Array is Required')
        }

        const transaction = new sql.Transaction();

        try {

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);


            const So_Id_Get = await getNextId({ table: 'tbl_Sales_Order_Gen_Info', column: 'So_Id' });

            if (!So_Id_Get.status || !checkIsNumber(So_Id_Get.MaxId)) throw new Error('Failed to get So_Id_Get');

            const So_Id = So_Id_Get.MaxId;

            const So_Year_Master = await new sql.Request()
                .input('So_Date', So_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @So_Date 
                        AND Fin_End_Date >= @So_Date
                    `);

            if (So_Year_Master.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = So_Year_Master.recordset[0];

            const voucherData = await new sql.Request()
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT Voucher_Code 
                    FROM tbl_Voucher_Type 
                    WHERE Vocher_Type_Id = @Voucher_Type`
                );

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;

            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            const So_Branch_Inv_Id = Number((await new sql.Request()
                .input('So_Year', Year_Id)
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT COALESCE(MAX(So_Branch_Inv_Id), 0) AS So_Branch_Inv_Id
                    FROM tbl_Sales_Order_Gen_Info
                    WHERE 
                        So_Year = @So_Year
                        AND VoucherType = @Voucher_Type`)
            )?.recordset[0]?.So_Branch_Inv_Id) + 1;

            if (!checkIsNumber(So_Branch_Inv_Id)) throw new Error('Failed to get Order Id');

            const So_Inv_No = `${VoucherCode}/${createPadString(So_Branch_Inv_Id, 6)}/${Year_Desc}`;

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
            }, 0))

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
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

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('So_Id', So_Id)
                .input('So_Inv_No', So_Inv_No)
                .input('So_Year', Year_Id)
                .input('So_Branch_Inv_Id', So_Branch_Inv_Id)
                .input('Pre_Id', Pre_Id)
                .input('So_Date', So_Date)
                .input('Retailer_Id', Retailer_Id)
                .input('Sales_Person_Id', 0)
                .input('Branch_Id', 1)
                .input('VoucherType', 0)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Narration', Narration)
                .input('Cancel_status', 0)
                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)
                .input('Alter_Id', Alter_Id)
                .input('Created_on', new Date())
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'INSERT')
                .query(`
                    INSERT INTO tbl_Sales_Order_Gen_Info (
                        So_Id, So_Inv_No, So_Year, So_Branch_Inv_Id,Pre_Id, So_Date, 
                        Retailer_Id, Sales_Person_Id, Branch_Id, VoucherType, CSGT_Total, 
                        SGST_Total, IGST_Total, GST_Inclusive, IS_IGST, Round_off, 
                        Total_Invoice_value, Total_Before_Tax, Total_Tax,Narration, Cancel_status, 
                        Created_by, Altered_by, Alter_Id, Created_on, Alterd_on, Trans_Type
                    ) VALUES (
                        @So_Id, @So_Inv_No, @So_Year, @So_Branch_Inv_Id,@Pre_Id, @So_Date, 
                        @Retailer_Id, @Sales_Person_Id, @Branch_Id, @VoucherType, @CSGT_Total, 
                        @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                        @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                        @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create order, Try again.');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id)

                const gstPercentage = isEqualNumber(IS_IGST, 1) ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = 0;
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
                    .input('So_Date', So_Date)
                    .input('Sales_Order_Id', So_Id)
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
                    .input('Unit_Id', product?.Unit_Id)
                    .input('Unit_Name', product?.Unit_Name)
                    .input('Taxable_Amount', gstInfo.base_amount)
                    .input('Tax_Rate', 0)
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Sales_Order_Stock_Info (
                            So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (const staff of Staffs_Array) {
                await new sql.Request(transaction)
                    .input('So_Id', sql.Int, So_Id)
                    .input('Involved_Emp_Id', sql.Int, staff.Emp_Id)
                    .input('Cost_Center_Type_Id', sql.Int, staff.Emp_Type_Id)
                    .query(`
                    INSERT INTO tbl_Sales_Order_Staff_Info 
                    (So_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                    VALUES (@So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                `);
            }

            const updatePresalesOrder = new sql.Request(transaction)
                .input('Pre_Id', toNumber(Pre_Id) || null)
                .query(`
                      UPDATE tbl_Pre_Sales_Order_Gen_Info
                      SET isConverted = 2,Cancel_status='Progress'
                      WHERE Pre_Id = @Pre_Id
                  `);

            const updateResult = await updatePresalesOrder;

            if (updateResult.rowsAffected[0] === 0) {
                throw new Error('Failed to update Pre-Sales Order');
            }

            await transaction.commit();
            success(res, 'Order Created!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const updatesaleOrderWithPso = async (req, res) => {
        const {
            Retailer_Id, Pre_Id,
            Narration = null, Created_by, Product_Array = [], Staffs_Array = [], GST_Inclusive = 2, IS_IGST = 0, VoucherType = 0,
        } = req.body;

        const So_Date = ISOString(req?.body?.So_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(Retailer_Id)
        ) {
            return invalidInput(res, 'Retailer_Id, Sales_Person_Id, Created_by, Product_Array is Required')
        }

        const transaction = new sql.Transaction();

        try {
            const getSaleOrderId = await new sql.Request()
                .input('Pre_Id', Pre_Id)
                .query(`
                SELECT * FROM tbl_Sales_Order_Stock_Info 
                WHERE Pre_Id = @Pre_Id`
                );


            let getSoId = getSaleOrderId.recordset[0].Sales_Order_Id;
            const getSaleOrderGenId = await new sql.Request()
                .input('So_Id', getSoId)
                .query(`
                SELECT * FROM tbl_Sales_Order_Gen_Info 
                WHERE So_Id = @So_Id`
                );

            if (getSaleOrderGenId.recordset.length == 0) {
                return invalidInput(res, 'There is No data');
            }

            let PrevioudSo_Id = getSaleOrderGenId.recordset[0].So_Id;
            let PrevioudSo_Inv_No = getSaleOrderGenId.recordset[0].So_Inv_No;
            let PrevioudSo_Branch_Inv_Id = getSaleOrderGenId.recordset[0].So_Branch_Inv_Id
            let PrevioudSo_Date = getSaleOrderGenId.recordset[0].So_Date
            let PrevioudYear_Id = getSaleOrderGenId.recordset[0].So_Year

            await new sql.Request()
                .input('Sales_Order_Id', getSoId)
                .query(`
                    DELETE FROM tbl_Sales_Order_Stock_Info 
                    WHERE Sales_Order_Id = @Sales_Order_Id`
                );

            await new sql.Request()
                .input('So_Id', getSoId)
                .query(`
                    DELETE FROM tbl_Sales_Order_Gen_Info 
                    WHERE So_Id = @So_Id`
                );

            await new sql.Request()
                .input('So_Id', sql.Int, getSoId)
                .query(`DELETE FROM tbl_Sales_Order_Staff_Info WHERE So_Id = @So_Id`);

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

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
            }, 0))

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
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

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('So_Id', PrevioudSo_Id)
                .input('So_Inv_No', PrevioudSo_Inv_No)
                .input('So_Year', PrevioudYear_Id)
                .input('So_Branch_Inv_Id', PrevioudSo_Branch_Inv_Id)
                .input('Pre_Id', Pre_Id)
                .input('So_Date', PrevioudSo_Date)
                .input('Retailer_Id', Retailer_Id)
                .input('Sales_Person_Id', 0)
                .input('Branch_Id', 1)
                .input('VoucherType', 0)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Narration', Narration)
                .input('Cancel_status', 0)
                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)
                .input('Alter_Id', Alter_Id)
                .input('Created_on', new Date())
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'INSERT')
                .query(`
                    INSERT INTO tbl_Sales_Order_Gen_Info (
                       So_Id, So_Inv_No, So_Year, So_Branch_Inv_Id,Pre_Id, So_Date, 
                        Retailer_Id, Sales_Person_Id, Branch_Id, VoucherType, CSGT_Total, 
                        SGST_Total, IGST_Total, GST_Inclusive, IS_IGST, Round_off, 
                        Total_Invoice_value, Total_Before_Tax, Total_Tax,Narration, Cancel_status, 
                        Created_by, Altered_by, Alter_Id, Created_on, Alterd_on, Trans_Type
                    ) VALUES (
                       @So_Id, @So_Inv_No, @So_Year, @So_Branch_Inv_Id, @Pre_Id,@So_Date, 
                        @Retailer_Id, @Sales_Person_Id, @Branch_Id, @VoucherType, @CSGT_Total, 
                        @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                        @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                        @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create order, Try again.');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id)

                const gstPercentage = isEqualNumber(IS_IGST, 1) ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = 0;
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
                    .input('So_Date', So_Date)
                    .input('Sales_Order_Id', PrevioudSo_Id)
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
                    .input('Unit_Id', product?.Unit_Id)
                    .input('Unit_Name', product?.Unit_Name)
                    .input('Taxable_Amount', gstInfo.base_amount)
                    .input('Tax_Rate', 0)
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Sales_Order_Stock_Info (
                            So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (const staff of Staffs_Array) {

                if (staff.Emp_Id && staff.Emp_Type_Id &&
                    staff.Emp_Id !== 0 && staff.Emp_Type_Id !== 0) {

                    await new sql.Request(transaction)
                        .input('So_Id', sql.Int, PrevioudSo_Id)
                        .input('Involved_Emp_Id', sql.Int, staff.Emp_Id)
                        .input('Cost_Center_Type_Id', sql.Int, staff.Emp_Type_Id)
                        .query(`
                            INSERT INTO tbl_Sales_Order_Staff_Info 
                            (So_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                            VALUES (@So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                        `);
                }

            }

            const updatePresalesOrder = new sql.Request(transaction)
                .input('Pre_Id', toNumber(Pre_Id) || null)
                .query(`
                      UPDATE tbl_Pre_Sales_Order_Gen_Info
                      SET isConverted = 2,Cancel_status='Progress'
                      WHERE Pre_Id = @Pre_Id
                  `);

            const updateResult = await updatePresalesOrder;

            if (updateResult.rowsAffected[0] === 0) {
                throw new Error('Failed to update Pre-Sales Order');
            }

            await transaction.commit();
            success(res, 'Order Updated!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const getSaleOrderMobile = async (req, res) => {
        try {
            const FromDate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const ToDate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const product = req.query?.Product;
            const brand = req.query?.Brand_Id
            const request = new sql.Request()
                .input('FromDate', FromDate)
                .input('ToDate', ToDate);

            let productCondition = "";
            let BrandCondition = "";
            if (product && !isNaN(product)) {
                productCondition = "AND pm.Product_Id = @Product";
                request.input('Product', product);
            }
            if (brand && !isNaN(brand)) {
                BrandCondition = "AND bm.Brand_Id = @Brand";
                request.input('Brand', brand);
            }

            const sqlQuery = `
                SELECT
                    COALESCE((
                        SELECT 
                            pm.Product_Id,
                            pm.Product_Name,
                            bm.Brand_Id,
                            bm.Brand_Name,
                           COUNT(DISTINCT so.So_Id) AS Total_Orders,
                           SUM( sos.Final_Amo) AS Total_Invoice_Value
                        FROM tbl_Sales_Order_Gen_Info AS so
                        LEFT JOIN tbl_Sales_Order_Stock_Info AS sos ON sos.Sales_Order_Id = so.So_Id
                        LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = sos.Item_Id
                        LEFT JOIN tbl_Brand_Master AS bm ON bm.Brand_Id = pm.Brand
                        WHERE so.So_Date >= @FromDate AND so.So_Date <= @ToDate
                        ${productCondition}
                        ${BrandCondition}
                        GROUP BY pm.Product_Name, bm.Brand_Name, pm.Product_Id, bm.Brand_Id
                        FOR JSON PATH
                    ), '[]') AS Summary,
                    COALESCE((
                        SELECT
                             COUNT(DISTINCT so.So_Id) AS Total_Orders,  
                            SUM( sos.Final_Amo) AS Total_Amount 
                        FROM tbl_Sales_Order_Gen_Info AS so
                        LEFT JOIN tbl_Sales_Order_Stock_Info AS sos ON sos.Sales_Order_Id = so.So_Id
                        LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = sos.Item_Id
                        LEFT JOIN tbl_Brand_Master AS bm ON bm.Brand_Id = pm.Brand
                        WHERE so.So_Date >= @FromDate AND so.So_Date <= @ToDate
                        ${productCondition}
                        ${BrandCondition}
                        FOR JSON PATH
                    ), '[]') AS Totals`;

            const result = await request.query(sqlQuery);

            if (result.recordset.length > 0) {
                const row = result.recordset[0];
                const parsed = {
                    ...row,
                    Summary: JSON.parse(row.Summary),
                    Totals: JSON.parse(row.Totals),
                };
                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };


        const saleOrderReport = async (req, res) => {
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
              fnd.BranchName
          FROM Avg_Live_Sale_Order_Branch_Fn_3(@Fromdate, @Todate) fnd
          LEFT JOIN tbl_Stock_Los stl 
                ON stl.Pro_Id = fnd.Product_Id
          ORDER BY fnd.BranchName, fnd.Product_Name;
        `;
    
        const salesRequest = new sql.Request()
          .input("Fromdate", sql.DateTime, Fromdate)
          .input("Todate", sql.DateTime, Todate);
    
        const salesResult = await salesRequest.query(salesQuery);
    
      
const groupedData = salesResult.recordset.reduce((branchAcc, item) => {
  const branchKey = item.BranchId || 0;

  if (!branchAcc[branchKey]) {
    branchAcc[branchKey] = {
      BranchId: item.BranchId,
      BranchName: item.BranchName,
      Products: [],
    };
  }

  branchAcc[branchKey].Products.push({
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

    
  const resultArray = Object.values(groupedData);
sentData(res, resultArray);

      } catch (e) {
        console.error("Error in sales report:", e);
        servError(e, res);
      }
    };
    return {
        saleOrderCreation,
        getSaleOrder,
        editSaleOrder,
        getDeliveryorder,
        importFromPos,
        getRetailerNameForSearch,
        getPresaleOrder,
        saleOrderCreationWithPso,
        updatesaleOrderWithPso,
        getSaleOrderMobile,
        saleOrderReport
    }
}


export default SaleOrder();