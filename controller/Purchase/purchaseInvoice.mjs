import sql from 'mssql'
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, RoundNumber, createPadString, Addition, toArray, Division, toNumber } from '../../helper_functions.mjs'
import getImage from '../../middleware/getImageIfExist.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';


const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

function buildBulkPurchaseRows(Product_Array, productsData, { isInclusive, isNotTaxableBill, isIGST }) {
    const stockRows = [];
    const batchRows = [];

    Product_Array.forEach((product, index) => {
        const productDetails = findProductDetails(productsData, product.Item_Id) || {};
        const pack = toNumber(productDetails.Pack) || 1;

        const gstPercentage = isIGST ? toNumber(productDetails.Igst_P) : toNumber(productDetails.Gst_P);
        const Taxble = isNotTaxableBill ? 0 : (gstPercentage > 0 ? 1 : 0);

        const Bill_Qty = RoundNumber(toNumber(product?.Bill_Qty) || 0);
        const Item_Rate = RoundNumber(toNumber(product?.Item_Rate) || 0);

        // If Amount not provided, derive it as Qty * Rate
        const AmountRaw = product?.Amount != null ? toNumber(product?.Amount) : (Bill_Qty * Item_Rate);
        const Amount = RoundNumber(AmountRaw);

        const taxType = isNotTaxableBill ? 'zerotax' : (isInclusive ? 'remove' : 'add');
        const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
        const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

        const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
        const sgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0; // mirror CGST
        const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;

        const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
        const Sgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
        const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

        const Free_Qty = RoundNumber(toNumber(product?.Free_Qty) || 0);
        const Total_Qty = RoundNumber(Bill_Qty + Free_Qty);

        const Bill_Alt_Qty = Division(Bill_Qty, pack);
        const Alt_Act_Qty = Bill_Alt_Qty;

        // ---------- Row for tbl_Purchase_Order_Inv_Stock_Info (bulk insert) ----------
        stockRows.push({
            DeliveryId: toNumber(product?.DeliveryId) || 0,
            Location_Id: toNumber(product?.Location_Id) || 0,
            S_No: index + 1,
            Item_Id: toNumber(product?.Item_Id),
            Bill_Qty,
            Act_Qty: toNumber(product?.Act_Qty) || Bill_Qty,
            Bill_Alt_Qty,
            Alt_Act_Qty,
            Unit_Id: product?.Unit_Id ?? '',
            Bill_Alt_Unit_Id: product?.Unit_Id ?? '',
            Act_unit_Id: product?.Unit_Id ?? '',
            Alt_Unit_Id: product?.Unit_Id ?? '',
            Unit_Name: product?.Unit_Name ?? '',
            Bill_Alt_Unit_Name: product?.Unit_Name ?? '',
            Act_unit_Nmae: product?.Unit_Name ?? '',
            Alt_Unit_Name: product?.Unit_Name ?? '',
            Batch_No: product?.Batch_No ?? '',
            Taxable_Rate: RoundNumber(itemRateGst.base_amount),
            Item_Rate,
            Amount: RoundNumber(Amount),
            Free_Qty,
            Total_Qty,
            Taxble,
            HSN_Code: productDetails.HSN_Code ?? '',
            Taxable_Amount: RoundNumber(gstInfo.base_amount),
            Tax_Rate: RoundNumber(gstInfo.tax_per),
            Cgst: RoundNumber(cgstPer),
            Cgst_Amo: RoundNumber(Cgst_Amo),
            Sgst: RoundNumber(sgstPer),
            Sgst_Amo: RoundNumber(Sgst_Amo),
            Igst: RoundNumber(igstPer),
            Igst_Amo: RoundNumber(Igst_Amo),
            Final_Amo: RoundNumber(gstInfo.with_tax)
        });

        // ---------- Row for tbl_Batch_Master (bulk MERGE) ----------
        if (product?.Batch_No) {
            batchRows.push({
                batch: product?.Batch_No,
                item_id: toNumber(product?.Item_Id),
                godown_id: toNumber(product?.Location_Id) || 0,
                quantity: Bill_Qty,
                rate: Item_Rate
            });
        }
    });

    return { stockRows, batchRows };
}

