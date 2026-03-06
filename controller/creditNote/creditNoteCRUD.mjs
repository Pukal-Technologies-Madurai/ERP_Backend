import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, Division, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../../helper_functions.mjs';
import { invalidInput, servError, dataFound, noData, success } from '../../../res.mjs';
import { getNextId, getProducts } from '../../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../../middleware/taxCalculator.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

function buildBulkCreditNoteRows(Product_Array, productsData, flags = {}) {
    const { isInclusive = false, isNotTaxableBill = false, isIGST = false } = flags;
    const stockRows = [];

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
        const pack = toNumber(details?.Pack);
        const Act_Qty = toNumber(product?.Act_Qty) || Bill_Qty;
        const Alt_Act_Qty = Division(Act_Qty, pack);
        const Alt_Bill_Qty = Division(Bill_Qty, pack);

        stockRows.push({
            S_No: toNumber(product?.S_No) || index + 1,
            Item_Id: toNumber(product.Item_Id),
            Bill_Qty,
            Alt_Bill_Qty,
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
            Act_unit_Id: product.Unit_Id ?? '',
            Alt_Act_Unit_Id: product.Unit_Id ?? '',
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
    });

    return { stockRows };
}

export const getCreditNote = async (req, res) => {
    try {
        const { Retailer_Id, Cancel_status, Created_by, VoucherType, CR_Id } = req.query;
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('retailer', Retailer_Id)
            .input('cancel', Cancel_status)
            .input('creater', Created_by)
            .input('VoucherType', VoucherType)
            .input('CR_Id', CR_Id)
            .query(`
                DECLARE @FilteredInvoice TABLE (CR_Id INT);
                INSERT INTO @FilteredInvoice (CR_Id)
                SELECT CR_Id
                FROM tbl_Credit_Note_Gen_Info
                WHERE 
                    CR_Date BETWEEN @Fromdate AND @Todate
                    ${checkIsNumber(Retailer_Id) ? ' AND Retailer_Id = @retailer ' : ''}
                    ${checkIsNumber(Cancel_status) ? ' AND Cancel_status = @cancel ' : ''}
                    ${checkIsNumber(Created_by) ? ' AND Created_by = @creater ' : ''}
                    ${checkIsNumber(VoucherType) ? ' AND Voucher_Type = @VoucherType ' : ''}
                    ${checkIsNumber(CR_Id) ? ' AND CR_Id = @CR_Id ' : ''};
                SELECT 
                    gi.CR_Id, gi.CR_Inv_No, gi.Voucher_Type, gi.CR_No, gi.CR_Year,
                    gi.CR_Date, gi.Branch_Id, gi.Retailer_Id, gi.Narration, gi.Cancel_status,
                    gi.GST_Inclusive, gi.IS_IGST, gi.CSGT_Total, gi.SGST_Total, gi.IGST_Total, 
                    gi.Total_Expences, gi.Round_off, gi.Total_Before_Tax, gi.Total_Tax, 
                    gi.Total_Invoice_value, gi.Alter_Id, gi.Created_by, gi.Created_on, 
                    gi.Stock_Item_Ledger_Name, gi.Ref_Inv_Number, gi.Ref_Inv_Date,
                    gi.paymentDueDays, gi.Mailing_Name, gi.Mailing_Address, gi.Mailing_Phone,
                    gi.Mailing_City, gi.Mailing_GST, gi.Mailing_State,
                    COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                FROM 
                    tbl_Credit_Note_Gen_Info AS gi
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = gi.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = gi.Branch_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = gi.Created_by
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = gi.Voucher_Type
                WHERE gi.CR_Id IN (SELECT CR_Id FROM @FilteredInvoice)
                ORDER BY gi.CR_Id desc;
                SELECT
                    oi.*,
                    pm.Product_Id,
                    COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                    COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                    COALESCE(u.Units, 'not available') AS UOM
                FROM tbl_Credit_Note_Stock_Info AS oi
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                WHERE oi.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice)
                ORDER BY oi.S_No ASC;
                SELECT 
                    exp.*, 
                    em.Account_name AS Expence_Name, 
                    CASE  
                        WHEN exp.Expence_Value_DR > 0 THEN exp.Expence_Value_DR 
                        ELSE -exp.Expence_Value_CR
                    END AS Expence_Value
                FROM tbl_Credit_Note_Expence_Info AS exp
                LEFT JOIN tbl_Account_Master AS em ON em.Acc_Id = exp.Expense_Id
                WHERE exp.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice);
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Credit_Note_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice);
            `);

        const result = await request;

        const GeneralInfo = toArray(result.recordsets[0]);
        const Products_List = toArray(result.recordsets[1]);
        const Expence_Array = toArray(result.recordsets[2]);
        const Staffs_Array = toArray(result.recordsets[3]);

        if (GeneralInfo.length > 0) {
            const resData = GeneralInfo.map(row => ({
                ...row,
                Products_List: Products_List.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id)),
                Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id)),
                Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id))
            }));
            dataFound(res, resData);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
}

