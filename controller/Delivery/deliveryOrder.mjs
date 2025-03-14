import sql from 'mssql'
import { dataFound, invalidInput, noData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, Multiplication, RoundNumber, createPadString } from '../../helper_functions.mjs'
import getImage from '../../middleware/getImageIfExist.mjs';
import { getProducts, getNextId } from '../../middleware/miniAPIs.mjs';


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

        if (!Do_Date || !Retailer_Id || !Delivery_Person_Id || !Created_by || !Array.isArray(Product_Array) || Product_Array.length === 0) {
            return invalidInput(res, 'Please select Delivery Person')
        }


        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const requestForSoNoCheck = new sql.Request(transaction);
            requestForSoNoCheck.input('So_No', sql.Int, So_No);
            const resultForSoNoCheck = await requestForSoNoCheck.query(`
            SELECT COUNT(*) AS count
            FROM tbl_Sales_Delivery_Gen_Info
            WHERE So_No = @So_No
        `);

            if (resultForSoNoCheck.recordset[0].count > 0) {
                const queryUpdate = new sql.Request(transaction);
                queryUpdate.input('So_No', sql.Int, So_No);
                await queryUpdate.query(`
                UPDATE tbl_Sales_Delivery_Gen_Info
                SET Cancel_Status = 2
                WHERE So_No = @So_No
            `);

                await transaction.commit();
                return success(res, 'Order Moved to Sales Delivery to Sale Order.');
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);
            const Do_Year = new Date().getFullYear();

            const Do_No = Number((await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .input('Do_Year', Do_Year)
                .query(`
                    SELECT
                        COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM
                        tbl_Sales_Delivery_Gen_Info
                    WHERE
                        Branch_Id = @Branch_Id
                        AND
                        Do_Year = @Do_Year`
                ))?.recordset[0]?.Do_No) + 1;

            if (!checkIsNumber(Do_No)) throw new Error('Failed to get Order Id');

            const Do_Inv_No = 'DO_' + Branch_Id + '_' + Do_Year + '_' + createPadString(Do_No, 4);

            const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });

            if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');

            const Do_Id = getDo_Id.MaxId;

            const Total_Invoice_value = Product_Array.reduce((o, item) => {
                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = parseInt(item?.Bill_Qty);
                const Amount = RoundNumber(Multiplication(billQty, itemRate));

                if (isInclusive || isNotTaxableBill) {
                    return o += Number(Amount);
                }

                if (isExclusiveBill) {
                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;
                    const tax = taxCalc(0, itemRate, gstPercentage)
                    return o += (Amount + (tax * billQty));
                }
            }, 0);

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = parseInt(item?.Bill_Qty) || 0;

                if (isNotTaxableBill) {
                    acc.TotalValue += Multiplication(billQty, itemRate);
                    return acc;
                }

                const product = findProductDetails(productsData, item.Item_Id);
                const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;

                if (isInclusive) {
                    const itemTax = taxCalc(1, itemRate, gstPercentage);
                    const basePrice = Subraction(itemRate, itemTax);
                    acc.TotalTax += Multiplication(billQty, itemTax);
                    acc.TotalValue += Multiplication(billQty, basePrice);
                }
                if (isExclusiveBill) {
                    const itemTax = taxCalc(0, itemRate, gstPercentage);
                    acc.TotalTax += Multiplication(billQty, itemTax);
                    acc.TotalValue += Multiplication(billQty, itemRate);
                }

                return acc;
            }, {
                TotalValue: 0,
                TotalTax: 0
            });

            // await transaction.begin();

            const request = new sql.Request(transaction);
            request.input('Do_Id', Do_Id);
            request.input('Do_No', Do_No);
            request.input('Do_Year', Do_Year);
            request.input('Voucher_Type', VoucherType)
            request.input('Do_Inv_No', Do_Inv_No)
            request.input('Do_Date', sql.Date, Do_Date);
            request.input('Retailer_Id', sql.Int, Retailer_Id);
            request.input('Delivery_Person_Id', sql.Int, Number(Delivery_Person_Id));
            request.input('Branch_Id', sql.Int, Branch_Id);
            request.input('GST_Inclusive', sql.Int, GST_Inclusive);
            request.input('CSGT_Total', IS_IGST ? 0 : totalValueBeforeTax.TotalTax / 2);
            request.input('SGST_Total', IS_IGST ? 0 : totalValueBeforeTax.TotalTax / 2);
            request.input('IGST_Total', IS_IGST ? totalValueBeforeTax.TotalTax : 0);
            request.input('Round_off', Total_Invoice_value - (totalValueBeforeTax.TotalValue + totalValueBeforeTax.TotalTax));
            request.input('Total_Before_Tax', totalValueBeforeTax.TotalValue);
            request.input('Total_Tax', totalValueBeforeTax.TotalTax);
            request.input('Total_Invoice_value', Total_Invoice_value);
            request.input('Narration', Narration);
            request.input('Cancel_status', 2);
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



            const DeliveryId = result.recordset && result.recordset.length > 0 ? result.recordset[0].Do_Id : null;


            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id)

                const gstPercentage = isEqualNumber(IS_IGST, 1) ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Bill_Qty * Item_Rate;
                const tax = taxCalc(GST_Inclusive, Amount, gstPercentage);
                const itemTaxRate = taxCalc(GST_Inclusive, Item_Rate, gstPercentage);
                const Taxable_Rate = RoundNumber(Subraction(Item_Rate, itemTaxRate));

                const Taxable_Amount = isInclusive ? (Amount - tax) : Amount;
                const Final_Amo = isInclusive ? Amount : (Amount + tax);

                const Cgst_Amo = !isIGST ? (taxCalc(GST_Inclusive, Amount, gstPercentage) / 2) : 0;
                const Igst_Amo = isIGST ? taxCalc(GST_Inclusive, Amount, gstPercentage) : 0;

                const request2 = new sql.Request(transaction)
                    .input('Do_Date', Do_Date)
                    .input('DeliveryOrder', Do_Id)
                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', Taxable_Rate)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('Unit_Id', product.UOM ?? '')
                    .input('Unit_Name', product.Units ?? '')
                    .input('Taxable_Amount', Taxable_Amount)
                    .input('Tax_Rate', gstPercentage)
                    .input('Cgst', (gstPercentage / 2) ?? 0)
                    .input('Cgst_Amo', isNotTaxableBill ? 0 : Cgst_Amo)
                    .input('Sgst', (gstPercentage / 2) ?? 0)
                    .input('Sgst_Amo', isNotTaxableBill ? 0 : Cgst_Amo)
                    .input('Igst', gstPercentage ?? 0)
                    .input('Igst_Amo', isNotTaxableBill ? 0 : Igst_Amo)
                    .input('Final_Amo', Final_Amo)
                    .input('Created_on', new Date())

                    .query(`
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @DeliveryOrder, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty,
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
        const {
            Do_Id, Retailer_Id, Delivery_Person_Id, Branch_Id,
            Narration, Created_by, Product_Array, GST_Inclusive = 1, IS_IGST = 0, Delivery_Status,
            Delivery_Time, Delivery_Location, Delivery_Latitude, Delivery_Longitude, Collected_By, Collected_Status, Payment_Mode, Payment_Status, Payment_Ref_No
        } = req.body;

        const Do_Date = ISOString(req?.body?.Do_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);

        if (
            !checkIsNumber(Do_Id)
            || !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Delivery_Person_Id)
            || !checkIsNumber(Created_by)
            || (!Array.isArray(Product_Array) || Product_Array.length === 0)
        ) {
            return invalidInput(res, 'Do_Id, Retailer_Id, Delivery_Person_Id, Created_by, Product_Array is Required')
        }

        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            const Total_Invoice_value = Product_Array.reduce((o, item) => {
                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = parseInt(item?.Bill_Qty);
                const Amount = RoundNumber(Multiplication(billQty, itemRate));

                if (isInclusive || isNotTaxableBill) {
                    return o += Number(Amount);
                }

                if (isExclusiveBill) {
                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;
                    const tax = taxCalc(0, itemRate, gstPercentage)
                    return o += (Number(Amount) + (tax * billQty));
                }
            }, 0);

            const totalValueBeforeTax = Product_Array.reduce((acc, item) => {
                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = parseInt(item?.Bill_Qty) || 0;

                if (isNotTaxableBill) {
                    acc.TotalValue += Multiplication(billQty, itemRate);
                    return acc;
                }

                const product = findProductDetails(productsData, item.Item_Id);
                const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                if (isInclusive) {
                    const itemTax = taxCalc(1, itemRate, gstPercentage);
                    const basePrice = Subraction(itemRate, itemTax);
                    acc.TotalTax += Multiplication(billQty, itemTax);
                    acc.TotalValue += Multiplication(billQty, basePrice);
                }
                if (isExclusiveBill) {
                    const itemTax = taxCalc(0, itemRate, gstPercentage);
                    acc.TotalTax += Multiplication(billQty, itemTax);
                    acc.TotalValue += Multiplication(billQty, itemRate);
                }

                return acc;
            }, {
                TotalValue: 0,
                TotalTax: 0
            });

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('doid', Do_Id)
                .input('date', Do_Date)
                .input('retailer', Retailer_Id)
                .input('deliveryperson', Delivery_Person_Id)
                .input('branch', Branch_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('roundoff', Total_Invoice_value - (totalValueBeforeTax.TotalValue + totalValueBeforeTax.TotalTax))
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
                        Delivery_Person_Id = @deliveryperson,
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
                const Amount = Bill_Qty * Item_Rate;
                const tax = taxCalc(GST_Inclusive, Amount, gstPercentage);
                const itemTaxRate = taxCalc(GST_Inclusive, Item_Rate, gstPercentage);
                const Taxable_Rate = RoundNumber(Subraction(Item_Rate, itemTaxRate));

                const Taxable_Amount = isInclusive ? (Amount - tax) : Amount;
                const Final_Amo = isInclusive ? Amount : (Amount + tax);

                const Cgst = isNotTaxableBill ? 0 : !isIGST ? productDetails.Cgst_P : 0;
                const Igst = isIGST ? productDetails.Igst_P : 0
                const Cgst_Amo = !isIGST ? (taxCalc(GST_Inclusive, Amount, gstPercentage) / 2) : 0;
                const Igst_Amo = isIGST ? taxCalc(GST_Inclusive, Amount, gstPercentage) : 0;

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
                    .input('Taxable_Rate', Taxable_Rate)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('Unit_Id', product.UOM ?? '')
                    .input('Unit_Name', product.Units ?? '')
                    .input('Taxable_Amount', Taxable_Amount)
                    .input('Tax_Rate', gstPercentage)
                    .input('Cgst', (gstPercentage / 2) ?? 0)
                    .input('Cgst_Amo', isNotTaxableBill ? 0 : Cgst_Amo)
                    .input('Sgst', (gstPercentage / 2) ?? 0)
                    .input('Sgst_Amo', isNotTaxableBill ? 0 : Cgst_Amo)
                    .input('Igst', gstPercentage ?? 0)
                    .input('Igst_Amo', isNotTaxableBill ? 0 : Igst_Amo)
                    .input('Final_Amo', Final_Amo)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty,
                            Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty,
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

        // Convert dates to ISO format
        const Fromdate = new Date(req.query.Fromdate).toISOString();
        const Todate = new Date(req.query.Todate).toISOString();

        try {
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
            const request = new sql.Request()
                .input('Order_No', sql.Int, Order_Id)
                .input('Do_Id', sql.Int, Do_Id);


            const deleteDeliveryResult = await request.query(`
                DELETE FROM tbl_Sales_Delivery_Gen_Info
                WHERE Do_Id = @Do_Id;
            `);

            if (deleteDeliveryResult.rowsAffected[0] > 0) {

                const deleteStockInfoResult = await request.query(`
                    DELETE FROM tbl_Sales_Delivery_Stock_Info
                    WHERE Delivery_Order_Id = @Do_Id;
                `);

                if (deleteStockInfoResult.rowsAffected[0] > 0) {
                    success(res, 'Sales Order and Delivery Order deleted successfully.');
                } else {
                    noData(res, 'Failed to delete the Sales Order from tbl_Sales_Delivery_Stock_Info.');
                }
            } else {

                return failed(res, 'Failed to delete the Delivery Order from tbl_Sales_Delivery_Gen_Info.');
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const editmobileApi = async (req, res) => {
        const {
            Do_Id, Retailer_Id, Delivery_Person_Id,
            Delivery_Status,
            Delivery_Time, Delivery_Location, Delivery_Latitude, Delivery_Longitude, Payment_Mode, Payment_Status, Payment_Ref_No
        } = req.body;

        const Do_Date = ISOString(req?.body?.Do_Date);


        if (
            !checkIsNumber(Do_Id)
            || !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Delivery_Person_Id)

        ) {
            return invalidInput(res, 'Do_Id, Retailer_Id, Delivery_Person_Id, Created_by is Required')
        }

        const transaction = new sql.Transaction();

        try {

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('doid', Do_Id)
                .input('date', Do_Date)
                .input('retailer', Retailer_Id)
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
                .query(`
                    UPDATE
                        tbl_Sales_Delivery_Gen_Info
                    SET
                        Do_Date = @date,
                        Retailer_Id = @retailer,
                        Delivery_Person_Id = @deliveryperson,
                        Delivery_Time=@deliveryTime,
                        Delivery_Status=@deliverystatus,
                       Delivery_Location=@deliveryLocation,
                       Delivery_Latitude=@deliverylatitude,
                       Delivery_Longitude=@deliverylongitute,
                       Payment_Mode=@paymentMode,
                       Payment_Status=@paymentStatus,
                       Payment_Ref_No=@paymentrefno,
                        Trans_Type = @Trans_Type
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
            Branch_Id,
            Vehicle_No,
            Trip_No,
            StartTime,
            Created_By,
            GST_Inclusive = 1,
            IS_IGST = 0,
            Delivery_Person_Id,
            Delivery_Location

        } = req.body;

        var Do_Date = ISOString(req?.body?.Do_Date);
        var Trip_Date = req.body.Trip_Date;
        var Alter_Id = req.body.Alter_Id;
        const transaction = new sql.Transaction();

        if (!Delivery_Person_Id || !Branch_Id || !Do_Date) {
            return invalidInput(res, 'Please Select Required Fields');
        }

        try {

            await transaction.begin();

            const requestForDoNos = new sql.Request(transaction);
            const resultForDoNo = await requestForDoNos.query(`
                    SELECT COUNT(*) AS count
                    FROM tbl_Sales_Delivery_Gen_Info
                `);
            const maxDoNo = Number(resultForDoNo.recordset[0].count) + 1;

            const Trip_Id = Number((await new sql.Request(transaction).query(`
                    SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
                    FROM tbl_Trip_Master
                `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');
            const Challan_No = createPadString(Trip_Id, 4);

            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .input('Challan_No', Challan_No)
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('Trip_No', Trip_No)
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Created_By', Created_By)
                .input('Created_At', new Date())
                .query(`
                        INSERT INTO tbl_Trip_Master (
                            Trip_Id, Challan_No, Branch_Id, Trip_Date, Vehicle_No,
                            StartTime, Trip_No, Trip_ST_KM, Created_By, Created_At
                        ) VALUES (
                            @Trip_Id, @Challan_No, @Branch_Id, @Trip_Date, @Vehicle_No,
                            @StartTime, @Trip_No, @Trip_ST_KM, @Created_By, @Created_At
                        );
                    `);

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];

                const productsData = (await getProducts()).dataArray;
                const Alter_Id = Math.floor(Math.random() * 999999);
                const Do_Year = new Date().getFullYear();

                const Do_No = Number((await new sql.Request(transaction)
                    .input('Branch_Id', Branch_Id)
                    .input('Do_Year', Do_Year)
                    .query(`
                            SELECT
                                COALESCE(MAX(Do_No), 0) AS Do_No
                            FROM
                                tbl_Sales_Delivery_Gen_Info
                            WHERE
                                Branch_Id = @Branch_Id
                                AND Do_Year = @Do_Year`
                    ))?.recordset[0]?.Do_No) + 1;


                if (!checkIsNumber(Do_No)) throw new Error('Failed to get Order Id');

                const Do_Inv_No = 'DO_' + Branch_Id + '_' + Do_Year + '_' + createPadString(Do_No, 4);

                const maxDo_Id = Number((await new sql.Request(transaction)
                    .query(`
                            SELECT
                                COALESCE(MAX(Do_Id), 0) AS Do_Id
                            FROM
                                tbl_Sales_Delivery_Gen_Info`
                    ))?.recordset[0]?.Do_Id) + 1;

                // if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');
                const Do_Id = maxDo_Id;
                var Taxable_Amount = product?.Total_Before_Tax ?? 0;
                var Retailer_Id = product?.Retailer_Id ?? null;
                var Final_Amo = product?.Total_Invoice_value ?? 0;
                var Total_Tax = product?.Total_Tax;
                var Round_off = product?.Round_off;

                const request1 = new sql.Request(transaction);
                request1.input('Do_Id', Do_Id);
                request1.input('Do_No', Do_No);
                request1.input('Do_Year', Do_Year);
                request1.input('Do_Inv_No', Do_Inv_No);
                request1.input('Voucher_Type', 0)
                request1.input('Do_Date', sql.Date, Do_Date);
                request1.input('Retailer_Id', product?.Retailer_Id);
                request1.input('Delivery_Person_Id', Number(Delivery_Person_Id));
                request1.input('Branch_Id', sql.Int, Branch_Id);
                request1.input('GST_Inclusive', sql.Int, GST_Inclusive);
                request1.input('CSGT_Total', product?.CSGT_Total || 0);
                request1.input('SGST_Total', product?.SGST_Total || 0);
                request1.input('IGST_Total', product?.IGST_Total || 0);
                request1.input('Round_off', sql.Decimal(18, 2), Round_off);
                request1.input('Total_Before_Tax', Taxable_Amount);
                request1.input('Total_Tax', Total_Tax);
                request1.input('Total_Invoice_value', product?.Total_Invoice_value);
                request1.input('Cancel_status', 2);
                request1.input('So_No', product?.So_Id);
                request1.input('Delivery_Status', sql.Int, 1);
                request1.input('Delivery_Location', sql.NVarChar(250), Delivery_Location);
                request1.input('Payment_Status', sql.Int, 1);
                request1.input('Alter_Id', sql.BigInt, product?.Alter_Id);
                request1.input('Created_by', sql.BigInt, Created_By);
                request1.input('Created_on', sql.DateTime, new Date());
                request1.input('Trans_Type', 'INSERT');

                const result1 = await request1.query(`
                        INSERT INTO tbl_Sales_Delivery_Gen_Info (
                          Do_Id, Do_No,Do_Year,Do_Inv_No,Voucher_Type, Do_Date, Retailer_Id, Delivery_Person_Id, Branch_Id, GST_Inclusive, CSGT_Total,
                            SGST_Total, IGST_Total, Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value,
                            Cancel_status, So_No, Delivery_Status, Delivery_Location,Payment_Status,
                            Alter_Id, Created_by, Created_on, Trans_Type
                        ) VALUES (
                         @Do_Id, @Do_No,@Do_Year,@Do_Inv_No,@Voucher_Type, @Do_Date, @Retailer_Id, @Delivery_Person_Id, @Branch_Id, @GST_Inclusive, @CSGT_Total,
                         @SGST_Total, @IGST_Total, @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value,
                            @Cancel_status, @So_No, @Delivery_Status, @Delivery_Location,@Payment_Status,
                            @Alter_Id, @Created_by, @Created_on, @Trans_Type
                        );
                        SELECT SCOPE_IDENTITY() AS DeliveryId;
                    `);

                var DeliveryId = result1.recordset[0]?.DeliveryId;

                if (product.Products_List && Array.isArray(product.Products_List)) {
                    for (let j = 0; j < product.Products_List.length; j++) {
                        const subProduct = product.Products_List[j];

                        const request2 = new sql.Request(transaction);
                        request2.input('Do_Date', sql.Date, Do_Date);
                        request2.input('Delivery_Order_Id', Do_Id);
                        request2.input('S_No', j + 1);
                        request2.input('Item_Id', subProduct.Item_Id);
                        request2.input('Bill_Qty', subProduct?.Bill_Qty);
                        request2.input('Item_Rate', subProduct?.Item_Rate);
                        request2.input('Amount', subProduct?.Amount);
                        request2.input('Free_Qty', 0);
                        request2.input('Total_Qty', subProduct?.Bill_Qty);
                        request2.input('Taxble', subProduct?.Taxble);
                        request2.input('Taxable_Rate', subProduct?.Taxable_Rate);
                        request2.input('HSN_Code', subProduct?.HSN_Code);
                        request2.input('Unit_Id', subProduct.Unit_Id);
                        request2.input('Unit_Name', subProduct?.UOM);
                        request2.input('Taxable_Amount', subProduct?.Taxable_Amount);
                        request2.input('Tax_Rate', subProduct?.gstPercentage);
                        request2.input('Cgst', subProduct?.Cgst ?? 0);
                        request2.input('Cgst_Amo', subProduct?.Cgst_Amo || 0);
                        request2.input('Sgst', (subProduct?.Sgst / 2) ?? 0);
                        request2.input('Sgst_Amo', subProduct?.Sgst_Amo || 0);
                        request2.input('Igst', subProduct?.Igst ?? 0);
                        request2.input('Igst_Amo', subProduct?.Igst_Amo || 0);
                        request2.input('Final_Amo', subProduct?.Final_Amo);
                        request2.input('Created_on', new Date());

                        await request2.query(`
                                INSERT INTO tbl_Sales_Delivery_Stock_Info (
                                    Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty,
                                    Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                                    Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                                ) VALUES (
                                    @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty,
                                    @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                                    @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                                );
                            `);

                        const result = await new sql.Request(transaction)
                            .input('Trip_Id', Trip_Id)
                            .input('Delivery_Id', Do_Id)
                            .input('Batch_No', subProduct?.Batch_No)
                            .input('From_Location', Branch_Id)
                            .input('To_Location', subProduct.To_Location)
                            .input('S_No', i + 1)
                            .input('Product_Id', subProduct.Item_Id)
                            .input('HSN_Code', subProduct.HSN_Code)
                            .input('QTY', subProduct.Bill_Qty)
                            .input('KGS', subProduct.KGS)
                            .input('GST_Inclusive', GST_Inclusive)
                            .input('IS_IGST', IS_IGST)
                            .input('Gst_Rate', sql.Int, subProduct.Gst_Rate)
                            .input('Gst_P', subProduct?.Gst_P || 0)
                            .input('Cgst_P', subProduct?.Cgst_Amo || 0)
                            .input('Sgst_P', subProduct?.Sgst_Amo || 0)
                            .input('Igst_P', subProduct?.Igst_Amo || 0)
                            .input('Taxable_Value', subProduct?.Taxable_Amount || 0)
                            .input('Round_off', subProduct?.Round_off)
                            .input('Total_Value', subProduct?.Final_Amo)
                            .input('Trip_From', Branch_Id)
                            .input('Party_And_Branch_Id', subProduct.Party_And_Branch_Id)
                            .input('Transporter_Id', subProduct.Transporter_Id)
                            .input('Dispatch_Date', Do_Date)
                            .input('Delivery_Date', Do_Date)
                            .input('Created_By', Created_By)
                            .query(`
                                    INSERT INTO tbl_Trip_Details (
                                        Trip_Id, Delivery_Id, Batch_No, From_Location, To_Location, S_No, Product_Id,
                                        HSN_Code, QTY, KGS, GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value,
                                        Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id,
                                        Dispatch_Date, Delivery_Date, Created_By
                                    ) VALUES (
                                        @Trip_Id, @Delivery_Id, @Batch_No, @From_Location, @To_Location, @S_No, @Product_Id,
                                        @HSN_Code, @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value,
                                        @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, @Transporter_Id,
                                        @Dispatch_Date, @Delivery_Date, @Created_By
                                    );
                                `);
                    }
                }
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
                        tr.Branch_Id,  -- Include Branch_Id here
                        bm.BranchName
                   FROM tbl_Trip_Master tr
                   LEFT JOIN tbl_Branch_Master bm ON bm.BranchId=tr.Branch_Id
                WHERE tr.Trip_Date BETWEEN @FromDate AND @ToDate
               
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
                       sgi.Do_Date AS Delivery_Do_Date,  -- Renamed Do_Date
                       sogi.So_Id AS Sales_Order_Id,  
                       sogi.Retailer_Id AS Order_Retailer_Id  
                   FROM tbl_Trip_Details AS td
                   LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sgi ON sgi.Do_Id = td.Delivery_Id
                   LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sgi.So_No
               )
               
               -- Main query starts
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
               
                   (SELECT MIN(td.Delivery_Do_Date) FROM TRIP_DETAILS AS td WHERE td.Trip_Id = tm.Trip_Id) AS DO_Date,
               
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
            td.Delivery_Do_Date  
        FROM TRIP_DETAILS AS td
        LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = td.Delivery_Person_Id
        LEFT JOIN tbl_Users us ON us.UserId = ecc.User_Id  
        
        WHERE td.Trip_Id = tm.Trip_Id
        FOR JSON PATH
    ), '[]') AS Trip_Details,
    
               
                   -- Product Array (Avoid Duplicate Do_Date)
                   COALESCE((  
                       SELECT
                           sgi.*,
                           rm.Retailer_Name,
                           sgi.Do_Date AS Product_Do_Date, 
               
                           (  
                               SELECT
                                   sdsi.*,
                                   pm.Product_Name,
                                   pm.Product_Image_Name,
                                      tm.BranchName AS Branch,  -- Include BranchName in Products_List
                                   rm.Retailer_Name,  -- Include Retailer_Name in Products_List
                                      rm.Latitude,
                                     rm.Longitude
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
               
                   -- Employees Involved in the Trip
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
               FROM TRIP_MASTER AS tm;
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
            EmployeesInvolved = []
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
                    .input('Trip_No', Trip_No)
                    .input('Trip_ST_KM', Number(Trip_ST_KM))
                    .input('Trip_EN_KM', Number(Trip_EN_KM))
                    .input('Trip_Tot_Kms', Trip_Tot_Kms)
                    .input('Updated_By', Updated_By)
                    .query(`
                    UPDATE tbl_Trip_Master
                    SET Branch_Id = @Branch_Id, Trip_Date = @Trip_Date, Vehicle_No = @Vehicle_No,
                        StartTime = @StartTime, EndTime = @EndTime, Trip_No = @Trip_No,
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
                    .query(`
                    DELETE S FROM tbl_Sales_Delivery_Stock_Info S
                    INNER JOIN tbl_Trip_Details T ON S.Delivery_Order_Id = T.Delivery_Id
                    WHERE T.Trip_Id = @Trip_Id;

                    DELETE G FROM tbl_Sales_Delivery_Gen_Info G
                    INNER JOIN tbl_Trip_Details T ON G.Do_Id = T.Delivery_Id
                    WHERE T.Trip_Id = @Trip_Id;

                    DELETE TE FROM tbl_Trip_Employees TE
                    INNER JOIN tbl_Trip_Details T ON TE.Trip_Id = T.Trip_Id
                    WHERE T.Trip_Id = @Trip_Id;

                    DELETE T FROM tbl_Trip_Details T WHERE T.Trip_Id = @Trip_Id;
                `);

            } catch (error) {
                console.error("Error deleting related records:", error);
                throw error;
            }

            for (const product of Product_Array) {
                const {
                    Do_Id,
                    Do_No,
                    Retailer_Id,
                    Do_Year,
                    Do_Inv_No,
                    Voucher_Type,
                    So_No,
                    CSGT_Total = 0,
                    SGST_Total = 0,
                    IGST_Total = 0,
                    Round_off = 0,
                    Total_Before_Tax = 0,
                    Total_Tax = 0,
                    Total_Invoice_value = 0,
                    Products_List = []
                } = product;
                const previousDeliveryInfo = await new sql.Request(transaction)
                    .input('Do_Id', Do_Id)
                    .query(`
                SELECT Branch_Id, Do_Year
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE Do_Id = @Do_Id
            `);

                const previousBranch_Id = previousDeliveryInfo.recordset[0]?.Branch_Id;
                const previousDo_Year = previousDeliveryInfo.recordset[0]?.Do_Year;

                let newDo_No = Do_No;
                let newDo_Inv_No = Do_Inv_No;

                if (Branch_Id !== previousBranch_Id || Do_Year !== previousDo_Year) {

                    newDo_No = Number((await new sql.Request(transaction)
                        .input('Branch_Id', Branch_Id)
                        .input('Do_Year', Do_Year)
                        .query(`
                    SELECT COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Branch_Id = @Branch_Id AND Do_Year = @Do_Year
                `))?.recordset[0]?.Do_No) + 1;

                    newDo_Inv_No = 'DO_' + Branch_Id + '_' + Do_Year + '_' + createPadString(newDo_No, 4);
                }

                let cumulativeFinalAmo = 0;
                let cumulativeCGST = 0;
                let cumulativeSGST = 0;
                let cumulativeIGST = 0;
                let cumulativeTotalTax = 0;
                let cumulativeTotalInvoiceValue = 0;
                let cumulativeBeforeTax = 0;

                for (const subProduct of Products_List) {
                    cumulativeFinalAmo += subProduct.Final_Amo;
                    cumulativeCGST += subProduct.Cgst_Amo;
                    cumulativeSGST += subProduct.Sgst_Amo;
                    cumulativeIGST += subProduct.Igst_Amo;
                    cumulativeTotalTax += subProduct.Cgst_Amo + subProduct.Sgst_Amo + subProduct.Igst_Amo;
                    cumulativeTotalInvoiceValue += subProduct.Final_Amo;
                    cumulativeBeforeTax += subProduct.Taxable_Amount;
                }

                try {
                    await new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Do_No', newDo_No)
                        .input('Do_Year', Do_Year)
                        .input('Do_Inv_No', newDo_Inv_No)
                        .input('Voucher_Type', Voucher_Type)
                        .input('Do_Date', Do_Date)
                        .input('Retailer_Id', Retailer_Id)
                        .input('Delivery_Person_Id', Delivery_Person_Id)
                        .input('Branch_Id', Branch_Id)
                        .input('GST_Inclusive', GST_Inclusive)
                        .input('CSGT_Total', cumulativeCGST)
                        .input('SGST_Total', cumulativeSGST)
                        .input('IGST_Total', cumulativeIGST)
                        .input('Round_off', Round_off)
                        .input('Total_Before_Tax', cumulativeBeforeTax)
                        .input('Total_Tax', cumulativeTotalTax)
                        .input('Total_Invoice_value', cumulativeTotalInvoiceValue)
                        .input('So_No', So_No)
                        .input('Delivery_Status', 1)
                        .input('Delivery_Location', Delivery_Location)
                        .input('Payment_Status', 1)
                        .input('Alter_Id', Alter_Id)
                        .input('Created_By', Created_By)
                        .input('Created_on', new Date())

                        .query(`
                       
                        INSERT INTO tbl_Sales_Delivery_Gen_Info (
                            Do_Id, Do_No, Do_Year, Do_Inv_No,Voucher_Type,Do_Date, Retailer_Id, Delivery_Person_Id, Branch_Id,
                            GST_Inclusive, CSGT_Total, SGST_Total, IGST_Total, Round_off,
                            Total_Before_Tax, Total_Tax, Total_Invoice_value, So_No, Delivery_Status,
                            Delivery_Location, Payment_Status, Alter_Id, Created_By, Created_on
                        ) VALUES (
                            @Do_Id, @Do_No, @Do_Year, @Do_Inv_No,@Voucher_Type,@Do_Date, @Retailer_Id, @Delivery_Person_Id, @Branch_Id,
                            @GST_Inclusive, @CSGT_Total, @SGST_Total, @IGST_Total, @Round_off,
                            @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @So_No, @Delivery_Status,
                            @Delivery_Location, @Payment_Status, @Alter_Id, @Created_By, @Created_on
                        );
                       
                    `);

                } catch (error) {
                    console.error(`Error inserting Delivery Gen_Info for Do_Id: ${Do_Id}`, error);
                    throw error;
                }

                for (const [index, subProduct] of Products_List.entries()) {

                    try {
                        await new sql.Request(transaction)
                            .input('Do_Date', Do_Date)
                            .input('Delivery_Order_Id', Do_Id)
                            .input('Item_Id', subProduct.Item_Id)
                            .input('Bill_Qty', subProduct.Bill_Qty)
                            .input('Taxable_Rate', subProduct.Taxable_Rate)
                            .input('Item_Rate', subProduct.Item_Rate)
                            .input('Amount', subProduct.Amount)
                            .input('Free_Qty', subProduct.Free_Qty)
                            .input('Total_Qty', subProduct.Total_Qty)
                            .input('Taxble', subProduct.Taxble)
                            .input('HSN_Code', subProduct.HSN_Code)
                            .input('Unit_Id', subProduct.Unit_Id)
                            .input('Unit_Name', subProduct.Unit_Name)
                            .input('Taxable_Amount', subProduct.Taxable_Amount)
                            .input('Tax_Rate', subProduct.Tax_Rate)
                            .input('Cgst', subProduct.Cgst)
                            .input('Cgst_Amo', subProduct.Cgst_Amo)
                            .input('Sgst', subProduct.Sgst)
                            .input('Sgst_Amo', subProduct.Sgst_Amo)
                            .input('Igst', subProduct.Igst)
                            .input('Igst_Amo', subProduct.Igst_Amo)
                            .input('Final_Amo', subProduct.Final_Amo)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Stock_Info (
                                Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty,Taxable_Rate, Item_Rate, Amount,
                                Free_Qty,Total_Qty,Taxble,HSN_Code,Unit_Id,Unit_Name,
                                Taxable_Amount,Tax_Rate,Cgst, Cgst_Amo, Sgst,Sgst_Amo,Igst, Igst_Amo, Final_Amo, Created_on
                            ) VALUES (
                                @Do_Date, @Delivery_Order_Id, ${index + 1}, @Item_Id, @Bill_Qty,@Taxable_Rate, @Item_Rate, @Amount,
                                @Free_Qty,@Total_Qty,@Taxble,@HSN_Code,@Unit_Id,@Unit_Name,
                                @Taxable_Amount,@Tax_Rate,@Cgst, @Cgst_Amo,@Sgst, @Sgst_Amo,@Igst, @Igst_Amo, @Final_Amo, GETDATE()
                            );
                        `);

                    } catch (error) {
                        console.error(`Error inserting Stock Info for product ${subProduct.Item_Id}`, error);
                        throw error;
                    }


                    try {
                        await new sql.Request(transaction)
                            .input('Trip_Id', Trip_Id)
                            .input('Delivery_Id', Do_Id)
                            .input('Batch_No', subProduct?.Batch_No)
                            .input('From_Location', Branch_Id)
                            .input('To_Location', subProduct.To_Location)
                            .input('S_No', subProduct?.S_No)
                            .input('Product_Id', subProduct.Item_Id)
                            .input('HSN_Code', subProduct.HSN_Code)
                            .input('QTY', subProduct.Bill_Qty)
                            .input('KGS', subProduct.KGS)
                            .input('GST_Inclusive', GST_Inclusive)
                            .input('IS_IGST', IS_IGST)
                            .input('Gst_Rate', sql.Int, subProduct.Gst_Rate)
                            .input('Gst_P', subProduct?.Gst_P || 0)
                            .input('Cgst_P', subProduct?.Cgst_Amo || 0)
                            .input('Sgst_P', subProduct?.Sgst_Amo || 0)
                            .input('Igst_P', subProduct?.Igst_Amo || 0)
                            .input('Taxable_Value', subProduct?.Taxable_Amount || 0)
                            .input('Round_off', subProduct?.Round_off)
                            .input('Total_Value', subProduct?.Final_Amo)
                            .input('Trip_From', Branch_Id)
                            .input('Party_And_Branch_Id', subProduct.Party_And_Branch_Id)
                            .input('Transporter_Id', subProduct.Transporter_Id)
                            .input('Dispatch_Date', Do_Date)
                            .input('Delivery_Date', Do_Date)
                            .input('Created_By', Created_By)
                            .query(`
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, Delivery_Id, Batch_No, From_Location, To_Location, S_No, Product_Id,
                            HSN_Code, QTY, KGS, GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value,
                            Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id,
                            Dispatch_Date, Delivery_Date, Created_By
                        ) VALUES (
                            @Trip_Id, @Delivery_Id, @Batch_No, @From_Location, @To_Location, @S_No, @Product_Id,
                            @HSN_Code, @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value,
                            @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, @Transporter_Id,
                            @Dispatch_Date, @Delivery_Date, @Created_By
                        );
                    `);

                    } catch (error) {
                        console.error(`Error inserting Trip Details for product ${subProduct.Item_Id}`, error);
                        throw error;
                    }
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

    return {
        salesDeliveryCreation,
        getSaleOrder,
        editDeliveryOrder,
        getDeliveryorder,
        deleteDeliveryOrder,
        editmobileApi,
        deliveryOrderTrip,
        deliveryTripsheetList,
        updateDeliveryOrderTrip
    }
}


export default DeliveryOrder();