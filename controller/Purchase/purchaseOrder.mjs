import sql from 'mssql'
import { dataFound, invalidInput, noData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, Multiplication, RoundNumber, createPadString, Addition } from '../../helper_functions.mjs'
import getImage from '../../middleware/getImageIfExist.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';


const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

const PurchaseOrder = () => {

    const purchaseOrderCreation = async (req, res) => {
        const {
            Retailer_Id, Branch_Id, Ref_Po_Inv_No = '',
            Narration = null, Created_by, Product_Array = [], StaffArray = [], GST_Inclusive = 1, IS_IGST = 0,
            Voucher_Type = 0, Stock_Item_Ledger_Name = '',
        } = req.body;

        const Po_Inv_Date = req?.body?.Po_Inv_Date ? ISOString(req?.body?.Po_Inv_Date) : ISOString();
        const Po_Entry_Date = req?.body?.Po_Entry_Date ? ISOString(req?.body?.Po_Entry_Date) : ISOString();
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);

        if (
            !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Voucher_Type)
            || !checkIsNumber(Branch_Id)
            || (!Array.isArray(Product_Array) || Product_Array.length === 0)
            || (!Array.isArray(StaffArray))
            || !checkIsNumber(Created_by)
        ) {
            return invalidInput(res, 'Retailer_Id, Voucher_Type, Branch_Id, Created_by, Product_Array, StaffArray is Required')
        }

        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts(1)).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            // get unique Purchase invoice id

            const getPIN_Id = await getNextId({ table: 'tbl_Purchase_Order_Inv_Gen_Info', column: 'PIN_Id' });
            if (!getPIN_Id.status || !checkIsNumber(getPIN_Id.MaxId)) throw new Error('Failed to get PIN_Id');

            const PIN_Id = getPIN_Id.MaxId;

            // get Year and Year code

            const PO_Inv_Year = await new sql.Request()
                .input('Po_Inv_Date', Po_Inv_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @Po_Inv_Date 
                        AND Fin_End_Date >= @Po_Inv_Date`
                );

            if (PO_Inv_Year.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = PO_Inv_Year.recordset[0];

            // get Voucher and year based invoice count

            const PO_Inv_Id = Number((await new sql.Request()
                .input('Year_Id', Year_Id)
                .input('Voucher_Type', Voucher_Type)
                .query(`
                SELECT 
                    COALESCE(MAX(PO_Inv_Id), 0) AS PO_Inv_Id
                FROM 
                    tbl_Purchase_Order_Inv_Gen_Info
                WHERE
                    PO_Inv_Year = @Year_Id
                    AND
                    Voucher_Type = @Voucher_Type`
                ))?.recordset[0]?.PO_Inv_Id) + 1;

            if (!checkIsNumber(PO_Inv_Id)) throw new Error('Failed to get Order Id');

            // get Voucher Code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', Voucher_Type)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            // get invoice code

            const Po_Inv_No = Voucher_Code + "/" + createPadString(PO_Inv_Id, 6) + '/' + Year_Desc;

            // const Po_Inv_No = 'PO_' + Branch_Id + '_' + PO_Inv_Year + '_' + createPadString(PO_Inv_Id, 4);

            const Total_Invoice_value = RoundNumber(Product_Array.reduce((acc, item) => {
                const Amount = RoundNumber(item?.Amount);

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
                const Amount = RoundNumber(item?.Amount);

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
                .input('PIN_Id', PIN_Id)
                .input('Po_Inv_No', Po_Inv_No)
                .input('Branch_Id', Branch_Id)
                .input('PO_Inv_Id', PO_Inv_Id)
                .input('Voucher_Type', Voucher_Type)
                .input('PO_Inv_Year', Year_Id)
                .input('Ref_Po_Inv_No', Ref_Po_Inv_No)
                .input('Po_Inv_Date', Po_Inv_Date)
                .input('Retailer_Id', Retailer_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))
                .input('SGST_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))
                .input('IGST_Total', isIGST ? RoundNumber(totalValueBeforeTax.TotalTax) : 0)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Before_Tax', RoundNumber(totalValueBeforeTax.TotalValue))
                .input('Total_Tax', RoundNumber(totalValueBeforeTax.TotalTax))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Narration', Narration)
                .input('Cancel_status', 0)
                .input('Po_Entry_Date', Po_Entry_Date)
                .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)
                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)
                .input('Created_on', new Date())
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'INSERT')
                .input('Alter_Id', Alter_Id)
                .query(`
                    INSERT INTO tbl_Purchase_Order_Inv_Gen_Info (
                        PIN_Id, PO_Inv_Id, PO_Inv_Year, Ref_Po_Inv_No, Branch_Id, Po_Inv_No, Po_Inv_Date, Po_Entry_Date, Retailer_Id, GST_Inclusive, 
                        IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value, Narration, 
                        Cancel_status, Created_by, Altered_by, Created_on, Alterd_on, Trans_Type, Alter_Id, Voucher_Type, Stock_Item_Ledger_Name
                    ) VALUES (
                        @PIN_Id, @PO_Inv_Id, @PO_Inv_Year, @Ref_Po_Inv_No, @Branch_Id, @Po_Inv_No, @Po_Inv_Date, @Po_Entry_Date, @Retailer_Id, @GST_Inclusive, 
                        @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Narration, 
                        @Cancel_status, @Created_by, @Altered_by, @Created_on, @Alterd_on, @Trans_Type, @Alter_Id, @Voucher_Type, @Stock_Item_Ledger_Name
                    )`
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
                const Bill_Qty = RoundNumber(product?.Bill_Qty);
                const Item_Rate = RoundNumber(product?.Item_Rate);
                const Amount = RoundNumber(product?.Amount);

                const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';
                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                const request2 = new sql.Request(transaction)
                    .input('DeliveryId', Number(product?.DeliveryId || 0))
                    .input('Po_Inv_Date', Po_Inv_Date)
                    .input('PIN_Id', PIN_Id)
                    .input('Location_Id', Number(product?.Location_Id || 0))

                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)

                    .input('Bill_Qty', Bill_Qty)
                    .input('Act_Qty', Number(product?.Act_Qty))
                    .input('Bill_Alt_Qty', Number(product?.Bill_Alt_Qty))
                    .input('Alt_Act_Qty', Number(product?.Bill_Alt_Qty))

                    .input('Unit_Id', product.Unit_Id ?? '')
                    .input('Bill_Alt_Unit_Id', product.Unit_Id ?? '')
                    .input('Act_unit_Id', product.Unit_Id ?? '')
                    .input('Alt_Unit_Id', product.Unit_Id ?? '')

                    .input('Unit_Name', product.Unit_Name ?? '')
                    .input('Bill_Alt_Unit_Name', product.Unit_Name ?? '')
                    .input('Act_unit_Nmae', product.Unit_Name ?? '')
                    .input('Alt_Unit_Name', product.Unit_Name ?? '')

                    .input('Batch_No', product?.Batch_No ?? '')
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('HSN_Code', productDetails.HSN_Code)

                    .input('Taxable_Amount', gstInfo.base_amount)
                    .input('Tax_Rate', gstInfo.tax_per)
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Stock_Info (
                            DeliveryId, PIN_Id, Po_Inv_Date, Location_Id, S_No, Item_Id,
                            Bill_Qty, Act_Qty, Bill_Alt_Qty, Alt_Act_Qty,
                            Unit_Id, Bill_Alt_Unit_Id, Act_unit_Id, Alt_Unit_Id,
                            Unit_Name, Bill_Alt_Unit_Name, Act_unit_Nmae, Alt_Unit_Name, Batch_No,
                            Taxable_Rate, Item_Rate, Amount, Free_Qty, Total_Qty, Taxble,
                            HSN_Code, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @DeliveryId, @PIN_Id, @Po_Inv_Date, @Location_Id, @S_No, @Item_Id,
                            @Bill_Qty, @Act_Qty, @Bill_Alt_Qty, @Alt_Act_Qty,
                            @Unit_Id, @Bill_Alt_Unit_Id, @Act_unit_Id, @Alt_Unit_Id,
                            @Unit_Name, @Bill_Alt_Unit_Name, @Act_unit_Nmae, @Alt_Unit_Name, @Batch_No,
                            @Taxable_Rate, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, @Taxble,
                            @HSN_Code, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (let i = 0; i < StaffArray.length; i++) {
                const staff = StaffArray[i];

                const request3 = new sql.Request(transaction)
                    .input('PIN_Id', sql.Int, Number(PIN_Id))
                    .input('Involved_Emp_Id', sql.Int, Number(staff?.Involved_Emp_Id))
                    .input('Cost_Center_Type_Id', sql.Int, Number(staff?.Cost_Center_Type_Id))
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Staff_Details (
                            PIN_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @PIN_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );`
                    );

                const result3 = await request3;

                if (result3.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            const DE_PO_ID = Product_Array.reduce((acc, pro) => {
                const existIndex = acc.findIndex(ind => isEqualNumber(ind, pro.OrderId));

                if (existIndex === -1) {
                    return acc.concat(pro.OrderId);
                } else {
                    return acc;
                }
            }, []);

            for (let i = 0; i < DE_PO_ID.length; i++) {
                const request = new sql.Request(transaction)
                    .input('Order_Id', DE_PO_ID[i])
                    .input('PIN_Id', PIN_Id)
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Gen_Order (
                            Order_Id, PIN_Id
                        ) VALUES (
                            @Order_Id, @PIN_Id
                        );`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to save data entry id')
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

    const editPurchaseOrder = async (req, res) => {
        const {
            PIN_Id, Retailer_Id, Branch_Id, Ref_Po_Inv_No = '',
            Narration = null, Created_by, Product_Array = [], StaffArray = [], GST_Inclusive = 1, IS_IGST = 0,
            Voucher_Type = '', Stock_Item_Ledger_Name = ''
        } = req.body;

        const Po_Inv_Date = ISOString(req?.body?.Po_Inv_Date);
        const Po_Entry_Date = ISOString(req?.body?.Po_Entry_Date);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);

        if (
            !checkIsNumber(PIN_Id)
            || !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Created_by)
            || (!Array.isArray(Product_Array) || Product_Array.length === 0)
            || (!Array.isArray(StaffArray))
        ) {
            return invalidInput(res, 'PIN_Id, Retailer_Id, Sales_Person_Id, Created_by, Product_Array, StaffArray is Required')
        }

        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts(0)).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            const Total_Invoice_value = RoundNumber(Product_Array.reduce((acc, item) => {
                const Amount = RoundNumber(item?.Amount);

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
                const Amount = RoundNumber(item?.Amount);

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
                .input('PIN_Id', PIN_Id)
                .input('Po_Inv_Date', Po_Inv_Date)
                .input('Po_Entry_Date', Po_Entry_Date)
                .input('Voucher_Type', Voucher_Type)
                .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)

                .input('Ref_Po_Inv_No', Ref_Po_Inv_No)
                .input('Retailer_Id', Retailer_Id)
                .input('Branch_Id', Branch_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))

                .input('SGST_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))
                .input('IGST_Total', isIGST ? RoundNumber(totalValueBeforeTax.TotalTax) : 0)
                .input('IS_IGST', isIGST ? 1 : 0)

                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Before_Tax', RoundNumber(totalValueBeforeTax.TotalValue))
                .input('Total_Tax', RoundNumber(totalValueBeforeTax.TotalTax))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))

                .input('Narration', Narration)
                .input('Altered_by', Created_by)
                .input('Alter_Id', Alter_Id)

                .input('Alterd_on', new Date())
                .input('Trans_Type', 'UPDATE')

                .query(`
                    UPDATE 
                        tbl_Purchase_Order_Inv_Gen_Info
                    SET
                        Po_Inv_Date = @Po_Inv_Date, 
                        Po_Entry_Date = @Po_Entry_Date,
                        Voucher_Type = @Voucher_Type,
                        Stock_Item_Ledger_Name = @Stock_Item_Ledger_Name,
                        Ref_Po_Inv_No = @Ref_Po_Inv_No, 
                        Retailer_Id = @Retailer_Id, 
                        Branch_Id = @Branch_Id, 
                        GST_Inclusive = @GST_Inclusive, 
                        CSGT_Total = @CSGT_Total, 
                        SGST_Total = @SGST_Total, 
                        IGST_Total = @IGST_Total, 
                        IS_IGST = @IS_IGST, 
                        Round_off = @Round_off, 
                        Total_Before_Tax = @Total_Before_Tax, 
                        Total_Tax = @Total_Tax,
                        Total_Invoice_value = @Total_Invoice_value, 
                        Narration = @Narration,  
                        Altered_by = @Altered_by, 
                        Alter_Id = @Alter_Id, 
                        Alterd_on = @Alterd_on,
                        Trans_Type = @Trans_Type
                    WHERE
                        PIN_Id = @PIN_Id;
                    `
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to update order, Try again')
            }

            await new sql.Request(transaction)
                .input('PIN_Id', PIN_Id)
                .query(`
                    DELETE FROM tbl_Purchase_Order_Inv_Stock_Info WHERE PIN_Id = @PIN_Id
                    DELETE FROM tbl_Purchase_Order_Inv_Gen_Order WHERE PIN_Id = @PIN_Id
                    DELETE FROM tbl_Purchase_Order_Inv_Staff_Details WHERE PIN_Id = @PIN_Id
                `);

            for (let i = 0; i < Product_Array.length; i++) {

                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id)

                const gstPercentage = isEqualNumber(IS_IGST, 1) ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = RoundNumber(product?.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = RoundNumber(product?.Amount);

                const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';
                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                const request2 = new sql.Request(transaction)
                    .input('DeliveryId', Number(product?.DeliveryId || 0))
                    .input('Po_Inv_Date', Po_Inv_Date)
                    .input('PIN_Id', PIN_Id)
                    .input('Location_Id', Number(product?.Location_Id || 0))

                    .input('S_No', i + 1)
                    .input('Item_Id', product.Item_Id)

                    .input('Bill_Qty', Bill_Qty)
                    .input('Act_Qty', Number(product?.Act_Qty))
                    .input('Bill_Alt_Qty', Number(product?.Bill_Alt_Qty))
                    .input('Alt_Act_Qty', Number(product?.Bill_Alt_Qty))

                    .input('Unit_Id', product.Unit_Id ?? '')
                    .input('Bill_Alt_Unit_Id', product.Unit_Id ?? '')
                    .input('Act_unit_Id', product.Unit_Id ?? '')
                    .input('Alt_Unit_Id', product.Unit_Id ?? '')

                    .input('Unit_Name', product.Unit_Name ?? '')
                    .input('Bill_Alt_Unit_Name', product.Unit_Name ?? '')
                    .input('Act_unit_Nmae', product.Unit_Name ?? '')
                    .input('Alt_Unit_Name', product.Unit_Name ?? '')

                    .input('Batch_No', product?.Batch_No ?? '')
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', 0)
                    .input('Total_Qty', Bill_Qty)
                    .input('Taxble', Taxble)
                    .input('HSN_Code', productDetails.HSN_Code)

                    .input('Taxable_Amount', gstInfo.base_amount)
                    .input('Tax_Rate', gstInfo.tax_per)
                    .input('Cgst', cgstPer ?? 0)
                    .input('Cgst_Amo', Cgst_Amo)
                    .input('Sgst', cgstPer ?? 0)
                    .input('Sgst_Amo', Cgst_Amo)
                    .input('Igst', igstPer ?? 0)
                    .input('Igst_Amo', Igst_Amo)
                    .input('Final_Amo', gstInfo.with_tax)
                    .input('Created_on', new Date())
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Stock_Info (
                            DeliveryId, PIN_Id, Po_Inv_Date, Location_Id, S_No, Item_Id,
                            Bill_Qty, Act_Qty, Bill_Alt_Qty, Alt_Act_Qty,
                            Unit_Id, Bill_Alt_Unit_Id, Act_unit_Id, Alt_Unit_Id,
                            Unit_Name, Bill_Alt_Unit_Name, Act_unit_Nmae, Alt_Unit_Name, Batch_No,
                            Taxable_Rate, Item_Rate, Amount, Free_Qty, Total_Qty, Taxble,
                            HSN_Code, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @DeliveryId, @PIN_Id, @Po_Inv_Date, @Location_Id, @S_No, @Item_Id,
                            @Bill_Qty, @Act_Qty, @Bill_Alt_Qty, @Alt_Act_Qty,
                            @Unit_Id, @Bill_Alt_Unit_Id, @Act_unit_Id, @Alt_Unit_Id,
                            @Unit_Name, @Bill_Alt_Unit_Name, @Act_unit_Nmae, @Alt_Unit_Name, @Batch_No,
                            @Taxable_Rate, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, @Taxble,
                            @HSN_Code, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        );`
                    )

                const result2 = await request2;

                if (result2.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            for (let i = 0; i < StaffArray.length; i++) {
                const staff = StaffArray[i];

                const request3 = new sql.Request(transaction)
                    .input('PIN_Id', sql.Int, Number(PIN_Id))
                    .input('Involved_Emp_Id', sql.Int, Number(staff?.Involved_Emp_Id))
                    .input('Cost_Center_Type_Id', sql.Int, Number(staff?.Cost_Center_Type_Id))
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Staff_Details (
                            PIN_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @PIN_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );`
                    );

                const result3 = await request3;

                if (result3.rowsAffected[0] === 0) {
                    throw new Error('Failed to create order, Try again.');
                }
            }

            const DE_PO_ID = Product_Array.reduce((acc, pro) => {
                const existIndex = acc.findIndex(ind => isEqualNumber(ind, pro.OrderId));

                if (existIndex === -1) {
                    return acc.concat(pro.OrderId);
                } else {
                    return acc;
                }
            }, []);

            for (let i = 0; i < DE_PO_ID.length; i++) {
                const request = new sql.Request(transaction)
                    .input('Order_Id', DE_PO_ID[i])
                    .input('PIN_Id', PIN_Id)
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Inv_Gen_Order (
                            Order_Id, PIN_Id
                        ) VALUES (
                            @Order_Id, @PIN_Id
                        );`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to save data entry id')
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

    const getPurchaseOrder = async (req, res) => {

        try {

            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const { Retailer_Id, Cancel_status, VoucherType } = req?.query;

            const request = new sql.Request()
                .input('from', Fromdate)
                .input('to', Todate)
                .input('Retailer_Id', Retailer_Id)
                .input('Cancel_status', Cancel_status)
                .input('VoucherType', VoucherType)
                .query(`
                    WITH Purchase AS (
			            SELECT 
                        	so.*,
                        	COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                        	COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                        	COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                        	COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                        FROM 
                        	tbl_Purchase_Order_Inv_Gen_Info AS so
                        	LEFT JOIN tbl_Retailers_Master AS rm
                        	ON rm.Retailer_Id = so.Retailer_Id
                        	LEFT JOIN tbl_Branch_Master bm
                        	ON bm.BranchId = so.Branch_Id
                        	LEFT JOIN tbl_Users AS cb
                        	ON cb.UserId = so.Created_by
                            LEFT JOIN tbl_Voucher_Type AS v
                            ON v.Vocher_Type_Id = so.Voucher_Type
                        WHERE
                            CONVERT(DATE, so.Po_Entry_Date) >= CONVERT(DATE, @from)
                        	AND
                        	CONVERT(DATE, so.Po_Entry_Date) <= CONVERT(DATE, @to) 
                            ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @Retailer_Id ' : ''}
                            ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @Cancel_status ' : ''}
                            ${checkIsNumber(VoucherType) ? ' AND so.Voucher_Type = @VoucherType ' : ''}
			        ), PurchaseDetails AS (
                        SELECT
                    		oi.*,
                    		COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'unknown') AS Product_Image_Name,
                            COALESCE(pdd.OrderId, '') AS OrderId
                    	FROM
                    		tbl_Purchase_Order_Inv_Stock_Info AS oi
                            LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                            LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS pdd
                            ON pdd.Id = oi.DeliveryId
                        WHERE
                            oi.PIN_Id IN (
			        			SELECT PIN_Id
			        			FROM Purchase
			        		)
                    ), StaffDetails AS (
                        SELECT 
                            s.*,
                            e.Cost_Center_Name AS Involved_Emp_Name,
                            cc.Cost_Category AS Involved_Emp_Type
                        FROM tbl_Purchase_Order_Inv_Staff_Details AS s
                        LEFT JOIN tbl_ERP_Cost_Center AS e
                            ON e.Cost_Center_Id = s.Involved_Emp_Id
                        LEFT JOIN tbl_ERP_Cost_Category AS cc
                            ON cc.Cost_Category_Id = s.Cost_Center_Type_Id
                        WHERE s.PIN_Id IN (
			        			SELECT PIN_Id
			        			FROM Purchase
			        		)
                    )
			        SELECT 
			        	so.*,
			        	COALESCE((
			        		SELECT
                    			sd.*
                    		FROM
                    			PurchaseDetails AS sd
                    		WHERE
                    			sd.PIN_Id = so.PIN_Id
                    		FOR JSON PATH 
			        	), '[]') AS Products_List,
                        COALESCE((
			        		SELECT
                    			sd.*
                    		FROM
                    			StaffDetails AS sd
                    		WHERE
                    			sd.PIN_Id = so.PIN_Id
                    		FOR JSON PATH 
			        	), '[]') AS Staff_List
			        FROM Purchase AS so
                    ORDER BY CONVERT(DATE, so.Po_Entry_Date) DESC;`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: JSON.parse(o?.Products_List),
                    Staff_List: JSON.parse(o?.Staff_List)
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

    const getVoucherType = async (req, res) => {
        // const { Type = 'PURCHASE' } = req.query;

        try {
            const request = new sql.Request()
                // .input('Type', Type)
                .query(`SELECT * FROM tbl_Voucher_Type`)
            // WHERE Type = @Type

            const result = await request;

            if (result.recordset.length > 0) return dataFound(res, result.recordset);
            else return noData(res);
        } catch (e) {
            servError(e, res);
        }
    }

    const getStockItemLedgerName = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`SELECT * FROM tbl_Stock_Item_Ledger_Name`)

            const result = await request;

            if (result.recordset.length > 0) return dataFound(res, result.recordset);
            else return noData(res);
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        purchaseOrderCreation,
        editPurchaseOrder,
        getPurchaseOrder,
        getVoucherType,
        getStockItemLedgerName,
    }
}


export default PurchaseOrder();