export const getCreditNoteById = async (req, res) => {
    try {
        const { CR_Id } = req.query;

        const request = new sql.Request()
            .input('CR_Id', CR_Id)
            .query(`
                DECLARE @FilteredInvoice TABLE (CR_Id INT);
                INSERT INTO @FilteredInvoice (CR_Id)
                SELECT CR_Id
                FROM tbl_Credit_Note_Gen_Info
                WHERE 1=1 
                ${checkIsNumber(CR_Id) ? ' AND CR_Id = @CR_Id ' : ''};
                SELECT 
                    gi.CR_Id, gi.CR_Inv_No, gi.Voucher_Type, gi.CR_No, gi.CR_Year,
                    gi.CR_Date, gi.Branch_Id, gi.Retailer_Id, gi.Narration, gi.Cancel_status,
                    gi.GST_Inclusive, gi.IS_IGST, gi.CSGT_Total, gi.SGST_Total, gi.IGST_Total, 
                    gi.Total_Expences, gi.Round_off, gi.Total_Before_Tax, gi.Total_Tax, 
                    gi.Total_Invoice_value, gi.Alter_Id, gi.Created_by, gi.Created_on, 
                    gi.Stock_Item_Ledger_Name, gi.Ref_Inv_Number, gi.Ref_Inv_Date,
                    gi.paymentDueDays, gi.Mailing_Name, gi.Mailing_Address, gi.Mailing_Phone,
                    gi.Mailing_City, gi.Mailing_GST, gi.Mailing_State,
                    COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                    COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
                FROM 
                    tbl_Credit_Note_Gen_Info AS gi
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = gi.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = gi.Branch_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = gi.Created_by
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = gi.Voucher_Type
                WHERE gi.CR_Id IN (SELECT CR_Id FROM @FilteredInvoice)
                ORDER BY gi.CR_Id desc;
                SELECT
                    oi.*,
                    pm.Product_Id,
                    COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                    COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                    COALESCE(u.Units, 'not available') AS UOM
                FROM tbl_Credit_Note_Stock_Info AS oi
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                WHERE oi.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice)
                ORDER BY oi.S_No ASC;
                SELECT 
                    exp.*, 
                    em.Account_name AS Expence_Name, 
                    CASE  
                        WHEN exp.Expence_Value_DR > 0 THEN exp.Expence_Value_DR 
                        ELSE -exp.Expence_Value_CR
                    END AS Expence_Value
                FROM tbl_Credit_Note_Expence_Info AS exp
                LEFT JOIN tbl_Account_Master AS em ON em.Acc_Id = exp.Expense_Id
                WHERE exp.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice);
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Credit_Note_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.CR_Id IN (SELECT DISTINCT CR_Id FROM @FilteredInvoice);
            `);

        const result = await request;

        const GeneralInfo = toArray(result.recordsets[0]);
        const Products_List = toArray(result.recordsets[1]);
        const Expence_Array = toArray(result.recordsets[2]);
        const Staffs_Array = toArray(result.recordsets[3]);

        if (GeneralInfo.length > 0) {
            const resData = GeneralInfo.map(row => ({
                ...row,
                Products_List: Products_List.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id)),
                Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id)),
                Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.CR_Id, row.CR_Id))
            }));
            dataFound(res, resData);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
}

