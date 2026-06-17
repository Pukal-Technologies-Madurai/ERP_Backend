import sql from 'mssql'
import { dataFound, invalidInput, noData, sentData, servError, success } from '../../res.mjs';
import {
    checkIsNumber, isEqualNumber, ISOString,
    Multiplication, RoundNumber, Addition,
    toNumber, toArray, isValidObject, isValidNumber,
    Subraction
} from '../../helper_functions.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';

const findProductDetails = (arr = [], productid) =>
    arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

// ${isValidNumber(Retailer_Id) ? ' AND pogi.Retailer_Id = @retailer ' : ''}
// ${isValidNumber(Created_by)  ? ' AND pogi.Created_by  = @creater '  : ''}
// ${isValidNumber(VoucherType) ? ' AND pogi.VoucherType = @VoucherType ' : ''}

// ─── GET query builder ──────────────────────────────────────────────────────────
const purchaseOrderQuery = (Retailer_Id, Created_by, VoucherType) => `
DECLARE @filters TABLE (id uniqueidentifier, PO_Id BIGINT);
INSERT INTO @filters (id, PO_Id)
SELECT pogi.id, pogi.PO_Id
FROM tbl_Purchase_Order_General_Info AS pogi
LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = pogi.Retailer_Id
LEFT JOIN tbl_Users AS cb ON cb.UserId = pogi.Created_by
LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = pogi.VoucherType
WHERE 
	pogi.Po_Date BETWEEN @Fromdate AND @Todate
    ${isValidNumber(Retailer_Id) ? ' AND pogi.Retailer_Id = @retailer ' : ''}
    ${isValidNumber(Created_by)  ? ' AND pogi.Created_by  = @creater '  : ''}
    ${isValidNumber(VoucherType) ? ' AND pogi.VoucherType = @VoucherType ' : ''};
-- ******************** 1: Purchase Order General Info ********************
SELECT
    pogi.*,
    COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
    COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet,
	COALESCE(sts.Status, '') statusGet
FROM tbl_Purchase_Order_General_Info AS pogi
LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = pogi.Retailer_Id
LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = pogi.Branch_Id
LEFT JOIN tbl_Users AS cb ON cb.UserId = pogi.Created_by
LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = pogi.VoucherType
LEFT JOIN tbl_Status AS sts ON sts.Status_Id = pogi.Po_Status
JOIN (SELECT DISTINCT id FROM @filters) AS fil ON fil.id = pogi.id
-- ******************** 2: Purchase Order Stock Info ********************
SELECT
    posi.*,
    COALESCE(pm.Product_Name, 'not available') AS Product_Name,
    COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
    COALESCE(u.Units, 'not available') AS UOM,
    COALESCE(b.Brand_Name, 'not available') AS BrandGet
FROM tbl_Purchase_Order_Stock_Info AS posi
LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = posi.Item_Id
LEFT JOIN tbl_UOM AS u ON u.Unit_Id = posi.Unit_Id
LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
JOIN (SELECT DISTINCT id FROM @filters) AS fil ON fil.id = posi.po_uid
-- ******************** 3: Purchase Order Staff Info ********************
SELECT
    posti.PO_Id,
    posti.Emp_Id,
    posti.Emp_Type_Id,
    COALESCE(c.Cost_Center_Name, 'unknown') AS EmpName,
    COALESCE(cc.Cost_Category,   'unknown') AS EmpType
FROM tbl_Purchase_Order_Staff_Info AS posti
LEFT JOIN tbl_ERP_Cost_Center   AS c  ON c.Cost_Center_Id   = posti.Emp_Id
LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = posti.Emp_Type_Id
JOIN (SELECT DISTINCT id FROM @filters) AS fil ON fil.id = posti.po_uid
-- ******************** 4: Purchase Order Parameter Info ********************
SELECT
	popi.*,
	pm.Paramet_Name AS parameterNameGet,
	pm.Paramet_Data_Type AS parameterDataType
FROM tbl_Purchase_Order_Parameter_Info AS popi
JOIN tbl_Paramet_Master AS pm ON pm.Paramet_Id = popi.ParameterId
JOIN (SELECT DISTINCT id FROM @filters) AS fil ON fil.id = popi.po_uid
-- ******************** 5: Purchase Order Trip Info ********************
SELECT
	poTrip.PO_Id AS orderId,
	ta.Product_Id AS productId,
	pm.Product_Name AS productNameGet,
	ta.QTY AS quantity,
	ta.Gst_Rate AS itemRate,
	ta.To_Location AS godownId,
	gm.Godown_Name As godownName
FROM tbl_Purchase_Order_Trip_Info AS poTrip
JOIN tbl_Trip_Master AS tm ON tm.Trip_Id = poTrip.trip_id AND tm.TripStatus <> 'Canceled'
JOIN tbl_Trip_Details AS td ON td.Trip_Id = tm.Trip_Id
JOIN tbl_Trip_Arrival AS ta ON ta.Arr_Id = td.Arrival_Id
JOIN tbl_Product_Master AS pm ON pm.Product_Id = ta.Product_Id
JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = ta.To_Location
-- ******************** 6: Purchase Invoice Info ********************
SELECT
	pioi.Order_Id AS orderId,
	pisi.Item_Id AS productId,
	pm.Product_Name AS productNameGet,
	pisi.Bill_Qty AS quantity,
	pisi.Item_Rate AS itemRate,
	pisi.Location_Id AS godownId,
	gm.Godown_Name As godownName
FROM tbl_Purchase_Order_Inv_Gen_Order AS pioi
JOIN @filters AS fltr ON fltr.PO_Id = pioi.Order_Id
JOIN tbl_Purchase_Order_Inv_Gen_Info AS pigi ON pigi.PIN_Id = pioi.PIN_Id AND pigi.Cancel_status = 0
JOIN tbl_Purchase_Order_Inv_Stock_Info AS pisi ON pisi.PIN_Id = pigi.PIN_Id
JOIN tbl_Product_Master AS pm ON pm.Product_Id = pisi.Item_Id
JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = pisi.Location_Id
`;