const PurchaseOrder = () => {

    const purchaseOrderCreation = async (req, res) => {
        const {
            Retailer_Id, Branch_Id, Ref_Po_Inv_No = '',
            Narration = null, Created_by, Product_Array = [], StaffArray = [], GST_Inclusive = 1, IS_IGST = 0,
            Voucher_Type = '', Stock_Item_Ledger_Name = '', Round_off, Discount = 0,
            QualityCondition = '', PaymentDays = 0
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
                .input('Po_Entry_Date', Po_Entry_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @Po_Entry_Date 
                        AND Fin_End_Date >= @Po_Entry_Date`
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
                .input('Round_off', checkIsNumber(Round_off) ? Round_off : RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
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
                .input('Discount', Discount)
                .input('QualityCondition', QualityCondition)
                .input('PaymentDays', PaymentDays)
                .query(`
                    INSERT INTO tbl_Purchase_Order_Inv_Gen_Info (
                        PIN_Id, PO_Inv_Id, PO_Inv_Year, Ref_Po_Inv_No, Branch_Id, Po_Inv_No, Po_Inv_Date, Po_Entry_Date, Retailer_Id, GST_Inclusive, 
                        IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value, Narration, 
                        Cancel_status, Created_by, Altered_by, Created_on, Alterd_on, Trans_Type, Alter_Id, Voucher_Type, Stock_Item_Ledger_Name,
                        Discount, QualityCondition, PaymentDays
                    ) VALUES (
                        @PIN_Id, @PO_Inv_Id, @PO_Inv_Year, @Ref_Po_Inv_No, @Branch_Id, @Po_Inv_No, @Po_Inv_Date, @Po_Entry_Date, @Retailer_Id, @GST_Inclusive, 
                        @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Narration, 
                        @Cancel_status, @Created_by, @Altered_by, @Created_on, @Alterd_on, @Trans_Type, @Alter_Id, @Voucher_Type, @Stock_Item_Ledger_Name,
                        @Discount, @QualityCondition, @PaymentDays
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to create order, Try again.');
            }

            const { stockRows, batchRows } = buildBulkPurchaseRows(Product_Array, productsData, {
                isInclusive,
                isNotTaxableBill,
                isIGST
            });

            await new sql.Request(transaction)
                .input('PIN_Id', sql.Int, PIN_Id)
                .input('Po_Inv_Date', sql.DateTime, new Date(Po_Inv_Date))
                .input('ProductJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
                .query(`
                    INSERT INTO tbl_Purchase_Order_Inv_Stock_Info (
                        DeliveryId, PIN_Id, Po_Inv_Date, Location_Id, S_No, Item_Id,
                        Bill_Qty, Act_Qty, Bill_Alt_Qty, Alt_Act_Qty,
                        Unit_Id, Bill_Alt_Unit_Id, Act_unit_Id, Alt_Unit_Id,
                        Unit_Name, Bill_Alt_Unit_Name, Act_unit_Nmae, Alt_Unit_Name, Batch_No,
                        Taxable_Rate, Item_Rate, Amount, Free_Qty, Total_Qty, Taxble,
                        HSN_Code, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    )
                    SELECT
                        p.DeliveryId, @PIN_Id, @Po_Inv_Date, p.Location_Id, p.S_No, p.Item_Id,
                        p.Bill_Qty, p.Act_Qty, p.Bill_Alt_Qty, p.Alt_Act_Qty,
                        p.Unit_Id, p.Bill_Alt_Unit_Id, p.Act_unit_Id, p.Alt_Unit_Id,
                        p.Unit_Name, p.Bill_Alt_Unit_Name, p.Act_unit_Nmae, p.Alt_Unit_Name, p.Batch_No,
                        p.Taxable_Rate, p.Item_Rate, p.Amount, p.Free_Qty, p.Total_Qty, p.Taxble,
                        p.HSN_Code, p.Taxable_Amount, p.Tax_Rate, p.Cgst, p.Cgst_Amo, p.Sgst, p.Sgst_Amo, p.Igst, p.Igst_Amo, p.Final_Amo, GETDATE()
                    FROM OPENJSON(@ProductJson, '$.rows')
                    WITH (
                        DeliveryId INT '$.DeliveryId',
                        Location_Id INT '$.Location_Id',
                        S_No INT '$.S_No',
                        Item_Id BIGINT '$.Item_Id',
                        Bill_Qty DECIMAL(18,2) '$.Bill_Qty',
                        Act_Qty DECIMAL(18,2) '$.Act_Qty',
                        Bill_Alt_Qty DECIMAL(18,2) '$.Bill_Alt_Qty',
                        Alt_Act_Qty DECIMAL(18,2) '$.Alt_Act_Qty',
                        Unit_Id NVARCHAR(50) '$.Unit_Id',
                        Bill_Alt_Unit_Id NVARCHAR(50) '$.Bill_Alt_Unit_Id',
                        Act_unit_Id NVARCHAR(50) '$.Act_unit_Id',
                        Alt_Unit_Id NVARCHAR(50) '$.Alt_Unit_Id',
                        Unit_Name NVARCHAR(200) '$.Unit_Name',
                        Bill_Alt_Unit_Name NVARCHAR(200) '$.Bill_Alt_Unit_Name',
                        Act_unit_Nmae NVARCHAR(200) '$.Act_unit_Nmae',
                        Alt_Unit_Name NVARCHAR(200) '$.Alt_Unit_Name',
                        Batch_No NVARCHAR(200) '$.Batch_No',
                        Taxable_Rate DECIMAL(18,2) '$.Taxable_Rate',
                        Item_Rate DECIMAL(18,2) '$.Item_Rate',
                        Amount DECIMAL(18,2) '$.Amount',
                        Free_Qty DECIMAL(18,2) '$.Free_Qty',
                        Total_Qty DECIMAL(18,2) '$.Total_Qty',
                        Taxble BIT '$.Taxble',
                        HSN_Code NVARCHAR(50) '$.HSN_Code',
                        Taxable_Amount DECIMAL(18,2) '$.Taxable_Amount',
                        Tax_Rate DECIMAL(18,2) '$.Tax_Rate',
                        Cgst DECIMAL(18,2) '$.Cgst',
                        Cgst_Amo DECIMAL(18,2) '$.Cgst_Amo',
                        Sgst DECIMAL(18,2) '$.Sgst',
                        Sgst_Amo DECIMAL(18,2) '$.Sgst_Amo',
                        Igst DECIMAL(18,2) '$.Igst',
                        Igst_Amo DECIMAL(18,2) '$.Igst_Amo',
                        Final_Amo DECIMAL(18,2) '$.Final_Amo'
                    ) AS p;`
                );

            await new sql.Request(transaction)
                .input('Po_Inv_Date', sql.DateTime, new Date(Po_Inv_Date))
                .input('Created_by', sql.Int, Created_by)
                .input('BatchJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: batchRows }))
                .query(`
                    MERGE tbl_Batch_Master AS target
                    USING (
                        SELECT p.batch, p.item_id, p.godown_id, p.quantity, p.rate
                        FROM OPENJSON(@BatchJson, '$.rows')
                        WITH (
                            batch NVARCHAR(200) '$.batch',
                            item_id BIGINT '$.item_id',
                            godown_id BIGINT '$.godown_id',
                            quantity DECIMAL(18,2) '$.quantity',
                            rate DECIMAL(18,2) '$.rate'
                        ) AS p
                    ) AS src
                    ON  target.batch = src.batch AND target.item_id = src.item_id AND target.godown_id = src.godown_id
                    WHEN MATCHED THEN 
                        UPDATE SET target.quantity = target.quantity + src.quantity
                    WHEN NOT MATCHED THEN
                        INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                        VALUES (NEWID(), src.batch, src.item_id, src.godown_id, @Po_Inv_Date, src.quantity, src.rate, @Created_by);`
                );

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
            Stock_Item_Ledger_Name = '', Round_off, Discount = 0,
            QualityCondition = '', PaymentDays = 0
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
            // || (!Array.isArray(Product_Array) || Product_Array.length === 0)
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
                .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)

                .input('Ref_Po_Inv_No', Ref_Po_Inv_No)
                .input('Retailer_Id', Retailer_Id)
                .input('Branch_Id', Branch_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('CSGT_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))

                .input('SGST_Total', isIGST ? 0 : RoundNumber(totalValueBeforeTax.TotalTax / 2))
                .input('IGST_Total', isIGST ? RoundNumber(totalValueBeforeTax.TotalTax) : 0)
                .input('IS_IGST', isIGST ? 1 : 0)

                .input('Round_off', checkIsNumber(Round_off) ? Round_off : RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Before_Tax', RoundNumber(totalValueBeforeTax.TotalValue))
                .input('Total_Tax', RoundNumber(totalValueBeforeTax.TotalTax))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))

                .input('Narration', Narration)
                .input('Altered_by', Created_by)
                .input('Alter_Id', Alter_Id)

                .input('Alterd_on', new Date())
                .input('Trans_Type', 'UPDATE')
                .input('Discount', Discount)
                .input('QualityCondition', QualityCondition)
                .input('PaymentDays', PaymentDays)
                .query(`
                    UPDATE 
                        tbl_Purchase_Order_Inv_Gen_Info
                    SET
                        Po_Inv_Date = @Po_Inv_Date, 
                        Po_Entry_Date = @Po_Entry_Date,
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
                        Alterd_on = GETDATE(),
                        Trans_Type = @Trans_Type,
                        Discount = @Discount, 
                        QualityCondition = @QualityCondition, 
                        PaymentDays = @PaymentDays
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
                .input('Created_by', Created_by)
                .query(`
                -- latest obid
                    DECLARE @openingId INT = (SELECT MAX(OB_Id) FROM tbl_OB_ST_Date);
                    INSERT INTO tbl_Batch_Transaction (
                        batch_id, batch, trans_date, item_id, godown_id, 
                        quantity, type, reference_id, created_by, ob_id
                    ) 
                    SELECT *
                    FROM ( 
                        SELECT
                            (
                                SELECT TOP(1) id FROM tbl_Batch_Master
                                WHERE batch = pis.Batch_No AND item_id = pis.Item_Id AND godown_id = pis.Location_Id
                                ORDER BY id DESC
                            ) batch_id,
                            pis.Batch_No batch,
                            GETDATE() trans_date,
                            pis.Item_Id item_id,
                            pis.Location_Id godown_id,
                            -pis.Bill_Qty quantity,
                            'REVERSAL_PURCHASE' type,
                            pis.POI_St_Id reference_id,
                            @Created_by created_by,
                            @openingId ob_id
                        FROM tbl_Purchase_Order_Inv_Stock_Info AS pis
                        WHERE 
                            pis.PIN_Id = @PIN_Id
                            AND pis.Batch_No IS NOT NULL
                            AND pis.Batch_No <> ''
                    ) AS batchDetails
                    WHERE batchDetails.batch_id IS NOT NULL;
                -- removing previous data
                    DELETE FROM tbl_Purchase_Order_Inv_Stock_Info WHERE PIN_Id = @PIN_Id
                    DELETE FROM tbl_Purchase_Order_Inv_Gen_Order WHERE PIN_Id = @PIN_Id
                    DELETE FROM tbl_Purchase_Order_Inv_Staff_Details WHERE PIN_Id = @PIN_Id
                `);

            const { stockRows, batchRows } = buildBulkPurchaseRows(toArray(Product_Array), productsData, {
                isInclusive,
                isNotTaxableBill,
                isIGST
            });

            await new sql.Request(transaction)
                .input('PIN_Id', sql.Int, PIN_Id)
                .input('Po_Inv_Date', sql.DateTime, new Date(Po_Inv_Date))
                .input('ProductJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
                .query(`
                    INSERT INTO tbl_Purchase_Order_Inv_Stock_Info (
                        DeliveryId, PIN_Id, Po_Inv_Date, Location_Id, S_No, Item_Id,
                        Bill_Qty, Act_Qty, Bill_Alt_Qty, Alt_Act_Qty,
                        Unit_Id, Bill_Alt_Unit_Id, Act_unit_Id, Alt_Unit_Id,
                        Unit_Name, Bill_Alt_Unit_Name, Act_unit_Nmae, Alt_Unit_Name, Batch_No,
                        Taxable_Rate, Item_Rate, Amount, Free_Qty, Total_Qty, Taxble,
                        HSN_Code, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    )
                    SELECT
                        p.DeliveryId, @PIN_Id, @Po_Inv_Date, p.Location_Id, p.S_No, p.Item_Id,
                        p.Bill_Qty, p.Act_Qty, p.Bill_Alt_Qty, p.Alt_Act_Qty,
                        p.Unit_Id, p.Bill_Alt_Unit_Id, p.Act_unit_Id, p.Alt_Unit_Id,
                        p.Unit_Name, p.Bill_Alt_Unit_Name, p.Act_unit_Nmae, p.Alt_Unit_Name, p.Batch_No,
                        p.Taxable_Rate, p.Item_Rate, p.Amount, p.Free_Qty, p.Total_Qty, p.Taxble,
                        p.HSN_Code, p.Taxable_Amount, p.Tax_Rate, p.Cgst, p.Cgst_Amo, p.Sgst, p.Sgst_Amo, p.Igst, p.Igst_Amo, p.Final_Amo, GETDATE()
                    FROM OPENJSON(@ProductJson, '$.rows')
                    WITH (
                        DeliveryId INT '$.DeliveryId',
                        Location_Id INT '$.Location_Id',
                        S_No INT '$.S_No',
                        Item_Id BIGINT '$.Item_Id',
                        Bill_Qty DECIMAL(18,2) '$.Bill_Qty',
                        Act_Qty DECIMAL(18,2) '$.Act_Qty',
                        Bill_Alt_Qty DECIMAL(18,2) '$.Bill_Alt_Qty',
                        Alt_Act_Qty DECIMAL(18,2) '$.Alt_Act_Qty',
                        Unit_Id NVARCHAR(50) '$.Unit_Id',
                        Bill_Alt_Unit_Id NVARCHAR(50) '$.Bill_Alt_Unit_Id',
                        Act_unit_Id NVARCHAR(50) '$.Act_unit_Id',
                        Alt_Unit_Id NVARCHAR(50) '$.Alt_Unit_Id',
                        Unit_Name NVARCHAR(200) '$.Unit_Name',
                        Bill_Alt_Unit_Name NVARCHAR(200) '$.Bill_Alt_Unit_Name',
                        Act_unit_Nmae NVARCHAR(200) '$.Act_unit_Nmae',
                        Alt_Unit_Name NVARCHAR(200) '$.Alt_Unit_Name',
                        Batch_No NVARCHAR(200) '$.Batch_No',
                        Taxable_Rate DECIMAL(18,2) '$.Taxable_Rate',
                        Item_Rate DECIMAL(18,2) '$.Item_Rate',
                        Amount DECIMAL(18,2) '$.Amount',
                        Free_Qty DECIMAL(18,2) '$.Free_Qty',
                        Total_Qty DECIMAL(18,2) '$.Total_Qty',
                        Taxble BIT '$.Taxble',
                        HSN_Code NVARCHAR(50) '$.HSN_Code',
                        Taxable_Amount DECIMAL(18,2) '$.Taxable_Amount',
                        Tax_Rate DECIMAL(18,2) '$.Tax_Rate',
                        Cgst DECIMAL(18,2) '$.Cgst',
                        Cgst_Amo DECIMAL(18,2) '$.Cgst_Amo',
                        Sgst DECIMAL(18,2) '$.Sgst',
                        Sgst_Amo DECIMAL(18,2) '$.Sgst_Amo',
                        Igst DECIMAL(18,2) '$.Igst',
                        Igst_Amo DECIMAL(18,2) '$.Igst_Amo',
                        Final_Amo DECIMAL(18,2) '$.Final_Amo'
                    ) AS p;`
                );

            await new sql.Request(transaction)
                .input('Po_Inv_Date', sql.DateTime, new Date(Po_Inv_Date))
                .input('Created_by', sql.Int, Created_by)
                .input('BatchJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: batchRows }))
                .query(`
                    MERGE tbl_Batch_Master AS target
                    USING (
                        SELECT p.batch, p.item_id, p.godown_id, p.quantity, p.rate
                        FROM OPENJSON(@BatchJson, '$.rows')
                        WITH (
                            batch NVARCHAR(200) '$.batch',
                            item_id BIGINT '$.item_id',
                            godown_id BIGINT '$.godown_id',
                            quantity DECIMAL(18,2) '$.quantity',
                            rate DECIMAL(18,2) '$.rate'
                        ) AS p
                    ) AS src
                    ON  target.batch = src.batch AND target.item_id = src.item_id AND target.godown_id = src.godown_id
                    WHEN MATCHED THEN 
                        UPDATE SET target.quantity = target.quantity + src.quantity
                    WHEN NOT MATCHED THEN
                        INSERT (id, batch, item_id, godown_id, trans_date, quantity, rate, created_by)
                        VALUES (NEWID(), src.batch, src.item_id, src.godown_id, @Po_Inv_Date, src.quantity, src.rate, @Created_by);`
                );

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
                const isOrderExist = acc.findIndex(OrderId => isEqualNumber(OrderId, pro.OrderId));

                if (isOrderExist === -1) {
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
            success(res, 'Changes Saved!');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    }

    const cancelPurchaseOrder = async (req, res) => {
        try {
            const { PIN_Id } = req.query;

            if (!checkIsNumber(PIN_Id)) return invalidInput(res);

            const request = new sql.Request()
                .input('PIN_Id', PIN_Id)
                .query(`
                    UPDATE tbl_Purchase_Order_Inv_Gen_Info
                    SET Cancel_status = CASE WHEN Cancel_status = 1 THEN 0 ELSE 1 END
                    WHERE PIN_Id = @PIN_Id`);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Purchase invoice canceled');
            } else {
                failed(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getPurchaseOrder = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const {
                Retailer_Id, Cancel_status, VoucherType,
                Cost_Center_Type_Id, Involved_Emp_Id, filterItems
            } = req.query;

            const request = new sql.Request()
                .input('from', Fromdate)
                .input('to', Todate)
                .input('Retailer_Id', Retailer_Id)
                .input('Cancel_status', Cancel_status)
                .input('VoucherType', VoucherType)
                .input('Cost_Center_Type_Id', Cost_Center_Type_Id)
                .input('Involved_Emp_Id', Involved_Emp_Id)
                .input('filterItems', filterItems)
                .query(`
                    -- Step 1: Declare table variable to collect filtered PIN_Ids
                    DECLARE @FilteredPurchase TABLE (PIN_Id INT);
                    -- Step 2: Populate table variable with filters
                    INSERT INTO @FilteredPurchase (PIN_Id)
                    SELECT DISTINCT pigi.PIN_Id
                    FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                    LEFT JOIN tbl_Purchase_Order_Inv_Staff_Details AS pisd ON pigi.PIN_Id = pisd.PIN_Id
                    LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS pisi ON pisi.PIN_Id = pigi.PIN_Id
                    WHERE
                        pigi.Po_Entry_Date BETWEEN @from AND @to
                        ${checkIsNumber(Retailer_Id) ? ' AND pigi.Retailer_Id = @Retailer_Id' : ''}
                        ${checkIsNumber(Cancel_status) ? ' AND pigi.Cancel_status = @Cancel_status' : ''}
                        ${checkIsNumber(VoucherType) ? ' AND pigi.Voucher_Type = @VoucherType' : ''}
                        ${checkIsNumber(Cost_Center_Type_Id) ? ' AND pisd.Cost_Center_Type_Id = @Cost_Center_Type_Id' : ''}
                        ${checkIsNumber(Involved_Emp_Id) ? ' AND pisd.Involved_Emp_Id = @Involved_Emp_Id' : ''}
                        ${checkIsNumber(filterItems) ? ' AND pisi.Item_Id = @filterItems ' : ''};
                    -- Step 3: Get Purchase General Info
                    SELECT 
                        pigi.*,
                        COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                        COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                        COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                        COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                    FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                    LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = pigi.Retailer_Id
                    LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = pigi.Branch_Id
                    LEFT JOIN tbl_Users AS cb ON cb.UserId = pigi.Created_by
                    LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = pigi.Voucher_Type
                    WHERE pigi.PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase)
                    ORDER BY CONVERT(DATE, pigi.Po_Entry_Date) DESC;
                    -- Step 4: Get Purchase Product Details
                    SELECT
                        oi.*,
                        COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                        COALESCE(pm.Product_Image_Name, 'unknown') AS Product_Image_Name,
                        COALESCE(pdd.OrderId, '') AS OrderId
                    FROM tbl_Purchase_Order_Inv_Stock_Info AS oi
                    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                    LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS pdd ON pdd.Id = oi.DeliveryId
                    WHERE oi.PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase);
                    -- Step 5: Get Purchase Staff Info
                    SELECT 
                        s.*,
                        e.Cost_Center_Name AS Involved_Emp_Name,
                        cc.Cost_Category AS Involved_Emp_Type
                    FROM tbl_Purchase_Order_Inv_Staff_Details AS s
                    LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = s.Involved_Emp_Id
                    LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = s.Cost_Center_Type_Id
                    WHERE s.PIN_Id IN (SELECT PIN_Id FROM @FilteredPurchase);
                    -- Step 6: Get is direct order or from purchase order
                    SELECT DISTINCT PIN_Id, Order_Id
                    FROM tbl_Purchase_Order_Inv_Gen_Order
                    WHERE PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase)`
                );

            const result = await request;

            const PurchaseInfo = toArray(result.recordsets[0]);
            const Products_List = toArray(result.recordsets[1]);
            const Staff_List = toArray(result.recordsets[2]);
            const FromPurchseOrder = toArray(result.recordsets[3]);

            if (PurchaseInfo.length > 0) {
                const finalResult = PurchaseInfo.map(p => ({
                    ...p,
                    Products_List: Products_List.filter(prod => isEqualNumber(prod.PIN_Id, p.PIN_Id)).map(pp => ({
                        ...pp,
                        ProductImageUrl: getImage('products', pp.Product_Image_Name)
                    })),
                    Staff_List: Staff_List.filter(stf => isEqualNumber(stf.PIN_Id, p.PIN_Id)),
                    isFromPurchaseOrder: toNumber(FromPurchseOrder.find(pin => isEqualNumber(pin.PIN_Id, p.PIN_Id))?.Order_Id) !== 0
                }));
                dataFound(res, finalResult);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

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
            const { type = 'PURCHASE' } = req.query;
            const request = new sql.Request()
                .input('type', type)
                .query(`
                    SELECT * 
                    FROM tbl_Stock_Item_Ledger_Name
                    WHERE Type = @type`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getInvolvedStaffs = async (req, res) => {
        try {

            const request = new sql.Request()
                .query(`
                    --cost names
                    SELECT 
                        DISTINCT pisd.Involved_Emp_Id AS Emp_Id,
                        COALESCE(c.Cost_Center_Name, 'Not found') AS Emp_Name_Get
                    FROM tbl_Purchase_Order_Inv_Staff_Details AS pisd
                    LEFT JOIN tbl_ERP_Cost_Center AS c
                        ON c.Cost_Center_Id = pisd.Involved_Emp_Id;

                    -- cost types
                    SELECT 
                    	DISTINCT pisd.Cost_Center_Type_Id AS Emp_Type_Id,
                    	COALESCE(cc.Cost_Category, 'Not found') AS Emp_Type_Get
                    FROM tbl_Purchase_Order_Inv_Staff_Details AS pisd
                    LEFT JOIN tbl_ERP_Cost_Category AS cc
                    	ON cc.Cost_Category_Id = pisd.Cost_Center_Type_Id;`
                );

            const result = await request;

            dataFound(res, [], 'Data found', {
                Employees: result.recordsets[0],
                EmployeeTypes: result.recordsets[1]
            });

        } catch (e) {
            servError(e, res);
        }
    }

    const getPurchaseInvoiceMobile = async (req, res) => {
        try {
            const {
                Retailer_Id,
                Cancel_status = 0,
                VoucherType,
                Cost_Center_Type_Id,
                Involved_Emp_Id,
                filterItems,
                Branch_Id,
                User_Id,
            } = req.query;

            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            // --- Branch filtering ---
            let branchCondition = '';

            if (User_Id) {
                const getBranches = await new sql.Request()
                    .input('User_Id', User_Id)
                    .query(`SELECT Branch_Id FROM tbl_userbranchrights WHERE User_Id = @User_Id`);

                const allowedBranches = getBranches.recordset.map(b => b.Branch_Id);

                // Parse Branch_Id if provided, otherwise use all allowed branches
                const branchIds = Branch_Id && Branch_Id.trim() !== ''
                    ? Branch_Id.split(',').map(Number).filter(n => !isNaN(n))
                    : allowedBranches;

                // Only keep branchIds that user has access to
                const finalBranches = allowedBranches.length
                    ? branchIds.filter(b => allowedBranches.includes(b))
                    : branchIds;

                if (finalBranches.length) {
                    branchCondition = ` AND pigi.Branch_Id IN (${finalBranches.join(',')}) `;
                } else {
                    // No branches to fetch -> return empty
                    return res.json({ data: [], message: "No data", success: true, others: {} });
                }
            }

            // --- Main Query ---
            const request = new sql.Request()
                .input('from', Fromdate)
                .input('to', Todate)
                .input('Retailer_Id', Retailer_Id)
                .input('Cancel_status', Cancel_status)
                .input('VoucherType', VoucherType)
                .input('Cost_Center_Type_Id', Cost_Center_Type_Id)
                .input('Involved_Emp_Id', Involved_Emp_Id)
                .input('filterItems', filterItems)
                .query(`
                DECLARE @FilteredPurchase TABLE (PIN_Id INT);

                INSERT INTO @FilteredPurchase (PIN_Id)
                SELECT DISTINCT pigi.PIN_Id
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Purchase_Order_Inv_Staff_Details AS pisd ON pigi.PIN_Id = pisd.PIN_Id
                LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS pisi ON pisi.PIN_Id = pigi.PIN_Id
                WHERE
                    pigi.Po_Entry_Date BETWEEN @from AND @to
                    ${checkIsNumber(Retailer_Id) ? ' AND pigi.Retailer_Id = @Retailer_Id' : ''}
                    ${checkIsNumber(Cancel_status) ? ' AND pigi.Cancel_status = @Cancel_status' : ''}
                    ${checkIsNumber(VoucherType) ? ' AND pigi.Voucher_Type = @VoucherType' : ''}
                    ${checkIsNumber(Cost_Center_Type_Id) ? ' AND pisd.Cost_Center_Type_Id = @Cost_Center_Type_Id' : ''}
                    ${checkIsNumber(Involved_Emp_Id) ? ' AND pisd.Involved_Emp_Id = @Involved_Emp_Id' : ''}
                    ${checkIsNumber(filterItems) ? ' AND pisi.Item_Id = @filterItems ' : ''}
                    ${branchCondition};

                -- Purchase General Info
                SELECT 
                    pigi.*,
                    COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = pigi.Retailer_Id
                LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = pigi.Branch_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = pigi.Created_by
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = pigi.Voucher_Type
                WHERE pigi.PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase)
                ORDER BY CONVERT(DATE, pigi.Po_Entry_Date) DESC;

                -- Purchase Product Details
                SELECT
                    oi.*,
                    COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                    COALESCE(pm.Product_Image_Name, 'unknown') AS Product_Image_Name,
                    COALESCE(pdd.OrderId, '') AS OrderId
                FROM tbl_Purchase_Order_Inv_Stock_Info AS oi
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS pdd ON pdd.Id = oi.DeliveryId
                WHERE oi.PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase);

                -- Purchase Staff Info
                SELECT 
                    s.*,
                    e.Cost_Center_Name AS Involved_Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Purchase_Order_Inv_Staff_Details AS s
                LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = s.Involved_Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = s.Cost_Center_Type_Id
                WHERE s.PIN_Id IN (SELECT PIN_Id FROM @FilteredPurchase);

                -- From Purchase Order indicator
                SELECT DISTINCT PIN_Id
                FROM tbl_Purchase_Order_Inv_Gen_Order
                WHERE PIN_Id IN (SELECT DISTINCT PIN_Id FROM @FilteredPurchase);
            `);

            const result = await request;

            const PurchaseInfo = toArray(result.recordsets[0]);
            const Products_List = toArray(result.recordsets[1]);
            const Staff_List = toArray(result.recordsets[2]);
            const FromPurchseOrder = toArray(result.recordsets[3]);

            if (PurchaseInfo.length > 0) {
                const finalResult = PurchaseInfo.map(p => ({
                    ...p,
                    Products_List: Products_List.filter(prod => isEqualNumber(prod.PIN_Id, p.PIN_Id)).map(pp => ({
                        ...pp,
                        ProductImageUrl: getImage('products', pp.Product_Image_Name)
                    })),
                    Staff_List: Staff_List.filter(stf => isEqualNumber(stf.PIN_Id, p.PIN_Id)),
                    isFromPurchaseOrder: toNumber(FromPurchseOrder.find(pin => isEqualNumber(pin.PIN_Id, p.PIN_Id))?.PIN_Id) !== 0
                }));

                dataFound(res, finalResult);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    };

    return {
        purchaseOrderCreation,
        editPurchaseOrder,
        cancelPurchaseOrder,
        getPurchaseOrder,
        getVoucherType,
        getStockItemLedgerName,
        getInvolvedStaffs,
        getPurchaseInvoiceMobile
    }
}


export default PurchaseOrder();