export const createCreditNote = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const {
            Retailer_Id, Branch_Id, CR_No, Voucher_Type = '', Cancel_status = 1, Ref_Inv_Number = '', Ref_Inv_Date,
            Narration = null, Created_by, GST_Inclusive = 1, IS_IGST = 0, Round_off = 0,
            Product_Array = [], Expence_Array = [], Staffs_Array = [], Stock_Item_Ledger_Name = '',
            paymentDueDays = 0, Mailing_Name = '', Mailing_Address = '', Mailing_Phone = '',
            Mailing_City = '', Mailing_GST = '', Mailing_State = ''
        } = req.body;

        const CR_Date = req?.body?.CR_Date ? ISOString(req?.body?.CR_Date) : ISOString();
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

        const Do_Year_Get = await new sql.Request()
            .input('CR_Date', CR_Date)
            .query(`
                SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE 
                    Fin_Start_Date <= @CR_Date 
                    AND Fin_End_Date >= @CR_Date`
            );

        if (Do_Year_Get.recordset.length === 0) throw new Error('Year_Id not found');

        const { Year_Id, Year_Desc } = Do_Year_Get.recordset[0];

        const voucherData = await new sql.Request()
            .input('Voucher_Type', Voucher_Type)
            .query(`
                SELECT Voucher_Code 
                FROM tbl_Voucher_Type 
                WHERE Vocher_Type_Id = @Voucher_Type`
            );

        const VoucherCode = voucherData.recordset[0]?.Voucher_Code;

        if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

        const CR_No_Gen = Number((await new sql.Request()
            .input('CR_Year', Year_Id)
            .input('Voucher_Type', Voucher_Type)
            .query(`
                SELECT COALESCE(MAX(CR_No), 0) AS CR_No
                FROM tbl_Credit_Note_Gen_Info
                WHERE CR_Year = @CR_Year
                AND Voucher_Type = @Voucher_Type`
            )
        ).recordset[0]?.CR_No) + 1;

        if (!checkIsNumber(CR_No_Gen)) throw new Error('Failed to get CR_No');

        const CR_Inv_No = `${VoucherCode}/${createPadString(CR_No_Gen, 6)}/${Year_Desc}`;

        const getCR_Id = await getNextId({ table: 'tbl_Credit_Note_Gen_Info', column: 'CR_Id' });

        if (!getCR_Id.status || !checkIsNumber(getCR_Id.MaxId)) throw new Error('Failed to get CR_Id');

        const CR_Id = getCR_Id.MaxId;

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

        const totalValueBeforeTaxValues = (() => {
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

                return { TotalValue, TotalTax };
            }, { TotalValue: 0, TotalTax: 0 });

            const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => Addition(
                acc,
                IS_IGST ? exp?.Igst_Amo : Addition(exp?.Cgst_Amo, exp?.Sgst_Amo)
            ), 0);

            return {
                TotalValue: productTax.TotalValue,
                TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
            }
        })();

        const CGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
        const SGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
        const IGST = isIGST ? totalValueBeforeTaxValues.TotalTax : 0;

        await transaction.begin();

        const request = new sql.Request(transaction)
            .input('CR_Id', sql.Int, CR_Id)
            .input('CR_No', sql.Int, CR_No_Gen)
            .input('CR_Year', sql.Int, Year_Id)
            .input('CR_Inv_No', sql.NVarChar, CR_Inv_No)
            .input('Voucher_Type', sql.Int, Voucher_Type)
            .input('CR_Date', sql.Date, CR_Date)
            .input('Retailer_Id', sql.BigInt, Retailer_Id)
            .input('Branch_Id', sql.Int, Branch_Id)
            .input('GST_Inclusive', sql.Int, GST_Inclusive)
            .input('IS_IGST', sql.Int, isIGST ? 1 : 0)
            .input('CSGT_Total', sql.Decimal(18, 2), CGST)
            .input('SGST_Total', sql.Decimal(18, 2), SGST)
            .input('IGST_Total', sql.Decimal(18, 2), IGST)
            .input('Total_Expences', sql.Decimal(18, 2), TotalExpences)
            .input('Round_off', sql.Decimal(18, 2), Round_off)
            .input('Total_Before_Tax', sql.Decimal(18, 2), totalValueBeforeTaxValues.TotalValue)
            .input('Total_Tax', sql.Decimal(18, 2), totalValueBeforeTaxValues.TotalTax)
            .input('Total_Invoice_value', sql.Decimal(18, 2), Math.round(Total_Invoice_value))
            .input('Narration', sql.NVarChar, Narration)
            .input('Cancel_status', sql.Int, toNumber(Cancel_status))
            .input('Stock_Item_Ledger_Name', sql.NVarChar, Stock_Item_Ledger_Name)
            .input('Alter_Id', sql.BigInt, Alter_Id)
            .input('Created_by', sql.BigInt, Created_by)
            .input('Created_on', sql.DateTime, new Date())
            .input('Ref_Inv_Number', sql.NVarChar, Ref_Inv_Number)
            .input('Ref_Inv_Date', sql.Date, Ref_Inv_Date ? new Date(Ref_Inv_Date) : null)
            .input('paymentDueDays', sql.Int, toNumber(paymentDueDays))
            .input('Mailing_Name', sql.NVarChar, Mailing_Name)
            .input('Mailing_Address', sql.NVarChar, Mailing_Address)
            .input('Mailing_Phone', sql.NVarChar, Mailing_Phone)
            .input('Mailing_City', sql.NVarChar, Mailing_City)
            .input('Mailing_GST', sql.NVarChar, Mailing_GST)
            .input('Mailing_State', sql.NVarChar, Mailing_State)
            .query(`
                INSERT INTO tbl_Credit_Note_Gen_Info (
                    CR_Id, CR_No, CR_Year, CR_Inv_No, Voucher_Type, CR_Date, Retailer_Id, Branch_Id, 
                    GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, 
                    Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value, Narration, 
                    Cancel_status, Stock_Item_Ledger_Name, Alter_Id, Created_by, Created_on, 
                    Ref_Inv_Number, Ref_Inv_Date, paymentDueDays, Mailing_Name, Mailing_Address, 
                    Mailing_Phone, Mailing_City, Mailing_GST, Mailing_State
                ) VALUES (
                    @CR_Id, @CR_No, @CR_Year, @CR_Inv_No, @Voucher_Type, @CR_Date, @Retailer_Id, @Branch_Id, 
                    @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, 
                    @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Narration, 
                    @Cancel_status, @Stock_Item_Ledger_Name, @Alter_Id, @Created_by, @Created_on, 
                    @Ref_Inv_Number, @Ref_Inv_Date, @paymentDueDays, @Mailing_Name, @Mailing_Address, 
                    @Mailing_Phone, @Mailing_City, @Mailing_GST, @Mailing_State
                )`
            );

        const result = await request;

        if (result.rowsAffected[0] === 0) {
            throw new Error('Failed to create general info in credit note')
        }

        const { stockRows } = buildBulkCreditNoteRows(toArray(Product_Array), productsData, {
            isInclusive,
            isNotTaxableBill,
            isIGST
        });

        const productInsertingRequest = new sql.Request(transaction)
            .input('CR_Date', CR_Date)
            .input('CR_Id', CR_Id)
            .input('SalesJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
            .query(`
                INSERT INTO tbl_Credit_Note_Stock_Info (
                    CR_Date, CR_Id, S_No, Item_Id,
                    Bill_Qty, Alt_Bill_Qty, Act_Qty, Alt_Act_Qty,
                    Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                    Taxble, Taxable_Rate, HSN_Code,
                    Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id,
                    Taxable_Amount, Tax_Rate,
                    Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on,
                    Batch_Name
                )
                SELECT
                    @CR_Date, @CR_Id, ISNULL(p.S_No, ROW_NUMBER() OVER (ORDER BY (SELECT 1))), p.Item_Id,
                    p.Bill_Qty, p.Alt_Bill_Qty, p.Act_Qty, p.Alt_Act_Qty,
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
                    Alt_Bill_Qty DECIMAL(18,2) '$.Alt_Bill_Qty',
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
                ) AS p;`
            );

        await productInsertingRequest;

        if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
            for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                const exp = Expence_Array[expInd];
                const Expence_Value_DR = toNumber(exp?.Expence_Value) >= 0 ? toNumber(exp?.Expence_Value) : 0;
                const Expence_Value_CR = toNumber(exp?.Expence_Value) < 0 ? Math.abs(toNumber(exp?.Expence_Value)) : 0;

                const request = new sql.Request(transaction)
                    .input('CR_Id', CR_Id)
                    .input('Sno', expInd + 1)
                    .input('Expense_Id', toNumber(exp?.Expense_Id))
                    .input('Expence_Value_DR', Expence_Value_DR)
                    .input('Expence_Value_CR', Expence_Value_CR)
                    .query(`
                        INSERT INTO tbl_Credit_Note_Expence_Info (
                            CR_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                        ) VALUES (
                            @CR_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                        )`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Expence row in credit note creation');
                }
            }
        }

        if (Array.isArray(Staffs_Array) && Staffs_Array.length > 0) {
            for (const staff of Staffs_Array) {
                const request = new sql.Request(transaction)
                    .input('CR_Id', CR_Id)
                    .input('Emp_Id', toNumber(staff?.Emp_Id))
                    .input('Emp_Type_Id', toNumber(staff?.Emp_Type_Id))
                    .query(`
                        INSERT INTO tbl_Credit_Note_Staff_Info (
                            CR_Id, Emp_Id, Emp_Type_Id
                        ) VALUES (
                            @CR_Id, @Emp_Id, @Emp_Type_Id
                        )`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Staff row in credit note creation');
                }
            }
        }

        await transaction.commit();

        success(res, 'Credit Note created!', [], { CR_Id })
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res)
    }
}