// ─── Controller ────────────────────────────────────────────────────────────────
const PurchaseOrder = () => {

    // ── GET ──────────────────────────────────────────────────────────────────
    const getPurchaseOrder = async (req, res) => {
        try {
            const { Retailer_Id, Created_by, VoucherType } = req.query;

            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('retailer', Retailer_Id)
                .input('creater', Created_by)
                .input('VoucherType', VoucherType);

            const result = await request.query(
                purchaseOrderQuery(Retailer_Id, Created_by, VoucherType)
            );

            const [
                purchaseOrderGeneralResult,
                purchaseOrderStockResult,
                purchaseOrderStaffResult,
                purchaseOrderParameter,
                purchaseOrderTripResult,
                purchaseInvoiceResult,
            ] = result.recordsets.map(toArray);

            const output = purchaseOrderGeneralResult.map(row => {
                const stockItems = purchaseOrderStockResult.filter(item => isEqualNumber(item.PO_Id, row.PO_Id));
                const staffInvolved = purchaseOrderStaffResult.filter(staff => isEqualNumber(staff.PO_Id, row.PO_Id));
                const parameterInvolved = purchaseOrderParameter.filter(param => isEqualNumber(param.PO_Id, row.PO_Id));
                const tripProducts = purchaseOrderTripResult.filter(trip => isEqualNumber(trip.orderId, row.PO_Id));
                const invoicedProduct = purchaseInvoiceResult.filter(invoice => isEqualNumber(invoice.orderId, row.PO_Id));

                const stockWithParameter = stockItems.map(stock => {
                    const invProduct = invoicedProduct.filter(pro => isEqualNumber(pro.productId, stock.Item_Id));
                    const invProQuantity = invProduct.reduce((acc, item) => Addition(acc, item.quantity), 0)
                    return {
                        ...stock,
                        parameters: parameterInvolved.filter(param => isEqualNumber(param.ItemId, stock.Item_Id)),
                        tripAssigned: tripProducts.filter(trip => isEqualNumber(trip.productId, stock.Item_Id)),
                        invoicedDetails: invProduct,
                        pendingInvoiceWeight: Subraction(stock.Bill_Qty, invProQuantity)
                    }
                })

                return {
                    ...row,
                    Products_List: stockWithParameter,
                    Staff_Involved_List: staffInvolved,
                };
            });

            if (output.length === 0) return noData(res);

            sentData(res, output);

        } catch (e) {
            servError(e, res);
        }
    };

    // ── CREATE ────────────────────────────────────────────────────────────────
    const createPurchaseOrder = async (req, res) => {
        const {
            Retailer_Id, Branch_Id,
            Narration = null, Created_by, Po_Status = 1,
            Product_Array = [], GST_Inclusive = 1, IS_IGST = 0,
            VoucherType = '', Staff_Involved_List = [], Parameter_Array = [],
            Trip_Details = []
        } = req.body;

        const Po_Date = ISOString(req?.body?.Po_Date);

        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(Retailer_Id)
            || !checkIsNumber(Created_by)
            || !checkIsNumber(VoucherType)
            || !Array.isArray(Product_Array) || Product_Array.length === 0
        ) {
            return invalidInput(res, 'Retailer_Id, VoucherType, Product_Array are required');
        }

        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts()).dataArray;

            // ── Get next PO_Id ───────────────────────────────────────────────
            const PO_Id_Get = await getNextId({
                table: 'tbl_Purchase_Order_General_Info',
                column: 'PO_Id'
            });

            if (!PO_Id_Get.status || !checkIsNumber(PO_Id_Get.MaxId)) {
                throw new Error('Failed to get PO_Id');
            }
            const PO_Id = PO_Id_Get.MaxId;

            // ── Financial year ───────────────────────────────────────────────
            const yearResult = await new sql.Request()
                .input('Po_Date', Po_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE
                        Fin_Start_Date <= @Po_Date
                        AND Fin_End_Date >= @Po_Date
                `);

            if (yearResult.recordset.length === 0) throw new Error('Year_Id not found');
            const { Year_Id, Year_Desc } = yearResult.recordset[0];

            // ── Voucher code ─────────────────────────────────────────────────
            const voucherData = await new sql.Request()
                .input('Voucher_Type', VoucherType)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Voucher_Type
                `);

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;
            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            // ── Voucher number sequence ──────────────────────────────────────
            const Po_Vou_Num = Number((await new sql.Request()
                .input('Po_Year', Year_Id)
                .input('VoucherType', VoucherType)
                .query(`
                    SELECT COALESCE(MAX(Po_Vou_Num), 0) AS Po_Vou_Num
                    FROM tbl_Purchase_Order_General_Info
                    WHERE
                        Po_Year    = @Po_Year
                        AND VoucherType = @VoucherType
                `)
            )?.recordset[0]?.Po_Vou_Num) + 1;

            if (!checkIsNumber(Po_Vou_Num)) throw new Error('Failed to get voucher number');

            const Po_Inv_No = `${VoucherCode}/${String(Po_Vou_Num).padStart(6, '0')}/${Year_Desc}`;

            // ── Tax calculation ──────────────────────────────────────────────
            const Total_Invoice_value = RoundNumber(
                Product_Array.reduce((acc, item) => {
                    const Item_Rate = RoundNumber(item?.Item_Rate);
                    const Bill_Qty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);

                    if (isNotTaxableBill) return Addition(acc, Amount);

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                    return Addition(
                        acc,
                        calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add').with_tax
                    );
                }, 0)
            );

            const totalValueBeforeTax = Product_Array.reduce(
                (acc, item) => {
                    const Item_Rate = RoundNumber(item?.Item_Rate);
                    const Bill_Qty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);

                    if (isNotTaxableBill) {
                        return { TotalValue: Addition(acc.TotalValue, Amount), TotalTax: 0 };
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                    const taxInfo = calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add');
                    return {
                        TotalValue: Addition(acc.TotalValue, taxInfo.without_tax),
                        TotalTax: Addition(acc.TotalTax, taxInfo.tax_amount),
                    };
                },
                { TotalValue: 0, TotalTax: 0 }
            );

            // ── Transaction ──────────────────────────────────────────────────
            await transaction.begin();

            // 1. Insert General Info
            const genResult = await new sql.Request(transaction)
                .input('PO_Id', PO_Id)
                .input('Po_Vou_Num', Po_Vou_Num)
                .input('Po_Year', Year_Id)
                .input('Po_Inv_No', Po_Inv_No)
                .input('Po_Date', Po_Date)
                .input('Branch_Id', Branch_Id)
                .input('Retailer_Id', Retailer_Id)
                .input('VoucherType', VoucherType)
                .input('GST_Inclusive', GST_Inclusive)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Narration', Narration)
                .input('Po_Status', Po_Status)
                .input('Created_by', Created_by)
                .input('Altered_by', Created_by)
                .input('Created_on', new Date())
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'INSERT')
                .query(`
                    INSERT INTO tbl_Purchase_Order_General_Info (
                        PO_Id, Po_Vou_Num, Po_Year, Po_Inv_No, Po_Date,
                        Branch_Id, Retailer_Id, VoucherType,
                        GST_Inclusive, IS_IGST,
                        CSGT_Total, SGST_Total, IGST_Total,
                        Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value,
                        Narration, Po_Status,
                        Created_by, Altered_by, Created_on, Alterd_on, Trans_Type
                    )
                    OUTPUT INSERTED.id
                    VALUES (
                        @PO_Id, @Po_Vou_Num, @Po_Year, @Po_Inv_No, @Po_Date,
                        @Branch_Id, @Retailer_Id, @VoucherType,
                        @GST_Inclusive, @IS_IGST,
                        @CSGT_Total, @SGST_Total, @IGST_Total,
                        @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value,
                        @Narration, @Po_Status,
                        @Created_by, @Altered_by, @Created_on, @Alterd_on, @Trans_Type
                    );
                `);

            if (genResult.rowsAffected[0] === 0) throw new Error('Failed to create purchase order');

            const po_uid = genResult.recordset[0].id;

            // 2. Insert Stock Items
            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id);

                const gstPercentage = isIGST ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Free_Qty = Number(product.Free_Qty ?? 0);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                const stockResult = await new sql.Request(transaction)
                    .input('PO_Id', PO_Id)
                    .input('po_uid', po_uid)
                    .input('Godown_Id', toNumber(product.Godown_Id) || null)
                    .input('Serial_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', Free_Qty)
                    .input('Total_Qty', Bill_Qty + Free_Qty)
                    .input('Taxble', Taxble)
                    .input('HSN_Code', productDetails.HSN_Code ?? null)
                    .input('Unit_Id', product.Unit_Id ?? null)
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
                        INSERT INTO tbl_Purchase_Order_Stock_Info (
                            PO_Id, po_uid, Godown_Id, Serial_No, Item_Id,
                            Bill_Qty, Taxable_Rate, Item_Rate, Amount,
                            Free_Qty, Total_Qty, Taxble, HSN_Code,
                            Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo,
                            Final_Amo, Created_on
                        ) VALUES (
                            @PO_Id, @po_uid, @Godown_Id, @Serial_No, @Item_Id,
                            @Bill_Qty, @Taxable_Rate, @Item_Rate, @Amount,
                            @Free_Qty, @Total_Qty, @Taxble, @HSN_Code,
                            @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo,
                            @Final_Amo, @Created_on
                        );
                    `);

                if (stockResult.rowsAffected[0] === 0) throw new Error('Failed to insert stock item');
            }

            // 3. Insert Staff Involved
            for (const staff of toArray(Staff_Involved_List)) {
                await new sql.Request(transaction)
                    .input('po_uid', po_uid)
                    .input('PO_Id', sql.Int, PO_Id)
                    .input('Emp_Id', sql.Int, staff?.Emp_Id)
                    .input('Emp_Type_Id', sql.Int, staff?.Emp_Type_Id)
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Staff_Info (
                            po_uid, PO_Id, Emp_Id, Emp_Type_Id
                        ) VALUES (
                            @po_uid, @PO_Id, @Emp_Id, @Emp_Type_Id
                        );
                    `);
            }

            // 4. Insert Parameters
            for (const param of toArray(Parameter_Array)) {
                await new sql.Request(transaction)
                    .input('PO_Id', sql.BigInt, PO_Id)
                    .input('po_uid', po_uid)
                    .input('ItemId', sql.BigInt, param?.ItemId)
                    .input('ParameterId', sql.BigInt, param?.ParameterId)
                    .input('ParameterValueOne', sql.NVarChar, param?.ParameterValueOne || '')
                    .input('ParameterValueTwo', sql.NVarChar, param?.ParameterValueTwo || '')
                    .input('CreatedAt', sql.DateTimeOffset, new Date())
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Parameter_Info (
                            PO_Id, po_uid, ItemId, ParameterId,
                            ParameterValueOne, ParameterValueTwo, CreatedAt
                        ) VALUES (
                            @PO_Id, @po_uid, @ItemId, @ParameterId,
                            @ParameterValueOne, @ParameterValueTwo, @CreatedAt
                        );
                    `);
            }

            if (Trip_Details.length > 0) {
                for (const trip of toArray(Trip_Details))
                    await new sql.Request(transaction)
                        .input('PO_Id', PO_Id)
                        .input('po_uid', po_uid)
                        .input('trip_id', trip.trip_id)
                        .query(`
                            INSERT INTO tbl_Purchase_Order_Trip_Info (
                                PO_Id, po_uid, trip_id
                            ) VALUES (
                                @PO_Id, @po_uid, @trip_id
                            );`
                        );
            }

            await transaction.commit();

            return success(res, 'Purchase Order Created!');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    // ── UPDATE ────────────────────────────────────────────────────────────────
    const editPurchaseOrder = async (req, res) => {
        const transaction = req.transaction;

        try {
            const alterId = req.alterId;

            const {
                PO_Id, Retailer_Id, Branch_Id, Po_Status,
                Narration = null, Created_by,
                Product_Array = [], GST_Inclusive = 1, IS_IGST = 0,
                Staff_Involved_List = [],
                Parameter_Array = [], Trip_Details = []
            } = req.body;

            const Po_Date = ISOString(req?.body?.Po_Date);

            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

            if (
                !checkIsNumber(PO_Id)
                || !checkIsNumber(Retailer_Id)
                || !checkIsNumber(Created_by)
                || !Array.isArray(Product_Array) || Product_Array.length === 0
            ) {
                return invalidInput(res, 'PO_Id, Retailer_Id, Created_by, Product_Array are required');
            }

            const productsData = (await getProducts()).dataArray;

            // ── Tax totals ───────────────────────────────────────────────────
            const Total_Invoice_value = RoundNumber(
                Product_Array.reduce((acc, item) => {
                    const Item_Rate = RoundNumber(item?.Item_Rate);
                    const Bill_Qty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);

                    if (isNotTaxableBill) return Addition(acc, Amount);

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                    return Addition(
                        acc,
                        calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add').with_tax
                    );
                }, 0)
            );

            const totalValueBeforeTax = Product_Array.reduce(
                (acc, item) => {
                    const Item_Rate = RoundNumber(item?.Item_Rate);
                    const Bill_Qty = RoundNumber(item?.Bill_Qty);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);

                    if (isNotTaxableBill) {
                        return { TotalValue: Addition(acc.TotalValue, Amount), TotalTax: 0 };
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                    const taxInfo = calculateGSTDetails(Amount, gstPercentage, isInclusive ? 'remove' : 'add');
                    return {
                        TotalValue: Addition(acc.TotalValue, taxInfo.without_tax),
                        TotalTax: Addition(acc.TotalTax, taxInfo.tax_amount),
                    };
                },
                { TotalValue: 0, TotalTax: 0 }
            );

            // ── Update General Info ──────────────────────────────────────────
            const genResult = await new sql.Request(transaction)
                .input('PO_Id', PO_Id)
                .input('Po_Date', Po_Date)
                .input('Retailer_Id', Retailer_Id)
                .input('Branch_Id', Branch_Id)
                .input('GST_Inclusive', GST_Inclusive)
                .input('IS_IGST', isIGST ? 1 : 0)
                .input('CSGT_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('SGST_Total', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                .input('IGST_Total', isIGST ? totalValueBeforeTax.TotalTax : 0)
                .input('Round_off', RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                .input('Total_Before_Tax', totalValueBeforeTax.TotalValue)
                .input('Total_Tax', totalValueBeforeTax.TotalTax)
                .input('Narration', Narration)
                .input('Po_Status', Po_Status ?? null)
                .input('Altered_by', Created_by)
                .input('Alter_Id', alterId)
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'UPDATE')
                .query(`
                    UPDATE tbl_Purchase_Order_General_Info
                    SET
                        Po_Date             = @Po_Date,
                        Retailer_Id         = @Retailer_Id,
                        Branch_Id           = @Branch_Id,
                        GST_Inclusive       = @GST_Inclusive,
                        IS_IGST             = @IS_IGST,
                        CSGT_Total          = @CSGT_Total,
                        SGST_Total          = @SGST_Total,
                        IGST_Total          = @IGST_Total,
                        Round_off           = @Round_off,
                        Total_Invoice_value = @Total_Invoice_value,
                        Total_Before_Tax    = @Total_Before_Tax,
                        Total_Tax           = @Total_Tax,
                        Narration           = @Narration,
                        Po_Status           = @Po_Status,
                        Altered_by          = @Altered_by,
                        Alter_Id            = @Alter_Id,
                        Alterd_on           = @Alterd_on,
                        Trans_Type          = @Trans_Type
                    WHERE PO_Id = @PO_Id;
                `);

            if (genResult.rowsAffected[0] === 0) throw new Error('Failed to update purchase order');

            // ── Get po_uid (the `id` column from general info) ────────────────
            const uidResult = await new sql.Request(transaction)
                .input('PO_Id', PO_Id)
                .query(`SELECT id FROM tbl_Purchase_Order_General_Info WHERE PO_Id = @PO_Id`);

            const po_uid = uidResult.recordset[0]?.id;
            if (!po_uid) throw new Error('po_uid (id) not found for PO_Id ' + PO_Id);

            // ── Delete & re-insert child rows ────────────────────────────────
            await new sql.Request(transaction)
                .input('PO_Id', PO_Id)
                .query(`
                    DELETE FROM tbl_Purchase_Order_Stock_Info WHERE PO_Id = @PO_Id;
                    DELETE FROM tbl_Purchase_Order_Staff_Info WHERE PO_Id = @PO_Id;
                    DELETE FROM tbl_Purchase_Order_Parameter_Info WHERE PO_Id = @PO_Id;
                `);

            // Re-insert stock items
            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id);

                const gstPercentage = isIGST ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Free_Qty = Number(product.Free_Qty ?? 0);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                const stockResult = await new sql.Request(transaction)
                    .input('PO_Id', PO_Id)
                    .input('po_uid', po_uid)
                    .input('Godown_Id', toNumber(product.Godown_Id) || null)
                    .input('Serial_No', i + 1)
                    .input('Item_Id', product.Item_Id)
                    .input('Bill_Qty', Bill_Qty)
                    .input('Taxable_Rate', itemRateGst.base_amount)
                    .input('Item_Rate', Item_Rate)
                    .input('Amount', Amount)
                    .input('Free_Qty', Free_Qty)
                    .input('Total_Qty', Bill_Qty + Free_Qty)
                    .input('Taxble', Taxble)
                    .input('HSN_Code', productDetails.HSN_Code ?? null)
                    .input('Unit_Id', product.Unit_Id ?? null)
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
                        INSERT INTO tbl_Purchase_Order_Stock_Info (
                            PO_Id, po_uid, Godown_Id, Serial_No, Item_Id,
                            Bill_Qty, Taxable_Rate, Item_Rate, Amount,
                            Free_Qty, Total_Qty, Taxble, HSN_Code,
                            Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate,
                            Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo,
                            Final_Amo, Created_on
                        ) VALUES (
                            @PO_Id, @po_uid, @Godown_Id, @Serial_No, @Item_Id,
                            @Bill_Qty, @Taxable_Rate, @Item_Rate, @Amount,
                            @Free_Qty, @Total_Qty, @Taxble, @HSN_Code,
                            @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate,
                            @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo,
                            @Final_Amo, @Created_on
                        );
                    `);

                if (stockResult.rowsAffected[0] === 0) throw new Error('Failed to update stock item');
            }

            // Re-insert staff
            for (const staff of toArray(Staff_Involved_List)) {
                await new sql.Request(transaction)
                    .input('po_uid', po_uid)
                    .input('PO_Id', sql.Int, PO_Id)
                    .input('Emp_Id', sql.Int, staff?.Emp_Id)
                    .input('Emp_Type_Id', sql.Int, staff?.Emp_Type_Id)
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Staff_Info (
                            po_uid, PO_Id, Emp_Id, Emp_Type_Id
                        ) VALUES (
                            @po_uid, @PO_Id, @Emp_Id, @Emp_Type_Id
                        );
                    `);
            }

            // Re-insert parameters
            for (const param of toArray(Parameter_Array)) {
                await new sql.Request(transaction)
                    .input('PO_Id', sql.BigInt, PO_Id)
                    .input('po_uid', po_uid)
                    .input('ItemId', sql.BigInt, param?.ItemId)
                    .input('ParameterId', sql.BigInt, param?.ParameterId)
                    .input('ParameterValueOne', sql.NVarChar, param?.ParameterValueOne || '')
                    .input('ParameterValueTwo', sql.NVarChar, param?.ParameterValueTwo || '')
                    .input('CreatedAt', sql.DateTimeOffset, new Date())
                    .query(`
                        INSERT INTO tbl_Purchase_Order_Parameter_Info (
                            PO_Id, po_uid, ItemId, ParameterId,
                            ParameterValueOne, ParameterValueTwo, CreatedAt
                        ) VALUES (
                            @PO_Id, @po_uid, @ItemId, @ParameterId,
                            @ParameterValueOne, @ParameterValueTwo, @CreatedAt
                        );
                    `);
            }

            if (Trip_Details.length > 0) {
                for (const trip of toArray(Trip_Details))
                    await new sql.Request(transaction)
                        .input('PO_Id', PO_Id)
                        .input('po_uid', po_uid)
                        .input('trip_id', trip.trip_id)
                        .query(`
                            INSERT INTO tbl_Purchase_Order_Trip_Info (
                                PO_Id, po_uid, trip_id
                            ) VALUES (
                                @PO_Id, @po_uid, @trip_id
                            );`
                        );
            }

            await transaction.commit();
            success(res, 'Purchase Order Updated!');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    // ── PRINT API ─────────────────────────────────────────────────────────────
    const getPurchaseOrderPrint = async (req, res) => {
        try {
            const { PO_Id } = req.query;

            if (!PO_Id) return invalidInput(res, 'PO_Id is required');

            const poIdArray = String(PO_Id)
                .split(',')
                .map(id => parseInt(id.trim(), 10))
                .filter(id => !isNaN(id) && id > 0);

            if (poIdArray.length === 0) return invalidInput(res, 'Valid PO_Id is required');

            const poIdList = poIdArray.join(', ');

            const request = new sql.Request()
                .query(`
                    -- COMPANY DETAILS
                    SELECT TOP (1)
                        Company_Name as companyName,
                        Company_Address as companyAddress,
                        Telephone_Number as compnayMobileNumber,
                        Gst_Number as companyGstNumber
                    FROM tbl_Company_Master;
                    
                    -- PURCHASE ORDER DETAILS
                    SELECT
                        pogi.PO_Id as poId,
                        pogi.Po_Inv_No as poNumber,
                        pogi.Po_Date as poDate,
                        pogi.Retailer_Id as retailerId,
                        r.Retailer_Name as retailerName,
                        COALESCE(r.Mobile_No, '') as retailerMobile,
                        COALESCE(r.Reatailer_Address, '') as retailerAddress,
                        COALESCE(r.Reatailer_City, '') as retailerCity,
                        COALESCE(stat.State_Name, '') as retailerState,
                        '' as retailerStateCode,
                        COALESCE(r.Gstno, '') as retailerGstNumber,
                        pogi.CSGT_Total as poCGST,
                        pogi.SGST_Total as poSGST,
                        pogi.IGST_Total as poIGST,
                        pogi.Round_off as poRoundOff,
                        pogi.Total_Before_Tax as poTaxableValue,
                        pogi.Total_Invoice_value as poValue,
                        pogi.IS_IGST as isIGST,
                        pogi.Narration as narration
                    FROM tbl_Purchase_Order_General_Info AS pogi
                    LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pogi.Retailer_Id
                    LEFT JOIN tbl_State_Master AS stat ON stat.State_Id = r.State_Id
                    WHERE pogi.PO_Id IN (${poIdList});

                    -- INVOICE PRODUCT DETAILS
                    SELECT
                        posi.PO_Id as poId,
                        posi.Item_Id as productId,
                        pm.Product_Name as productName,
                        posi.HSN_Code as hsnCode,
                        posi.Bill_Qty as quantity,
                        posi.Taxable_Rate as itemRateWithoutTax,
                        posi.Item_Rate as itemRateWithTax,
                        posi.Amount as itemAmount,
                        posi.Tax_Rate as gstPercentage,
                        posi.Cgst as cgstPercentage,
                        posi.Cgst_Amo as cgstAmount,
                        posi.Sgst as sgstPercentage,
                        posi.Sgst_Amo as sgstAmount,
                        posi.Igst as igstPercentage,
                        posi.Igst_Amo as igstAmount,
                        posi.Final_Amo as finalAmount,
                        u.Units as uom
                    FROM tbl_Purchase_Order_Stock_Info AS posi
                    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = posi.Item_Id
                    LEFT JOIN tbl_UOM AS u ON u.Unit_Id = posi.Unit_Id
                    WHERE posi.PO_Id IN (${poIdList});
                `);

            const result = await request;

            const companydata = toArray(result.recordsets[0]);
            const poGeneralData = toArray(result.recordsets[1]);
            const productData = toArray(result.recordsets[2]);

            if (poGeneralData.length > 0) {
                const resData = poGeneralData.map(row => ({
                    ...row,
                    productsDetails: productData.filter(fil => isEqualNumber(fil.poId, row.poId))
                }));
                sentData(res, resData, { companydata });
            } else {
                noData(res);
            }

        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getPurchaseOrder,
        createPurchaseOrder,
        editPurchaseOrder,
        getPurchaseOrderPrint,
    };
};

export default PurchaseOrder();
