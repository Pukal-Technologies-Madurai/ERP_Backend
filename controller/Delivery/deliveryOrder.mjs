import sql from 'mssql'
import { dataFound, invalidInput, noData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, Multiplication, RoundNumber, createPadString, Addition } from '../../helper_functions.mjs'
import getImage from '../../middleware/getImageIfExist.mjs';
import { getProducts, getNextId } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

const taxCalc = (method = 1, amount = 0, percentage = 0) => {
    switch (method) {
        case 0:
            return RoundNumber(amount * (percentage / 100));
        case 1:
            return RoundNumber(amount - (amount * (100 / (100 + percentage))));
        case 2:
            return 0;
        default:
            return 0;
    }
}

const DeliveryOrder = () => {

    const salesDeliveryCreation = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Retailer_Id, Delivery_Person_Id, Branch_Id,
                Narration = null, Created_by, Delivery_Location, Payment_Mode, Payment_Status, Delivery_Status,
                Payment_Ref_No = null, Delivery_Time = null, Product_Array = [], So_No, VoucherType = '',
                GST_Inclusive = 1, IS_IGST = 0
            } = req.body;

            const Do_Date = ISOString(req?.body?.Do_Date);
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';
            if (!Do_Date || !Retailer_Id || !Delivery_Person_Id || !Created_by || !VoucherType || !Array.isArray(Product_Array) || Product_Array.length === 0) {
                return invalidInput(res, 'Please select Required Fields')
            }

            await transaction.begin();
            const requestForSoNoCheck = new sql.Request(transaction);
            requestForSoNoCheck.input('So_No', sql.Int, So_No);
            const resultForSoNoCheck = await requestForSoNoCheck.query(`
                SELECT COUNT(*) AS count
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE So_No = @So_No`
            );

            if (resultForSoNoCheck.recordset[0].count > 0) {
                const queryUpdate = new sql.Request(transaction);
                queryUpdate.input('So_No', sql.Int, So_No);
                await queryUpdate.query(`
                    UPDATE tbl_Sales_Delivery_Gen_Info
                    SET Cancel_Status = 0
                    WHERE So_No = @So_No`
                );

                await transaction.commit();
                return success(res, 'Order Moved to Sales Delivery to Sale Order.');
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);


            const Do_Year_Master = await new sql.Request()
                .query(`SELECT Year_Desc, Id FROM tbl_Year_Master WHERE Active_Status = 'Yes' or  Active_Status= 'YES'`);

            const Do_Year_Desc = Do_Year_Master.recordset[0]?.Year_Desc;
            const Year_Master_Id = Do_Year_Master.recordset[0]?.Id;

            if (!Do_Year_Desc || !Year_Master_Id) throw new Error('Failed to fetch active year');

            const branchData = await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .query(`SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @Branch_Id`);

            const BranchCode = branchData.recordset[0]?.BranchCode;
            if (!BranchCode) throw new Error('Failed to fetch Branch Code');

            const voucherData = await new sql.Request()
                .input('Voucher_Type', VoucherType)
                .query(`SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Voucher_Type`);

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;

            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            const Do_Branch_Inv_Id = Number((await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .input('Do_Year', Year_Master_Id)
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Branch_Id = @Branch_Id
                        AND Do_Year = @Do_Year
                        AND Voucher_Type = @Voucher_Type`
                )).recordset[0]?.Do_No) + 1;

            if (!checkIsNumber(Do_Branch_Inv_Id)) throw new Error('Failed to get Order Id');


            const YearSplit = Do_Year_Desc;
            const FinancialYear = `${YearSplit}`;

            const Do_Inv_No = `${VoucherCode}/${createPadString(Do_Branch_Inv_Id, 6)}/${FinancialYear}`;

            const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });

            if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');

            const Do_Id = getDo_Id.MaxId;

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

            // await transaction.begin();

            const request = new sql.Request(transaction);
            request.input('Do_Id', Do_Id);
            request.input('Do_No', Do_Branch_Inv_Id);
            request.input('Do_Year', Year_Master_Id);
            request.input('Voucher_Type', VoucherType)
            request.input('Do_Inv_No', Do_Inv_No)
            request.input('Do_Date', sql.Date, Do_Date);
            request.input('Retailer_Id', sql.Int, Retailer_Id);
            request.input('Delivery_Person_Id', sql.Int, Number(Delivery_Person_Id) || 0);
            request.input('Branch_Id', sql.Int, Branch_Id);
            request.input('GST_Inclusive', sql.Int, GST_Inclusive);
            request.input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
            request.input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
            request.input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
            request.input('IS_IGST', isIGST ? 1 : 0)
            request.input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
            request.input('Total_Invoice_value', Math.round(Total_Invoice_value))
            request.input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
            request.input('Total_Tax', totalValueBeforeTax.TotalTax)
            request.input('Narration', Narration)
            request.input('Cancel_status', 0)
            request.input('So_No', So_No)
            request.input('Delivery_Status', sql.Int, Delivery_Status);
            request.input('Delivery_Time', sql.NVarChar(50), Delivery_Time);
            request.input('Delivery_Location', sql.NVarChar(250), Delivery_Location);
            request.input('Payment_Ref_No', sql.NVarChar(255), Payment_Ref_No);
            request.input('Payment_Mode', sql.Int, Payment_Mode);
            request.input('Payment_Status', sql.Int, Payment_Status);
            request.input('Alter_Id', sql.BigInt, Alter_Id)
            request.input('Created_by', sql.BigInt, Created_by);
            request.input('Created_on', sql.DateTime, new Date());
            request.input('Trans_Type', 'INSERT')
            const result = await request.query(`
       
           
                INSERT INTO tbl_Sales_Delivery_Gen_Info (
                    Do_Id, Do_No, Do_Inv_No, Voucher_Type, Do_Date, Do_Year, Retailer_Id, Delivery_Person_Id, Branch_Id,
                    GST_Inclusive, CSGT_Total, SGST_Total, IGST_Total, Round_off,
                    Total_Before_Tax, Total_Tax, Total_Invoice_value, Narration,
                    Cancel_status, So_No, Delivery_Status, Delivery_Time, Delivery_Location,
                    Trans_Type, Payment_Mode, Payment_Ref_No, Payment_Status, Alter_Id, Created_by, Created_on
                )
               
                VALUES (
                    @Do_Id, @Do_No, @Do_Inv_No, @Voucher_Type, @Do_Date, @Do_Year, @Retailer_Id, @Delivery_Person_Id, @Branch_Id,
                    @GST_Inclusive, @CSGT_Total, @SGST_Total, @IGST_Total, @Round_off,
                    @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Narration,
                    @Cancel_status, @So_No, @Delivery_Status, @Delivery_Time, @Delivery_Location,
                    @Trans_Type, @Payment_Mode, @Payment_Ref_No, @Payment_Status, @Alter_Id, @Created_by, @Created_on
                );
           
             
            `);


            const request3 = new sql.Request(transaction);
            request3.input('So_Id', So_No);
            request3

            const result3 = await request3.query(`
                 update tbl_Sales_Order_Gen_Info SET isConverted=2 where So_Id=@So_Id
                `);



            const DeliveryId = result.recordset && result.recordset.length > 0 ? result.recordset[0].Do_Id : null;


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
                    .input('Do_Date', Do_Date)
                    .input('DeliveryOrder', Do_Id)
                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Item_Rate', Item_Rate)
                    .input('GoDown_Id', 1)
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
                    .input('Final_Amo', Math.round(Total_Invoice_value))
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate,GoDown_Id, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @DeliveryOrder, @S_No, @Item_Id, @Bill_Qty, @Item_Rate,@GoDown_Id, @Amount, @Free_Qty, @Total_Qty,
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }


            // Commit the transaction
            await transaction.commit();

            success(res, 'Delivery Created!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    };

    const editDeliveryOrder = async (req, res) => {

        const transaction = new sql.Transaction();

        try {
            const {
                Do_Id, Retailer_Id, Branch_Id,
                Narration, Created_by, Product_Array, GST_Inclusive = 1, IS_IGST = 0, Delivery_Status,
                Delivery_Time, Delivery_Location, Delivery_Latitude, Delivery_Longitude, Collected_By, Collected_Status, Payment_Mode, Payment_Status, Payment_Ref_No
            } = req.body;

            const Do_Date = ISOString(req?.body?.Do_Date);
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';
            if (
                !checkIsNumber(Do_Id)
                || !checkIsNumber(Retailer_Id)

                || !checkIsNumber(Created_by)
                || (!Array.isArray(Product_Array) || Product_Array.length === 0)
            ) {
                return invalidInput(res, 'Do_Id, Retailer_Id, Created_by, Product_Array is Required')
            }

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
                .input('doid', Do_Id)
                .input('date', Do_Date)
                .input('retailer', Retailer_Id)
                .input('branch', Branch_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('roundoff', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('totalinvoice', Total_Invoice_value)
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('narration', Narration)
                .input('alterby', Created_by)
                .input('Alter_Id', Alter_Id)
                .input('alteron', new Date())
                .input('deliverystatus', Delivery_Status)
                .input('deliveryTime', Delivery_Time)
                .input('deliveryLocation', Delivery_Location)
                .input('deliverylatitude', Delivery_Latitude)
                .input('deliverylongitute', Delivery_Longitude)
                .input('collectedby', Collected_By)
                .input('collectedStatus', Collected_Status)
                .input('paymentMode', Payment_Mode)
                .input('paymentStatus', Payment_Status)
                .input('paymentrefno', Payment_Ref_No)
                .input('Trans_Type', 'UPDATE')
                .query(`
                    UPDATE
                        tbl_Sales_Delivery_Gen_Info
                    SET
                        Do_Date = @date,
                        Retailer_Id = @retailer,
                        Branch_Id = @branch,
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
                        Delivery_Time=@deliveryTime,
                        Delivery_Status=@deliverystatus,
                       Delivery_Location=@deliveryLocation,
                       Delivery_Latitude=@deliverylatitude,
                       Delivery_Longitude=@deliverylongitute,
                       Collected_By=@collectedby,
                       Collected_Status=@collectedStatus,
                       Payment_Mode=@paymentMode,
                       Payment_Status=@paymentStatus,
                       Payment_Ref_No=@paymentrefno,
                        Alterd_on = @alteron,
                        Trans_Type = @Trans_Type
                    WHERE
                        Do_Id = @doid;
                    `
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to update order, Try again')
            }

            await new sql.Request(transaction)
                .input('doid', Do_Id)
                .query(`DELETE FROM tbl_Sales_Delivery_Stock_Info WHERE Delivery_Order_Id = @doid`);

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
                    .input('Do_Date', Do_Date ? Do_Date : new Date())
                    .input('Delivery_Order_Id', Do_Id)
                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('GoDown_Id', 1)
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
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty,GoDown_Id,
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty,@GoDown_Id,
                            @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
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

    const getSaleOrder = async (req, res) => {
        const { Retailer_Id, Cancel_status, Created_by, Sales_Person_Id } = req.query;

        const Fromdate = ISOString(req.query.Fromdate), Todate = ISOString(req.query.Todate);

        try {
            let query = `
            WITH SALES_DETAILS AS (
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
                WHERE
                    CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
               AND
               CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
            )
            SELECT
            so.*,
            COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
            COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
            COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
            COALESCE(cb.Name, 'unknown') AS Created_BY_Name,

            COALESCE((
            SELECT
            sd.*
            FROM
            SALES_DETAILS AS sd
            WHERE
            sd.Sales_Order_Id = so.So_Id
            FOR JSON PATH
            ), '[]') AS Products_List
           
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
                       
            WHERE
                CONVERT(DATE, so.Do_Date) >= CONVERT(DATE, @from)
            AND
            CONVERT(DATE, so.Do_Date) <= CONVERT(DATE, @to)    
            `;

            if (Retailer_Id) {
                query += `
                AND
            so.Retailer_Id = @retailer `
            }

            if (Number(Cancel_status) === 0 || Number(Cancel_status) === 1) {
                query += `
                AND
            so.Cancel_status = @cancel `
            }

            if (Created_by) {
                query += `
                AND
            so.Created_by = @creater `
            }

            if (Sales_Person_Id) {
                query += `
                AND
                so.Sales_Person_Id = @salesPerson `
            }

            query += `
            ORDER BY CONVERT(DATETIME, so.Do_Id) DESC`;

            const request = new sql.Request();
            request.input('from', Fromdate);
            request.input('to', Todate);
            request.input('retailer', Retailer_Id);
            request.input('cancel', Cancel_status);
            request.input('creater', Created_by);
            request.input('salesPerson', Sales_Person_Id)

            const result = await request.query(query);

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

    const getDeliveryorder = async (req, res) => {
        const { Retailer_Id, Cancel_status, Created_by, Delivery_Person_Id, Route_Id, Area_Id } = req.query;

        try {

            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

            let query = `
                        WITH SALES_DETAILS AS (
                          SELECT
                              oi.*,
                              pm.Product_Id,
                              COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                              COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                              COALESCE(u.Units, 'not available') AS UOM,
                              COALESCE(b.Brand_Name, 'not available') AS BrandGet
                          FROM
                              tbl_Sales_Delivery_Stock_Info AS oi
                          LEFT JOIN tbl_Product_Master AS pm
                              ON pm.Product_Id = oi.Item_Id
                          LEFT JOIN tbl_UOM AS u
                              ON u.Unit_Id = oi.Unit_Id
                          LEFT JOIN tbl_Brand_Master AS b
                              ON b.Brand_Id = pm.Brand
                          WHERE
                              CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
                              AND CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
                      )
                      SELECT DISTINCT
                          so.Do_Id AS Delivery_Order_id,
                          so.*,
                          rm.Retailer_Name AS Retailer_Name,
                         erpUser.Name AS Delivery_Person_Name, -- Get name from tbl_Users instead
                        
                          bm.BranchName AS Branch_Name,
                          cb.Name AS Created_BY_Name,
                          rmt.Route_Name AS Routename,
                          am.Area_Name AS AreaName,
                          rmt.Route_Id AS Route_Id,
                          rm.Area_Id AS Area_Id,
                          st.Status AS DeliveryStatusName,
                          sgi.SO_Date AS SalesDate,
                          COALESCE((
                              SELECT
                                  sd.*
                              FROM
                                  SALES_DETAILS AS sd
                              WHERE
                                  sd.Delivery_Order_Id = so.Do_Id
                              FOR JSON PATH
                          ), '[]') AS Products_List
                      FROM
                          tbl_Sales_Delivery_Gen_Info AS so
                      LEFT JOIN tbl_Retailers_Master AS rm
                          ON rm.Retailer_Id = so.Retailer_Id
                      LEFT JOIN tbl_Status AS st
                          ON st.Status_Id = so.Delivery_Status
                      LEFT JOIN tbl_Users AS sp
                          ON sp.UserId = so.Delivery_Person_Id
                      LEFT JOIN tbl_Branch_Master bm
                          ON bm.BranchId = so.Branch_Id
                      LEFT JOIN tbl_Users AS cb
                          ON cb.UserId = so.Created_by
                      LEFT JOIN tbl_Route_Master AS rmt
                          ON rmt.Route_Id = rm.Route_Id
                      LEFT JOIN tbl_Area_Master AS am
                          ON am.Area_Id = rm.Area_Id
                      LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi
                          ON sgi.So_Id = so.So_No
                      LEFT JOIN tbl_Trip_Details AS td
                          ON td.Delivery_Id = so.Do_Id
                          LEFT JOIN tbl_ERP_Cost_Center AS ecc
        ON ecc.Cost_Center_Id = so.Delivery_Person_Id 
    LEFT JOIN tbl_Users AS erpUser
        ON erpUser.UserId = ecc.User_Id
                      
                      WHERE
                          CONVERT(DATE, so.Do_Date) >= CONVERT(DATE, @from)
                          AND CONVERT(DATE, so.Do_Date) <= CONVERT(DATE, @to)
                                  `;

            // Add optional filters
            if (Retailer_Id) {
                query += ` AND so.Retailer_Id = @retailer`;
            }
            if (Created_by) {
                query += ` AND so.Created_by = @creater`;
            }
            if (Delivery_Person_Id) {
                query += ` AND erpUser.UserId = @Delivery_Person_Id`;
            }
            if (Route_Id) {
                query += ` AND rmt.Route_Id = @Route_Id`;
            }
            if (Area_Id) {
                query += ` AND rm.Area_Id = @Area_Id`;
            }


            query += ` ORDER BY so.Do_Id DESC`;

            const request = new sql.Request();
            request.input('from', Fromdate);
            request.input('to', Todate);
            request.input('retailer', Retailer_Id);
            request.input('cancel', Cancel_status);
            request.input('creater', Created_by);
            request.input('Delivery_Person_Id', sql.Int, Delivery_Person_Id);
            request.input('Route_Id', sql.Int, Route_Id);
            request.input('Area_Id', sql.Int, Area_Id);


            const result = await request.query(query);


            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: o?.Products_List ? JSON.parse(o.Products_List) : []
                }));
                const withImage = parsed.map(o => ({
                    ...o,
                    Products_List: o?.Products_List.map(oo => ({
                        ...oo,
                        ProductImageUrl: getImage('products', oo?.Product_Image_Name)
                    }))
                }));
                dataFound(res, withImage);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteDeliveryOrder = async (req, res) => {
        const { Order_Id, Do_Id } = req.body;

        if (!Order_Id || !Do_Id) {
            return invalidInput(res, 'Invalid Order_Id or Do_Id');
        }

        try {

            const getSoNoRequest = new sql.Request()
                .input('Do_Id', sql.Int, Do_Id);

            const selectDeliverySoId = await getSoNoRequest.query(`
                SELECT So_No 
                FROM tbl_Sales_Delivery_Gen_Info 
                WHERE Do_Id = @Do_Id;
            `);

            if (selectDeliverySoId.recordset.length === 0) {
                return noData(res, 'No delivery order found with the given Do_Id.');
            }

            const So_No = selectDeliverySoId.recordset[0].So_No;

            await new sql.Request()
                .input('So_No', sql.Int, So_No)
                .query(`
                    UPDATE tbl_Sales_Order_Gen_Info 
                    SET isConverted = 0 
                    WHERE So_Id = @So_No;
                `);

            const deleteDeliveryResult = await new sql.Request()
                .input('Do_Id', sql.Int, Do_Id)
                .query(`
                    DELETE FROM tbl_Sales_Delivery_Gen_Info 
                    WHERE Do_Id = @Do_Id;
                `);

            if (deleteDeliveryResult.rowsAffected[0] === 0) {
                return failed(res, 'Failed to delete the Delivery Order from tbl_Sales_Delivery_Gen_Info.');
            }

            const deleteStockResult = await new sql.Request()
                .input('Do_Id', sql.Int, Do_Id)
                .query(`
                    DELETE FROM tbl_Sales_Delivery_Stock_Info 
                    WHERE Delivery_Order_Id = @Do_Id;
                `);

            if (deleteStockResult.rowsAffected[0] === 0) {
                return noData(res, 'Failed to delete the Sales Order from tbl_Sales_Delivery_Stock_Info.');
            }

            return success(res, 'Delivery Order deleted successfully.');
        } catch (e) {
            return servError(e, res);
        }
    };

    const editmobileApi = async (req, res) => {
        const {
            Do_Id, Retailer_Id, Delivery_Person_Id,
            Delivery_Status,
            Delivery_Time, Delivery_Location, Delivery_Latitude, Delivery_Longitude, Payment_Mode, Payment_Status, Payment_Ref_No, Altered_by, Altered_on
        } = req.body;

        const Do_Date = ISOString(req?.body?.Do_Date);


        if (
            !checkIsNumber(Do_Id)
            || !checkIsNumber(Delivery_Person_Id)

        ) {
            return invalidInput(res, 'Do_Id, Delivery_Person_Id is Required')
        }

        const transaction = new sql.Transaction();

        try {

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('doid', Do_Id)
                .input('deliveryperson', Delivery_Person_Id)
                .input('deliverystatus', Delivery_Status)
                .input('deliveryTime', Delivery_Time)
                .input('deliveryLocation', Delivery_Location)
                .input('deliverylatitude', Delivery_Latitude)
                .input('deliverylongitute', Delivery_Longitude)
                .input('paymentMode', Payment_Mode)
                .input('paymentStatus', Payment_Status)
                .input('paymentrefno', Payment_Ref_No)
                .input('Trans_Type', 'UPDATE')
                .input('Altered_by', Altered_by)
                .input('Alteron', new Date())
                .query(`
                    UPDATE
                        tbl_Sales_Delivery_Gen_Info
                    SET
                        Delivery_Person_Id = @deliveryperson,
                        Delivery_Time=@deliveryTime,
                        Delivery_Status=@deliverystatus,
                       Delivery_Location=@deliveryLocation,
                       Delivery_Latitude=@deliverylatitude,
                       Delivery_Longitude=@deliverylongitute,
                       Payment_Mode=@paymentMode,
                       Payment_Status=@paymentStatus,
                       Payment_Ref_No=@paymentrefno,
                        Trans_Type = @Trans_Type,
                        Altered_by=@Altered_by,
                        Alterd_on=@Alteron
                    WHERE
                        Do_Id = @doid;
                    `
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {

                throw new Error('Failed to update order, Try again')
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

    const deliveryOrderTrip = async (req, res) => {
        const {

            Product_Array = [],
            EmployeesInvolved = [],
            Trip_ST_KM,
            Trip_EN_KM,
            Branch_Id,
            Vehicle_No,
            Trip_No,
            StartTime,
            Created_By,
            TripStatus,
            GST_Inclusive = 1,
            BillType,
            VoucherType,
            IS_IGST = 0,
            Delivery_Person_Id,
            Delivery_Location

        } = req.body;

        var Trip_Date = req.body.Trip_Date;
        var Alter_Id = req.body.Alter_Id;
        const transaction = new sql.Transaction();

        if (!Delivery_Person_Id || !Branch_Id || !BillType || !VoucherType || !TripStatus) {
            return invalidInput(res, 'Please Select Required Fields');
        }

        try {

            await transaction.begin();

            // const requestForDoNos = new sql.Request(transaction);
            // const resultForDoNo = await requestForDoNos.query(`
            //         SELECT COUNT(*) AS count
            //         FROM tbl_Sales_Delivery_Gen_Info
            //     `);
            // const maxDoNo = Number(resultForDoNo.recordset[0].count) + 1;

            const Trip_Id = Number((await new sql.Request().query(`
                          SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
                          FROM tbl_Trip_Master
                      `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');

            const Trip_No = Number((await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .query(`
                               SELECT COALESCE(MAX(Trip_No), 0) AS MaxId
                               FROM tbl_Trip_Master    
                               WHERE 
                                   Trip_Date = @Trip_Date
                                `
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_No)) throw new Error('Failed to get Trip_No');

            const getYearId = await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .query(`
                               SELECT Id AS Year_Id, Year_Desc
                               FROM tbl_Year_Master
                               WHERE 
                                   Fin_Start_Date <= @Trip_Date 
                                   AND Fin_End_Date >= @Trip_Date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];


            const countResult = await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('VoucherType', VoucherType)
                .query(`
                    SELECT COUNT(*) AS RecordCount
                    FROM tbl_Trip_Master
                    WHERE Year_Id = @Year_Id
                    AND VoucherType = @VoucherType
                `);

            const recordCount = countResult.recordset[0].RecordCount;
            const T_No = recordCount + 1;



            if (!checkIsNumber(T_No)) throw new Error('Failed to get T_No');

            const BranchCodeGet = await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .query(`
                               SELECT BranchCode
                               FROM tbl_Branch_Master
                               WHERE BranchId = @Branch_Id`
                );

            if (BranchCodeGet.recordset.length === 0) throw new Error('Failed to get BranchCode');

            const BranchCode = BranchCodeGet.recordset[0]?.BranchCode || '';

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', VoucherType)
                .query(`
                               SELECT Voucher_Code
                               FROM tbl_Voucher_Type
                               WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            const TR_INV_ID = Voucher_Code + "/" + createPadString(T_No, 6) + "/" + Year_Desc;

            const Challan_No = createPadString(Trip_Id, 4);
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);



            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .input('TR_INV_ID', TR_INV_ID)
                .input('T_NO', T_No)
                .input('VoucherType', VoucherType)
                .input('Year_Id', Year_Id)
                .input('Challan_No', Challan_No)
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('BillType', 'SALES')
                .input('Vehicle_No', Vehicle_No)
                .input('TripStatus', TripStatus)
                .input('StartTime', StartTime)
                .input('Trip_No', Trip_No)
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Created_By', Created_By)
                .input('Created_At', new Date())
                .query(`
                        INSERT INTO tbl_Trip_Master (
                            Trip_Id,TR_INV_ID,T_NO, Challan_No,Year_Id, Branch_Id, Trip_Date,VoucherType,BillType, Vehicle_No,TripStatus,
                            StartTime, Trip_No, Trip_ST_KM, Created_By, Created_At
                        ) VALUES (
                            @Trip_Id,@TR_INV_ID,@T_NO, @Challan_No,@Year_Id, @Branch_Id, @Trip_Date,@VoucherType,@BillType, @Vehicle_No,@TripStatus,
                            @StartTime, @Trip_No, @Trip_ST_KM, @Created_By, @Created_At
                        );
                    
                    `);

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }



            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                var DeliveryId = product?.Do_Id;



                const getMax = await new sql.Request(transaction)
                    .query(`SELECT COALESCE(MAX(Trip_Id),0) AS MaxTripId FROM tbl_Trip_Master`);

                var getMaxTripId = getMax.recordset[0].MaxTripId;

                if (EmployeesInvolved.length > 0) {
                    const FirstEmployeeId = EmployeesInvolved[0].Involved_Emp_Id;

                    await new sql.Request(transaction)
                        .input('DeliveryId', DeliveryId)
                        .input('Delivery_Person_Id', FirstEmployeeId)
                        .query(`
                            UPDATE tbl_Sales_Delivery_Gen_Info
                            SET Delivery_Person_Id = @Delivery_Person_Id
                            WHERE Do_Id = @DeliveryId;
                        `);
                }


                await new sql.Request(transaction)
                    .input('Trip_Id', getMaxTripId)
                    .input('Delivery_Id', DeliveryId)
                    .query(`
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, Delivery_Id
                        ) VALUES (
                            @Trip_Id, @Delivery_Id
                        );
                    `);
            }


            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];

                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                            INSERT INTO tbl_Trip_Employees (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                            VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                        `);
            }

            await transaction.commit();
            success(res, 'Trip Created Successfully!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            console.error(e);
            return servError(e, res);
        }
    };

    const deliveryTripsheetList = async (req, res) => {

        try {
            const FromDate = ISOString(req.query.Fromdate), ToDate = ISOString(req.query.Todate);

            if (!FromDate && !ToDate) {
                return invalidInput(res, 'Select StartDate & EndDate')
            }

            const request = new sql.Request();
            request.input('FromDate', sql.Date, FromDate);
            request.input('ToDate', sql.Date, ToDate);
            const result = await request.query(

                `WITH TRIP_MASTER AS (
    SELECT
        tr.Trip_Id,
        tr.Challan_No,
        tr.EndTime,
        tr.StartTime,
        tr.Trip_Date,
        tr.Trip_EN_KM,
        tr.Trip_No,
        tr.Trip_ST_KM,
        tr.Trip_Tot_Kms,
        tr.Vehicle_No,
        tr.Branch_Id,
        tr.BillType,
        tr.VoucherType,
        tr.TR_INV_ID,
        bm.BranchName
    FROM tbl_Trip_Master tr
    LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = tr.Branch_Id
	 WHERE tr.Trip_Date BETWEEN @FromDate AND @ToDate AND tr.BillType= 'SALES'
),
TRIP_DETAILS AS (
    SELECT DISTINCT
        td.Trip_Id,
        td.Delivery_Id,
        sgi.Do_Id,
        sgi.So_No,
        sgi.Total_Before_Tax,
        sgi.Total_Invoice_Value,
        sgi.SGST_Total,
        sgi.CSGT_Total,
        sgi.IGST_Total,
        sgi.Delivery_Person_Id,
        sgi.Delivery_Status,
        sgi.Cancel_status,
        sgi.Total_Tax,
        sgi.Created_by,
        sgi.Altered_by,
        sgi.Do_Date AS Delivery_Do_Date,  
        sogi.So_Id AS Sales_Order_Id,  
        sogi.Retailer_Id AS Order_Retailer_Id  
    FROM tbl_Trip_Details AS td
    LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sgi ON sgi.Do_Id = td.Delivery_Id
    LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sgi.So_No
),
TRIP_EMPLOYEES AS (
    SELECT
        te.Trip_Id,
        te.Involved_Emp_Id,
        e.Cost_Center_Name AS Emp_Name,
        cc.Cost_Category,
        cc.Cost_Category_Id
    FROM tbl_Trip_Employees AS te
    LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = te.Involved_Emp_Id
    LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = te.Cost_Center_Type_Id
)
SELECT
    tm.Trip_Id,
    tm.Challan_No,
    tm.EndTime,
    tm.StartTime,
    tm.Trip_Date,
    tm.Trip_EN_KM,
    tm.Trip_No,
    tm.Trip_ST_KM,
    tm.Trip_Tot_Kms,
    tm.Vehicle_No,
    tm.Branch_Id, 
    tm.TR_INV_ID,
      tm.BillType,
        tm.VoucherType,

    (SELECT MIN(td.Delivery_Do_Date) 
     FROM TRIP_DETAILS AS td 
     WHERE td.Trip_Id = tm.Trip_Id) AS DO_Date,

    COALESCE((  
        SELECT DISTINCT
            td.Delivery_Id,
            td.Do_Id,
            td.So_No,
            td.Total_Before_Tax,
            td.Total_Invoice_Value,
            td.SGST_Total,
            td.CSGT_Total,
            td.IGST_Total,
            td.Delivery_Person_Id,
            ecc.Cost_Center_Name,
            ecc.User_Id,
            us.Name,
            td.Delivery_Status,
            td.Cancel_status,
            td.Total_Tax,
            td.Created_by,
            td.Altered_by,
            td.Sales_Order_Id,
            td.Order_Retailer_Id,
            ISNULL(sgi.Delivery_Time, '') AS Delivery_Time,  
        ISNULL(sgi.Payment_Mode, '') AS Payment_Mode,
           ISNULL(sgi.Payment_Ref_No, '') AS Payment_Ref_No,
        ISNULL(sgi.Delivery_Location, '') AS Delivery_Location,
        ISNULL(sgi.Delivery_Latitude, 0) AS Delivery_Latitude,
        ISNULL(sgi.Delivery_Longitude, 0) AS Delivery_Longitude,
        ISNULL(sgi.Collected_By, '') AS Collected_By,
        ISNULL(sgi.Collected_Status, '') AS Collected_Status,
        sgi.Payment_Status
    FROM TRIP_DETAILS AS td
    LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = td.Delivery_Person_Id
    LEFT JOIN tbl_Users us ON us.UserId = ecc.User_Id  
    LEFT JOIN tbl_Sales_Delivery_Gen_Info sgi ON sgi.Do_Id = td.Delivery_Id  
    WHERE td.Trip_Id = tm.Trip_Id
    FOR JSON PATH
), '[]') AS Trip_Details,

    COALESCE((  
        SELECT
            sgi.Do_Id,
            sgi.So_No,
            rm.Retailer_Name,
            sgi.Do_Date AS Product_Do_Date, 

            (SELECT
                sdsi.*,
                pm.Product_Name,
                pm.Product_Image_Name,
                tm.BranchName AS Branch,  
                rm2.Retailer_Name,  
                rm2.Latitude,
                rm2.Longitude
            FROM tbl_Sales_Delivery_Stock_Info AS sdsi
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = sdsi.Item_Id
            LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sgi2 ON sgi2.Do_Id = sdsi.Delivery_Order_Id
            LEFT JOIN tbl_Retailers_Master AS rm2 ON rm2.Retailer_Id = sgi2.Retailer_Id
            WHERE sdsi.Delivery_Order_Id = sgi.Do_Id
            FOR JSON PATH
            ) AS Products_List
        FROM tbl_Sales_Delivery_Gen_Info AS sgi
        LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sgi.Retailer_Id
        WHERE sgi.Do_Id IN (SELECT td.Delivery_Id FROM TRIP_DETAILS td WHERE td.Trip_Id = tm.Trip_Id)
        FOR JSON PATH
    ), '[]') AS Product_Array,

    COALESCE((  
        SELECT
            te.Involved_Emp_Id,
            te.Emp_Name,
            te.Cost_Category,
            te.Cost_Category_Id AS Cost_Center_Type_Id
        FROM TRIP_EMPLOYEES AS te
        WHERE te.Trip_Id = tm.Trip_Id
        FOR JSON PATH
    ), '[]') AS Employees_Involved
FROM TRIP_MASTER AS tm


               ` );

            if (result.recordset && Array.isArray(result.recordset) && result.recordset.length > 0) {

                const parsed = result.recordset.map(o => ({
                    ...o,
                    Product_Array: o?.Product_Array ? JSON.parse(o.Product_Array) : [],
                    Trip_Details: o?.Trip_Details ? JSON.parse(o?.Trip_Details) : [],
                    Employees_Involved: o?.Employees_Involved ? JSON.parse(o.Employees_Involved) : []
                }));

                dataFound(res, parsed);
            } else {
                noData(res);
            }

        } catch (e) {

            servError(e, res);
        }


    }

    const updateDeliveryOrderTrip = async (req, res) => {
        const {
            Vehicle_No,
            Trip_No = '',
            Trip_ST_KM = 0,
            Trip_EN_KM = 0,
            Updated_By = '',
            StartTime,
            EndTime,
            Created_By,
            GST_Inclusive = 1,
            IS_IGST = 0,
            Delivery_Person_Id,
            Delivery_Location,
            Product_Array = [],
            EmployeesInvolved = [],
            VoucherType,
            BillType
        } = req.body;

        var Branch_Id = req.body.Branch_Id;
        var Trip_Id = req.body.Trip_Id;
        const Do_Date = ISOString(req?.body?.Do_Date);
        var Trip_Date = req.body.Trip_Date;
        var Alter_Id = req.body.Alter_Id;

        if (!Trip_ST_KM || !StartTime || !Do_Date || !Branch_Id || !Array.isArray(Product_Array) || Product_Array.length === 0 || !Delivery_Person_Id) {
            return invalidInput(res, 'Please Select Required Fields');
        }

        const transaction = new sql.Transaction();

        try {
            const tripCheck = await new sql.Request()
                .input('Trip_Id', Trip_Id)
                .query(`SELECT COUNT(*) AS TripCount FROM tbl_Trip_Master WHERE Trip_Id = @Trip_Id`);

            if (tripCheck.recordset[0].TripCount === 0) {
                return invalidInput(res, 'Trip does not exist');
            }

            const Trip_Tot_Kms = Subraction(Trip_EN_KM, Trip_ST_KM);

            await transaction.begin();

            try {
                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Branch_Id', Branch_Id)
                    .input('Trip_Date', Trip_Date)
                    .input('Vehicle_No', Vehicle_No)
                    .input('StartTime', StartTime)
                    .input('EndTime', EndTime)
                    .input('VoucherType', VoucherType)
                    .input('BillType', BillType)
                    .input('Trip_No', Trip_No)
                    .input('Trip_ST_KM', Number(Trip_ST_KM))
                    .input('Trip_EN_KM', Number(Trip_EN_KM))
                    .input('Trip_Tot_Kms', Trip_Tot_Kms)
                    .input('Updated_By', Updated_By)
                    .query(`
                    UPDATE tbl_Trip_Master
                    SET Branch_Id = @Branch_Id, Trip_Date = @Trip_Date, Vehicle_No = @Vehicle_No,
                        StartTime = @StartTime, EndTime = @EndTime,VoucherType=@VoucherType, BillType=@BillType,Trip_No = @Trip_No,
                        Trip_ST_KM = @Trip_ST_KM, Trip_EN_KM = @Trip_EN_KM, Trip_Tot_Kms = @Trip_Tot_Kms,
                        Updated_By = @Updated_By
                    WHERE Trip_Id = @Trip_Id
                `);
            } catch (error) {
                console.error("Error updating Trip Master:", error);
                throw error;
            }

            try {

                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .query(`DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id`);
            } catch (error) {
                console.error("Error deleting related records:", error);
                throw error;
            }
            try {

                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .query(`DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id`);
            } catch (error) {
                console.error("Error deleting related records:", error);
                throw error;
            }
            for (const product of Product_Array) {
                var DeliveryId = product?.Do_Id;

                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Delivery_Id', DeliveryId)
                    .query(`
                        INSERT INTO tbl_Trip_Details (Trip_Id, Delivery_Id)
                        VALUES (@Trip_Id, @Delivery_Id);
                    `);

                if (EmployeesInvolved.length > 0) {
                    const FirstEmployeeId = EmployeesInvolved[0].Involved_Emp_Id;

                    await new sql.Request(transaction)
                        .input('DeliveryId', DeliveryId)
                        .input('Delivery_Person_Id', FirstEmployeeId)
                        .query(`
                            UPDATE tbl_Sales_Delivery_Gen_Info
                            SET Delivery_Person_Id = @Delivery_Person_Id
                            WHERE Do_Id = @DeliveryId;
                        `);
                }
            }



            for (const employee of EmployeesInvolved) {
                try {
                    await new sql.Request(transaction)
                        .input('Trip_Id', Trip_Id)
                        .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                        .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                        .query(`
                        INSERT INTO tbl_Trip_Employees (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                        VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                    `);



                } catch (error) {
                    console.error(`Error inserting employee involvement for EmployeeId: ${employee.Involved_Emp_Id}`, error);
                    throw error;
                }
            }

            await transaction.commit();
            success(res, 'Trip Updated Successfully!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            console.error(e);
            return servError(e, res);
        }
    };

    const salesMultipleDelivery = async (req, res) => {

        const {
            DeliveryList = [],
            EmployeesInvolved = [],
            Branch_Id,

            Created_by,
            GST_Inclusive = 1
        } = req.body;



        const Do_Date = ISOString(req?.body?.Do_Date);
        const GoDown_Id = req?.body?.GoDown_Id;
        const Trip_Date = req.body.Trip_Date;


        const transaction = new sql.Transaction();

        try {

            if (!Do_Date || !GoDown_Id) {
                return invalidInput(res, 'Please Select Required Fields');
            }
            await transaction.begin();



            const yearData = await new sql.Request(transaction).query(
                "SELECT Year_Desc, Id FROM tbl_Year_Master WHERE Active_Status IN ('Yes', 'YES')"
            );
            const branchData = await new sql.Request(transaction)
                .input('Branch_Id', sql.Int, Branch_Id)
                .query("SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @Branch_Id");
            const voucherData = await new sql.Request(transaction)
                .query("SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = 0");

            if (!yearData.recordset[0] || !branchData.recordset[0] || !voucherData.recordset[0]) {
                throw new Error('Failed to fetch required master data');
            }

            const Do_Year_Desc = yearData.recordset[0].Year_Desc;
            const Year_Master_Id = yearData.recordset[0].Id;
            const BranchCode = branchData.recordset[0].BranchCode;
            const VoucherCode = voucherData.recordset[0].Voucher_Code;


            const FinancialYear = `${Do_Year_Desc}`;
            const createdDeliveryIds = [];

            for (const [i, product] of DeliveryList.entries()) {
                if (!product || typeof product !== 'object') {
                    console.warn(`Skipping invalid product at index ${i}`);
                    continue;
                }
                const getDoIdResult = await new sql.Request(transaction).query(`
                 
                    SELECT COALESCE(MAX(Do_Id), 0) + 1 AS MaxId
               FROM tbl_Sales_Delivery_Gen_Info 
           `);


                const currentMaxId = (getDoIdResult.recordset[0]?.MaxId || 1);
                let Do_Id = currentMaxId;
                const Alter_Id = product?.Alter_Id || Math.floor(Math.random() * 999999);


                const doNoResult = await new sql.Request(transaction)
                    .input('Branch_Id', sql.Int, Branch_Id)
                    .input('Do_Year', sql.Int, Year_Master_Id)
                    .input('Voucher_Type', sql.Int, 0)
                    .query(`
                        SELECT COALESCE(MAX(Do_No), 0) + 1 AS Do_No
                        FROM tbl_Sales_Delivery_Gen_Info
                        WHERE Branch_Id = @Branch_Id 
                        AND Do_Year = @Do_Year 
                        AND Voucher_Type = @Voucher_Type
                    `);

                const Do_Branch_Inv_Id = doNoResult.recordset[0]?.Do_No;
                if (!checkIsNumber(Do_Branch_Inv_Id)) {
                    throw new Error(`Invalid Do_No received for delivery ${i + 1}`);
                }

                const Do_Inv_No = `${VoucherCode}/${createPadString(Do_Branch_Inv_Id, 6)}/${FinancialYear}`;

                const genInfoRequest = new sql.Request(transaction);
                genInfoRequest.input('Do_Id', sql.Int, Do_Id);
                genInfoRequest.input('Do_No', sql.Int, Do_Branch_Inv_Id);
                genInfoRequest.input('Do_Year', sql.Int, Year_Master_Id);
                genInfoRequest.input('Do_Inv_No', sql.NVarChar(100), Do_Inv_No);
                genInfoRequest.input('Voucher_Type', sql.Int, 0);
                genInfoRequest.input('Do_Date', sql.DateTime, new Date(Do_Date));
                genInfoRequest.input('Retailer_Id', sql.Int, product?.Retailer_Id || null);
                genInfoRequest.input('Delivery_Person_Id', sql.Int, 0);
                genInfoRequest.input('Branch_Id', sql.Int, Branch_Id);
                genInfoRequest.input('GST_Inclusive', sql.Int, GST_Inclusive);
                genInfoRequest.input('CSGT_Total', sql.Decimal(18, 2), product?.CSGT_Total || 0);
                genInfoRequest.input('SGST_Total', sql.Decimal(18, 2), product?.SGST_Total || 0);
                genInfoRequest.input('IGST_Total', sql.Decimal(18, 2), product?.IGST_Total || 0);
                genInfoRequest.input('Round_off', sql.Decimal(18, 2), product?.Round_off || 0);
                genInfoRequest.input('Total_Before_Tax', sql.Decimal(18, 2), product?.Total_Before_Tax || 0);
                genInfoRequest.input('Total_Tax', sql.Decimal(18, 2), product?.Total_Tax || 0);
                genInfoRequest.input('Total_Invoice_value', sql.Decimal(18, 2), product?.Total_Invoice_value || 0);
                genInfoRequest.input('Cancel_status', sql.Int, 0);
                genInfoRequest.input('So_No', sql.Int, product?.So_Id || null);
                genInfoRequest.input('Delivery_Status', sql.Int, 1);
                genInfoRequest.input('Delivery_Location', sql.NVarChar, null);
                genInfoRequest.input('Payment_Status', sql.Int, 1);
                genInfoRequest.input('Alter_Id', sql.BigInt, Alter_Id);
                genInfoRequest.input('Created_by', Created_by);
                genInfoRequest.input('Created_on', sql.DateTime, new Date());
                genInfoRequest.input('Trans_Type', sql.NVarChar(50), 'INSERT');

                await genInfoRequest.query(`
                    INSERT INTO tbl_Sales_Delivery_Gen_Info (
                        Do_Id, Do_No, Do_Year, Do_Inv_No, Voucher_Type, Do_Date, 
                        Retailer_Id, Delivery_Person_Id, Branch_Id, GST_Inclusive, 
                        CSGT_Total, SGST_Total, IGST_Total, Round_off, Total_Before_Tax, 
                        Total_Tax, Total_Invoice_value, Cancel_status, So_No, 
                        Delivery_Status, Delivery_Location, Payment_Status, Alter_Id, 
                        Created_by, Created_on, Trans_Type
                    ) VALUES (
                        @Do_Id, @Do_No, @Do_Year, @Do_Inv_No, @Voucher_Type, @Do_Date, 
                        @Retailer_Id, @Delivery_Person_Id, @Branch_Id, @GST_Inclusive, 
                        @CSGT_Total, @SGST_Total, @IGST_Total, @Round_off, @Total_Before_Tax, 
                        @Total_Tax, @Total_Invoice_value, @Cancel_status, @So_No, 
                        @Delivery_Status, @Delivery_Location, @Payment_Status, @Alter_Id, 
                        @Created_by, @Created_on, @Trans_Type
                    )
                `);

                createdDeliveryIds.push(Do_Id);


                if (product?.So_Id) {

                    await new sql.Request(transaction)
                        .input('So_Id', sql.Int, product.So_Id)
                        .query("UPDATE tbl_Sales_Order_Gen_Info SET isConverted = 2 WHERE So_Id = @So_Id");
                }


                if (product.Products_List && Array.isArray(product.Products_List)) {

                    for (const [j, subProduct] of product.Products_List.entries()) {
                        if (!subProduct || typeof subProduct !== 'object') {
                            console.warn(`Skipping invalid subProduct at index ${j} in delivery ${i}`);
                            continue;
                        }


                        const stockRequest = new sql.Request(transaction);
                        stockRequest.input('Do_Date', sql.DateTime, new Date(Do_Date));
                        stockRequest.input('Delivery_Order_Id', sql.Int, Do_Id);
                        stockRequest.input('S_No', sql.Int, j + 1);
                        stockRequest.input('Item_Id', sql.Int, subProduct.Item_Id || 0);
                        stockRequest.input('GoDown_Id', sql.Int, Number(GoDown_Id) || 0);
                        stockRequest.input('Bill_Qty', sql.Decimal(18, 2), subProduct?.Bill_Qty || 0);
                        stockRequest.input('Item_Rate', sql.Decimal(18, 2), subProduct?.Item_Rate || 0);
                        stockRequest.input('Amount', sql.Decimal(18, 2), subProduct?.Amount || 0);
                        stockRequest.input('Free_Qty', sql.Decimal(18, 2), 0);
                        stockRequest.input('Total_Qty', sql.Decimal(18, 2), subProduct?.Bill_Qty || 0);
                        stockRequest.input('Taxble', sql.Bit, subProduct?.Taxble ? 1 : 0);
                        stockRequest.input('Taxable_Rate', sql.Decimal(18, 2), subProduct?.Taxable_Rate || 0);
                        stockRequest.input('HSN_Code', sql.NVarChar(50), subProduct?.HSN_Code || '');
                        stockRequest.input('Unit_Id', sql.Int, subProduct.Unit_Id || 0);
                        stockRequest.input('Unit_Name', sql.NVarChar(50), subProduct?.UOM || '');
                        stockRequest.input('Taxable_Amount', sql.Decimal(18, 2), subProduct?.Taxable_Amount || 0);
                        stockRequest.input('Tax_Rate', sql.Decimal(18, 2), subProduct?.gstPercentage || 0);
                        stockRequest.input('Cgst', sql.Decimal(18, 2), subProduct?.Cgst || 0);
                        stockRequest.input('Cgst_Amo', sql.Decimal(18, 2), subProduct?.Cgst_Amo || 0);
                        stockRequest.input('Sgst', sql.Decimal(18, 2), (subProduct?.Sgst || 0) / 2);
                        stockRequest.input('Sgst_Amo', sql.Decimal(18, 2), subProduct?.Sgst_Amo || 0);
                        stockRequest.input('Igst', sql.Decimal(18, 2), subProduct?.Igst || 0);
                        stockRequest.input('Igst_Amo', sql.Decimal(18, 2), subProduct?.Igst_Amo || 0);
                        stockRequest.input('Final_Amo', sql.Decimal(18, 2), subProduct?.Final_Amo || 0);
                        stockRequest.input('Created_on', sql.DateTime, new Date());


                        await stockRequest.query(`
                            INSERT INTO tbl_Sales_Delivery_Stock_Info (
                                Do_Date, Delivery_Order_Id, S_No, Item_Id,GoDown_Id, Bill_Qty, Item_Rate, 
                                Amount, Free_Qty, Total_Qty, Taxble, Taxable_Rate, HSN_Code, 
                                Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, 
                                Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                            ) VALUES (
                                @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id,@GoDown_Id, @Bill_Qty, @Item_Rate, 
                                @Amount, @Free_Qty, @Total_Qty, @Taxble, @Taxable_Rate, @HSN_Code, 
                                @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, 
                                @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                            )
                        `);
                    }
                }
            }


            await transaction.commit();
            success(res, 'Delivery Created!')

        } catch (error) {

            if (transaction._aborted === false) {

                try {

                    await transaction.rollback();
                    servError('Transaction rolled back successfully');

                } catch (rollbackError) {

                    servError(rollbackError, res);
                }
            }


        }
    };

    const getDeliveryDetails = async (req, res) => {
        const { Sales_Person_Id } = req.query;

        const Fromdate = ISOString(req.query.Fromdate), Todate = ISOString(req.query.Todate);

        try {
            let query = `
                WITH DELIVERY_DETAILS AS (
                    SELECT
                        oi.*,
                        pm.Product_Id,
                        COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                        COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                        COALESCE(u.Units, 'not available') AS UOM,
                        COALESCE(b.Brand_Name, 'not available') AS BrandGet
                    FROM tbl_Sales_Delivery_Stock_Info AS oi
                    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                    LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                    LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
                     WHERE
                        CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
                        AND
                        CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
                )
                SELECT 
                    sdgi.*,
                    COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                    COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    COALESCE(rmt.Route_Name, 'Unknown') AS RouteName,
                    COALESCE(am.Area_Name, 'Unknown') AS AreaName,
                    COALESCE(sdgi.Total_Invoice_Value, 0) AS Total_Invoice_Value,
                    COALESCE((
                        SELECT 
                            sd.*,
                            COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name
                        FROM DELIVERY_DETAILS AS sd
                        WHERE sd.Delivery_Order_Id = sdgi.Do_Id
                        FOR JSON PATH
                    ), '[]') AS Products_List
                FROM 
                    tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sdgi.So_No -- Ensure the join is here
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sdgi.Retailer_Id
                LEFT JOIN tbl_Users AS sp ON sp.UserId = sogi.Sales_Person_Id 
                LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = sdgi.Branch_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
                LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
                LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
                WHERE 
                    CONVERT(DATE, sdgi.Do_Date) >= CONVERT(DATE, @from)
                    AND
                    CONVERT(DATE, sdgi.Do_Date) <= CONVERT(DATE, @to)`;

            if (checkIsNumber(Sales_Person_Id)) {
                query += `AND sogi.Sales_Person_Id = @salesPerson`
            }


            query += `ORDER BY CONVERT(DATETIME, sdgi.Do_Id) DESC`;

            const request = new sql.Request();
            request.input('from', Fromdate);
            request.input('to', Todate);
            request.input('salesPerson', Sales_Person_Id)

            const result = await request.query(query);

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
    };

    const getDeliveryDetailsListing = async (req, res) => {
        const { Sales_Person_Id } = req.query;

        const Fromdate = ISOString(req.query.Fromdate), Todate = ISOString(req.query.Todate);

        try {
            let query = `
            WITH DELIVERY_DETAILS AS (
                SELECT
                    oi.*,
                    pm.Product_Id,
                    COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                    COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                    COALESCE(u.Units, 'not available') AS UOM,
                    COALESCE(b.Brand_Name, 'not available') AS BrandGet
                FROM tbl_Sales_Delivery_Stock_Info AS oi
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
                WHERE
                    CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
                    AND
                    CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
            )
            SELECT 
                sdgi.*,
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(rmt.Route_Name, 'Unknown') AS RouteName,
                COALESCE(am.Area_Name, 'Unknown') AS AreaName,
                COALESCE(sdgi.Total_Invoice_Value, 0) AS Total_Invoice_Value,
                COALESCE((
                    SELECT 
                        sd.*,
                        COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name
                    FROM DELIVERY_DETAILS AS sd
                    WHERE sd.Delivery_Order_Id = sdgi.Do_Id
                    FOR JSON PATH
                ), '[]') AS Products_List
            FROM 
                tbl_Sales_Delivery_Gen_Info AS sdgi
            LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sdgi.So_No 
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sdgi.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = sogi.Sales_Person_Id 
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = sdgi.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
            LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
            LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
            WHERE 
                CONVERT(DATE, sdgi.Do_Date) >= CONVERT(DATE, @from)
                AND
                CONVERT(DATE, sdgi.Do_Date) <= CONVERT(DATE, @to)
                AND NOT EXISTS (
                    SELECT 1 FROM tbl_Trip_Details td WHERE td.Delivery_Id = sdgi.Do_Id
                )`;



            if (checkIsNumber(Sales_Person_Id)) {
                query += `
                                AND
                                sogi.Sales_Person_Id = @salesPerson`
            }


            query += `
            ORDER BY CONVERT(DATETIME, sdgi.Do_Id) DESC`;

            const request = new sql.Request();
            request.input('from', Fromdate);
            request.input('to', Todate);
            request.input('salesPerson', Sales_Person_Id)


            const result = await request.query(query);

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
    };

    const tripDetails = async (req, res) => {
        const { Trip_Id } = req.body;

        if (!Trip_Id) {
            return invalidInput(res, 'Invalid Trip_Id');
        }

        try {
            const request = new sql.Request();
            request.input('Trip_Id', sql.Int, Trip_Id);

            const deliveryIdsResult = await request.query(`
                SELECT Delivery_Id FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id
            `);

            const deliveryIds = deliveryIdsResult.recordset.map(row => row.Delivery_Id);

            if (deliveryIds.length === 0) {
                return noData(res, 'No Delivery Orders found for the given Trip_Id.');
            }

            await request.query(`
                DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id
            `);

            await request.query(`
                DELETE FROM tbl_Trip_Master WHERE Trip_Id = @Trip_Id
            `);
            await request.query(`
                DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id
            `);
            success(res, 'Trip deleted successfully.');
        } catch (e) {
            servError(e, res);
        }
    };

    const getClosingStock = async (req, res) => {
        const { fromDate, toDate, godownId } = req.query;

        try {
            const request = new sql.Request();

            const fromDateObj = new Date(fromDate);
            const previousDate = new Date(fromDateObj);
            previousDate.setDate(previousDate.getDate() - 1);

            request.input('Previous_Date', sql.Date, ISOString(previousDate));
            request.input('fromDate', sql.Date, ISOString(fromDate));
            request.input('toDate', sql.Date, ISOString(toDate));

            let query = '';

            if (!godownId || godownId.trim() === '') {
                query = `
                    SELECT 
                        pm.Product_Group,
                        pg.Pro_Group,
                        (
                            SELECT 
                                s.Product_Id,
                                MAX(pm2.Product_Name) AS Product_Name,
                                SUM(s.OP_Qty) AS OpeningStock,
                                SUM(s.Arrival_Qty) AS Total_Arrival,
                                SUM(s.Deliverd_Qty) AS Total_Delivery,
                                SUM(s.CL_Qty) AS ClosingStock
                            FROM 
                                [dbo].[Stock_Purchase_Sales_GD_Fn_2](@Previous_Date, @fromDate, @toDate) s
                            LEFT JOIN tbl_Product_Master pm2 ON s.Product_Id = pm2.Product_Id
                            WHERE 
                                s.CL_Qty != 0 AND pm2.Product_Group = pm.Product_Group
                            GROUP BY s.Product_Id
                            FOR JSON PATH
                        ) AS Products
                    FROM 
                        tbl_Product_Master pm
                    LEFT JOIN tbl_Product_Group pg ON pg.Pro_Group_Id = pm.Product_Group
                    WHERE EXISTS (
                        SELECT 1 
                        FROM [dbo].[Stock_Purchase_Sales_GD_Fn_2](@Previous_Date, @fromDate, @toDate) s
                        WHERE s.Product_Id = pm.Product_Id AND s.CL_Qty != 0
                    )
                    GROUP BY pm.Product_Group, pg.Pro_Group
                    ORDER BY pm.Product_Group;
                `;
            } else {

                query = `
                SELECT 
                    pm.Product_Group,
                    pg.Pro_Group,
                    (
                        SELECT 
                            s.Product_Id,
                            MAX(pm2.Product_Name) AS Product_Name,
                            SUM(s.OP_Qty) AS OpeningStock,
                            SUM(s.Arrival_Qty) AS Total_Arrival,
                            SUM(s.Deliverd_Qty) AS Total_Delivery,
                            SUM(s.CL_Qty) AS ClosingStock
                        FROM 
                            [dbo].[Stock_Purchase_Sales_GD_Fn_2](@Previous_Date, @fromDate, @toDate) s
                        LEFT JOIN tbl_Product_Master pm2 ON s.Product_Id = pm2.Product_Id
                        WHERE 
                            s.CL_Qty != 0 
                            AND s.GoDown_Id = @godown_Id
                            AND pm2.Product_Group = pm.Product_Group
                        GROUP BY s.Product_Id
                        FOR JSON PATH
                    ) AS Products
                FROM 
                    tbl_Product_Master pm
                LEFT JOIN tbl_Product_Group pg ON pg.Pro_Group_Id = pm.Product_Group
                WHERE EXISTS (
                    SELECT 1 
                    FROM [dbo].[Stock_Purchase_Sales_GD_Fn_2](@Previous_Date, @fromDate, @toDate) s
                    WHERE 
                        s.Product_Id = pm.Product_Id 
                        AND s.CL_Qty != 0 
                        AND s.GoDown_Id = @godown_Id
                )
                GROUP BY pm.Product_Group, pg.Pro_Group
                ORDER BY pm.Product_Group;
            `;

                request.input('godown_Id', sql.Int, parseInt(godownId));
            }

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(obj => ({
                    ...obj,
                    Products: JSON.parse(obj.Products),

                }));

                dataFound(res, parseData)
            } else {
                noData(res)
            }
        } catch (error) {
            servError(error, res);
        }
    };


    return {
        salesDeliveryCreation,
        getSaleOrder,
        editDeliveryOrder,
        getDeliveryorder,
        deleteDeliveryOrder,
        editmobileApi,
        deliveryOrderTrip,
        deliveryTripsheetList,
        updateDeliveryOrderTrip,
        salesMultipleDelivery,
        getDeliveryDetails,
        getDeliveryDetailsListing,
        tripDetails,
        getClosingStock
    }
}


export default DeliveryOrder();