export const updateCreditNote = async (req, res) => {
    const transaction = req.transaction || new sql.Transaction();

    try {
        const {
            CR_Id, Retailer_Id, Branch_Id, Voucher_Type = '', Cancel_status = 1, Ref_Inv_Number = '', Ref_Inv_Date,
            Narration = null, Altered_by, GST_Inclusive = 1, IS_IGST = 0, Round_off = 0,
            Product_Array = [], Expence_Array = [], Staffs_Array = [], Stock_Item_Ledger_Name = '',
            paymentDueDays = 0, Mailing_Name = '', Mailing_Address = '', Mailing_Phone = '',
            Mailing_City = '', Mailing_GST = '', Mailing_State = ''
        } = req.body;

        const CR_Date = req?.body?.CR_Date ? ISOString(req?.body?.CR_Date) : ISOString();
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        if (
            !checkIsNumber(CR_Id) || !checkIsNumber(Retailer_Id) || !checkIsNumber(Altered_by)
            || !Array.isArray(Product_Array) || Product_Array.length === 0
        ) {
            return invalidInput(res, 'Please select Required Fields')
        }

        const productsData = (await getProducts()).dataArray;
        const Alter_Id = req.alterId || Math.floor(Math.random() * 999999);

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

        const totalValueBeforeTaxValues = (() => {
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

                return { TotalValue, TotalTax };
            }, { TotalValue: 0, TotalTax: 0 });

            const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => Addition(
                acc,
                IS_IGST ? exp?.Igst_Amo : Addition(exp?.Cgst_Amo, exp?.Sgst_Amo)
            ), 0);

            return {
                TotalValue: productTax.TotalValue,
                TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
            }
        })();

        const CGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
        const SGST = isIGST ? 0 : totalValueBeforeTaxValues.TotalTax / 2;
        const IGST = isIGST ? totalValueBeforeTaxValues.TotalTax : 0;

        if (!req.transaction) await transaction.begin();

        const request = new sql.Request(transaction)
            .input('CR_Id', sql.Int, CR_Id)
            .input('CR_Date', sql.Date, CR_Date)
            .input('Retailer_Id', sql.BigInt, Retailer_Id)
            .input('Branch_Id', sql.Int, Branch_Id)
            .input('GST_Inclusive', sql.Int, GST_Inclusive)
            .input('IS_IGST', sql.Int, isIGST ? 1 : 0)
            .input('CSGT_Total', sql.Decimal(18, 2), CGST)
            .input('SGST_Total', sql.Decimal(18, 2), SGST)
            .input('IGST_Total', sql.Decimal(18, 2), IGST)
            .input('Total_Expences', sql.Decimal(18, 2), TotalExpences)
            .input('Round_off', sql.Decimal(18, 2), Round_off)
            .input('Total_Before_Tax', sql.Decimal(18, 2), totalValueBeforeTaxValues.TotalValue)
            .input('Total_Tax', sql.Decimal(18, 2), totalValueBeforeTaxValues.TotalTax)
            .input('Total_Invoice_value', sql.Decimal(18, 2), Math.round(Total_Invoice_value))
            .input('Narration', sql.NVarChar, Narration)
            .input('Cancel_status', sql.Int, toNumber(Cancel_status))
            .input('Stock_Item_Ledger_Name', sql.NVarChar, Stock_Item_Ledger_Name)
            .input('Trans_Type', sql.NVarChar, 'UPDATE')
            .input('Alter_Id', sql.BigInt, Alter_Id)
            .input('Altered_by', sql.BigInt, Altered_by)
            .input('Alterd_on', sql.DateTime, new Date())
            .input('Ref_Inv_Number', sql.NVarChar, Ref_Inv_Number)
            .input('Ref_Inv_Date', sql.Date, Ref_Inv_Date ? new Date(Ref_Inv_Date) : null)
            .input('paymentDueDays', sql.Int, toNumber(paymentDueDays))
            .input('Mailing_Name', sql.NVarChar, Mailing_Name)
            .input('Mailing_Address', sql.NVarChar, Mailing_Address)
            .input('Mailing_Phone', sql.NVarChar, Mailing_Phone)
            .input('Mailing_City', sql.NVarChar, Mailing_City)
            .input('Mailing_GST', sql.NVarChar, Mailing_GST)
            .input('Mailing_State', sql.NVarChar, Mailing_State)
            .query(`
                UPDATE tbl_Credit_Note_Gen_Info 
                SET 
                    CR_Date = @CR_Date,
                    Branch_Id = @Branch_Id,
                    Retailer_Id = @Retailer_Id,
                    Narration = @Narration,
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
                    Ref_Inv_Number = @Ref_Inv_Number,
                    Ref_Inv_Date = @Ref_Inv_Date,
                    Alter_Id = @Alter_Id,
                    Altered_by = @Altered_by,
                    Alterd_on = @Alterd_on,
                    paymentDueDays = @paymentDueDays,
                    Mailing_Name = @Mailing_Name,
                    Mailing_Address = @Mailing_Address,
                    Mailing_Phone = @Mailing_Phone,
                    Mailing_City = @Mailing_City,
                    Mailing_GST = @Mailing_GST,
                    Mailing_State = @Mailing_State
                WHERE
                    CR_Id = @CR_Id;`
            );

        const result = await request;

        if (result.rowsAffected[0] === 0) {
            throw new Error('Failed to update general info in credit note')
        }

        const deleteDetailsRows = new sql.Request(transaction)
            .input('CR_Id', CR_Id)
            .query(`
                DELETE FROM tbl_Credit_Note_Stock_Info WHERE CR_Id = @CR_Id;
                DELETE FROM tbl_Credit_Note_Expence_Info WHERE CR_Id = @CR_Id;
                DELETE FROM tbl_Credit_Note_Staff_Info WHERE CR_Id = @CR_Id;`
            );

        await deleteDetailsRows;

        const { stockRows } = buildBulkCreditNoteRows(toArray(Product_Array), productsData, {
            isInclusive,
            isNotTaxableBill,
            isIGST
        });

        const productInsertingRequest = new sql.Request(transaction)
            .input('CR_Date', CR_Date)
            .input('CR_Id', CR_Id)
            .input('SalesJson', sql.NVarChar(sql.MAX), JSON.stringify({ rows: stockRows }))
            .query(`
                INSERT INTO tbl_Credit_Note_Stock_Info (
                    CR_Date, CR_Id, S_No, Item_Id,
                    Bill_Qty, Alt_Bill_Qty, Act_Qty, Alt_Act_Qty,
                    Item_Rate, GoDown_Id, Amount, Free_Qty, Total_Qty,
                    Taxble, Taxable_Rate, HSN_Code,
                    Unit_Id, Unit_Name, Act_unit_Id, Alt_Act_Unit_Id,
                    Taxable_Amount, Tax_Rate,
                    Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on,
                    Batch_Name
                )
                SELECT
                    @CR_Date, @CR_Id, ISNULL(p.S_No, ROW_NUMBER() OVER (ORDER BY (SELECT 1))), p.Item_Id,
                    p.Bill_Qty, p.Alt_Bill_Qty, p.Act_Qty, p.Alt_Act_Qty,
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
                    Alt_Bill_Qty DECIMAL(18,2) '$.Alt_Bill_Qty',
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
                ) AS p;`
            );

        await productInsertingRequest;

        if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
            for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                const exp = Expence_Array[expInd];
                const Expence_Value_DR = toNumber(exp?.Expence_Value) >= 0 ? toNumber(exp?.Expence_Value) : 0;
                const Expence_Value_CR = toNumber(exp?.Expence_Value) < 0 ? Math.abs(toNumber(exp?.Expence_Value)) : 0;

                const request = new sql.Request(transaction)
                    .input('CR_Id', CR_Id)
                    .input('Sno', expInd + 1)
                    .input('Expense_Id', toNumber(exp?.Expense_Id))
                    .input('Expence_Value_DR', Expence_Value_DR)
                    .input('Expence_Value_CR', Expence_Value_CR)
                    .query(`
                        INSERT INTO tbl_Credit_Note_Expence_Info (
                            CR_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                        ) VALUES (
                            @CR_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                        )`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Expence row in credit note update');
                }
            }
        }

        if (Array.isArray(Staffs_Array) && Staffs_Array.length > 0) {
            for (const staff of Staffs_Array) {
                const request = new sql.Request(transaction)
                    .input('CR_Id', CR_Id)
                    .input('Emp_Id', toNumber(staff?.Emp_Id))
                    .input('Emp_Type_Id', toNumber(staff?.Emp_Type_Id))
                    .query(`
                        INSERT INTO tbl_Credit_Note_Staff_Info (
                            CR_Id, Emp_Id, Emp_Type_Id
                        ) VALUES (
                            @CR_Id, @Emp_Id, @Emp_Type_Id
                        )`
                    );

                const result = await request;

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Staff row in credit note update');
                }
            }
        }

        if (!req.transaction) await transaction.commit();

        success(res, 'Credit Note updated successfully!')
    } catch (e) {
        if (!req.transaction && transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res)
    }
}

export const deleteCreditNote = async (req, res) => {
    try {
        const { CR_Id } = req.body;

        if (!checkIsNumber(CR_Id)) {
            return invalidInput(res, 'CR_Id is required');
        }

        const request = new sql.Request()
            .input('CR_Id', CR_Id)
            .query(`
                DELETE FROM tbl_Credit_Note_Stock_Info WHERE CR_Id = @CR_Id;
                DELETE FROM tbl_Credit_Note_Expence_Info WHERE CR_Id = @CR_Id;
                DELETE FROM tbl_Credit_Note_Staff_Info WHERE CR_Id = @CR_Id;
                DELETE FROM tbl_Credit_Note_Gen_Info WHERE CR_Id = @CR_Id;
            `);

        await request;
        success(res, 'Credit Note deleted successfully!');
    } catch (e) {
        servError(e, res);
    }
}
