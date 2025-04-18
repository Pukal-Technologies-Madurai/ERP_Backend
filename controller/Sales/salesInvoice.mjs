import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, toArray, toNumber } from '../../helper_functions.mjs';
import { failed, invalidInput, servError, dataFound, noData, sentData, success } from '../../res.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';



const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};


const SalesInvoice = () => {

    const createSalesInvoice = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Retailer_Id, Branch_Id, So_No, Voucher_Type = '', Cancel_status,
                Narration = null, Created_by, GST_Inclusive = 1, IS_IGST = 0,
                Product_Array = [], Expence_Array = [], Staffs_Array = []
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
                .input('So_No', So_No)
                .input('Cancel_status', toNumber(Cancel_status))

                .input('GST_Inclusive', sql.Int, GST_Inclusive)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('Total_Expences', TotalExpences)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))

                .input('Trans_Type', 'INSERT')
                .input('Alter_Id', sql.BigInt, Alter_Id)
                .input('Created_by', sql.BigInt, Created_by)
                .input('Created_on', sql.DateTime, new Date())
                .query(`
                    INSERT INTO tbl_Sales_Delivery_Gen_Info (
                        Do_Id, Do_Inv_No, Voucher_Type, Do_No, Do_Year,
                        Do_Date, Branch_Id, Retailer_Id, Delivery_Person_Id, Narration, So_No, Cancel_status,
                        GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, Round_off, 
                        Total_Before_Tax, Total_Tax, Total_Invoice_value,
                        Trans_Type, Alter_Id, Created_by, Created_on
                    ) VALUES (
                        @Do_Id, @Do_Inv_No, @Voucher_Type, @Do_No, @Do_Year,
                        @Do_Date, @Branch_Id, @Retailer_Id, @Delivery_Person_Id, @Narration, @So_No, @Cancel_status,
                        @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, @Round_off, 
                        @Total_Before_Tax, @Total_Tax, @Total_Invoice_value,
                        @Trans_Type, @Alter_Id, @Created_by, @Created_on
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create general info in sales invoice')
            }

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
                    .input('Alt_Act_Qty', toNumber(product?.Alt_Act_Qty))
                    .input('Item_Rate', toNumber(Item_Rate))
                    .input('GoDown_Id', 1)
                    .input('Amount', toNumber(Amount))
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('HSN_Code', productDetails.HSN_Code)
                    .input('Unit_Id', product.UOM ?? '')
                    .input('Act_unit_Id', product.Act_unit_Id ?? '')
                    .input('Alt_Act_Unit_Id', product.Alt_Act_Unit_Id ?? '')
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

                    const request = new sql.Request(transaction)
                        .input('Do_Id', Do_Id)
                        .input('Sno', expInd + 1)
                        .input('Expence_Id', toNumber(exp?.Expence_Id))
                        .input('Cgst', isIGST ? 0 : toNumber(exp?.Cgst))
                        .input('Cgst_Amo', isIGST ? 0 :  toNumber(exp?.Cgst_Amo))
                        .input('Sgst', isIGST ? 0 :  toNumber(exp?.Sgst))
                        .input('Sgst_Amo', isIGST ? 0 :  toNumber(exp?.Sgst_Amo))
                        .input('Igst', isIGST ? toNumber(exp?.Igst) : 0)
                        .input('Igst_Amo', isIGST ? toNumber(exp?.Igst_Amo) : 0)
                        .input('Expence_Value', toNumber(exp?.Expence_Value))
                        .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expence_Id, Cgst, Cgst_Amo, Sgst, Sgst_Amo, 
                                Igst, Igst_Amo, Expence_Value
                            ) VALUES (
                                @Do_Id, @Sno, @Expence_Id, @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, 
                                @Igst, @Igst_Amo, @Expence_Value
                            )`
                        );

                    const result = await request;

                    if (result.rowsAffected[0] === 0) {
                        throw new Error('Failed to insert Expence row in sales invoice creation');
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

            success(res, 'new Sale order created!')
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const getSalesInvoice = async (req, res) => {
        try {
            const
                Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
                Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
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
                        WHERE CONVERT(DATE, oi.Do_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                    )
                    SELECT 
                        sdgi.Do_Id, sdgi.Do_Inv_No, sdgi.Voucher_Type, sdgi.Do_No, sdgi.Do_Year,
                        sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
                        sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, sdgi.Total_Expences, 
                        sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
                        sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on,
                        COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                        COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                        COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                        COALESCE(sdgi.Total_Invoice_Value, 0) AS Total_Invoice_Value,
                        COALESCE((
                            SELECT sd.*
                            FROM DELIVERY_DETAILS AS sd
                            WHERE sd.Delivery_Order_Id = sdgi.Do_Id
                            FOR JSON PATH
                        ), '[]') AS Products_List
                    FROM 
                        tbl_Sales_Delivery_Gen_Info AS sdgi
                    LEFT JOIN tbl_Retailers_Master AS rm 
                        ON rm.Retailer_Id = sdgi.Retailer_Id
                    LEFT JOIN tbl_Branch_Master AS bm 
                        ON bm.BranchId = sdgi.Branch_Id
                    LEFT JOIN tbl_Users AS cb 
                        ON cb.UserId = sdgi.Created_by
                    WHERE sdgi.Do_Date BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)`
                );

            const result = await request;

            if (result.recordset?.length > 0) {
                const parsed = result.recordset.map(
                    sales => ({
                        ...sales,
                        Products_List: toArray(JSON.parse(sales?.Products_List))
                    })
                )
                dataFound(res, parsed);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getFilterValues = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    -- Voucher
                    SELECT DISTINCT rec.voucher_id AS value, v.Voucher_Type AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = rec.voucher_id
                    -- Retailer
                    SELECT DISTINCT rec.retailer_id AS value, r.Retailer_Name AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = rec.retailer_id
                    -- Collection Type
                    SELECT DISTINCT collection_type AS value, collection_type AS label
                    FROM tbl_Sales_Receipt_General_Info
                    -- Payment Status
                    SELECT DISTINCT payment_status AS value, payment_status AS label
                    FROM tbl_Sales_Receipt_General_Info
                    -- Collected By
                    SELECT DISTINCT rec.collected_by AS value, u.Name AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = rec.collected_by;`
                );

            const result = await request;

            dataFound(res, [], 'data found', {
                voucherType: toArray(result.recordsets[0]),
                retailers: toArray(result.recordsets[1]),
                collectionType: toArray(result.recordsets[2]),
                paymentStatus: toArray(result.recordsets[3]),
                collectedBy: toArray(result.recordsets[4]),
            });
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        createSalesInvoice,
        getSalesInvoice,
    }
}

export default SalesInvoice();