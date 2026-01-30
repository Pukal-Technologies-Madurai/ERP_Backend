import sql from 'mssql'
import { dataFound, invalidInput, noData, servError, success, failed } from '../../res.mjs';
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

    async function getAccountMappings(transaction) {
        const accountRequest = new sql.Request(transaction);
        const accountResult = await accountRequest.query(`
            SELECT Acc_Id, AC_Reason 
            FROM tbl_Default_AC_Master 
            WHERE AC_Reason IN ('CGST', 'SGST', 'IGST', 'ROUNDOFF')`
        );

        const mappings = {};
        accountResult.recordset.forEach(row => {
            mappings[row.AC_Reason] = row.Acc_Id;
        });

        return mappings;
    }

    async function insertExpenseEntries(transaction, Do_Id, amounts, accountMappings) {
        let sNo = 1;

        if (amounts.cgst > 0 && accountMappings.CGST) {
            const cgstRequest = new sql.Request(transaction);
            cgstRequest.input('Do_Id', sql.Int, Do_Id);
            cgstRequest.input('Sno', sql.Int, sNo++);
            cgstRequest.input('Expense_Id', sql.Int, accountMappings.CGST);
            cgstRequest.input('Expence_Value_DR', sql.Decimal(18, 2), amounts.cgst);
            cgstRequest.input('Expence_Value_CR', sql.Decimal(18, 2), 0);

            await cgstRequest.query(`
                INSERT INTO tbl_Sales_Delivery_Expence_Info (
                    Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                ) VALUES (
                    @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                );`
            );
        }

        if (amounts.sgst > 0 && accountMappings.SGST) {
            const sgstRequest = new sql.Request(transaction);
            sgstRequest.input('Do_Id', sql.Int, Do_Id);
            sgstRequest.input('Sno', sql.Int, sNo++);
            sgstRequest.input('Expense_Id', sql.Int, accountMappings.SGST);
            sgstRequest.input('Expence_Value_DR', sql.Decimal(18, 2), amounts.sgst);
            sgstRequest.input('Expence_Value_CR', sql.Decimal(18, 2), 0);

            await sgstRequest.query(`
                INSERT INTO tbl_Sales_Delivery_Expence_Info (
                    Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                ) VALUES (
                    @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                );`
            );
        }

        if (amounts.igst > 0 && accountMappings.IGST) {
            const igstRequest = new sql.Request(transaction);
            igstRequest.input('Do_Id', sql.Int, Do_Id);
            igstRequest.input('Sno', sql.Int, sNo++);
            igstRequest.input('Expense_Id', sql.Int, accountMappings.IGST);
            igstRequest.input('Expence_Value_DR', sql.Decimal(18, 2), amounts.igst);
            igstRequest.input('Expence_Value_CR', sql.Decimal(18, 2), 0);

            await igstRequest.query(`
            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
            ) VALUES (
                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
            );`);
        }

        if (amounts.roundOff !== 0 && accountMappings.ROUNDOFF) {
            const roundOffRequest = new sql.Request(transaction);
            roundOffRequest.input('Do_Id', sql.Int, Do_Id);
            roundOffRequest.input('Sno', sql.Int, sNo++);
            roundOffRequest.input('Expense_Id', sql.Int, accountMappings.ROUNDOFF);
            roundOffRequest.input('Expence_Value_DR', sql.Decimal(18, 2), 0);
            roundOffRequest.input('Expence_Value_CR', sql.Decimal(18, 2), Math.abs(amounts.roundOff));

            await roundOffRequest.query(`
            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
            ) VALUES (
                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
            )
        `);
        }
    }

    const salesDeliveryCreation = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Retailer_Id,
                Delivery_Person_Id,
                Branch_Id,
                Narration = null,
                Created_by,
                Delivery_Location,
                Payment_Mode,
                Payment_Status,
                Delivery_Status,
                Payment_Ref_No = null,
                Delivery_Time = null,
                Product_Array = [],
                So_No,
                VoucherType = "",
                GST_Inclusive = 1,
                IS_IGST = 0,
            } = req.body;

            const Do_Date = ISOString(req?.body?.Do_Date);
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill
                ? "zerotax"
                : isInclusive
                    ? "remove"
                    : "add";

            if (
                !Do_Date ||
                !Retailer_Id ||
                !Delivery_Person_Id ||
                !Created_by ||
                !VoucherType ||
                !Array.isArray(Product_Array) ||
                Product_Array.length === 0
            ) {
                return invalidInput(res, "Please select Required Fields");
            }

            await transaction.begin();

            const soCheckResult = await new sql.Request(transaction).input(
                "So_No",
                sql.Int,
                So_No
            ).query(`
                SELECT COUNT(*) AS count
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE So_No = @So_No`);

            if (soCheckResult.recordset[0].count > 0) {
                await new sql.Request(transaction).input("So_No", sql.Int, So_No)
                    .query(`
                    UPDATE tbl_Sales_Delivery_Gen_Info
                    SET Cancel_status = 1
                    WHERE So_No = @So_No`);

                await transaction.commit();
                return success(res, "Order Moved to Sales Delivery .");
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            const yearData = await new sql.Request(transaction).query(
                `SELECT Year_Desc, Id FROM tbl_Year_Master WHERE Active_Status IN ('Yes', 'YES')`
            );

            if (!yearData.recordset[0]) {
                throw new Error("Failed to fetch active year");
            }

            const Do_Year_Desc = yearData.recordset[0].Year_Desc;
            const Year_Master_Id = yearData.recordset[0].Id;

            const branchData = await new sql.Request(transaction)
                .input("Branch_Id", sql.Int, Branch_Id)
                .query(
                    `SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @Branch_Id`
                );

            if (!branchData.recordset[0]) {
                throw new Error("Failed to fetch Branch Code");
            }

            const BranchCode = branchData.recordset[0].BranchCode;

            const voucherData = await new sql.Request(transaction)
                .input("Voucher_Type", sql.Int, VoucherType)
                .query(
                    `SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Voucher_Type`
                );

            if (!voucherData.recordset[0]) {
                throw new Error("Failed to fetch Voucher Code");
            }

            const VoucherCode = voucherData.recordset[0].Voucher_Code;

            const doNoResult = await new sql.Request(transaction)
                .input("Branch_Id", sql.Int, Branch_Id)
                .input("Do_Year", sql.Int, Year_Master_Id)
                .input("Voucher_Type", sql.Int, VoucherType).query(`
                SELECT COALESCE(MAX(Do_No), 0) + 1 AS Do_No
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE Branch_Id = @Branch_Id
                    AND Do_Year = @Do_Year
                    AND Voucher_Type = @Voucher_Type`);

            const Do_Branch_Inv_Id = doNoResult.recordset[0].Do_No;
            if (!checkIsNumber(Do_Branch_Inv_Id)) {
                throw new Error("Failed to get Order Id");
            }

            const FinancialYear = `${Do_Year_Desc}`;
            const Do_Inv_No = `${VoucherCode}/${createPadString(
                Do_Branch_Inv_Id,
                6
            )}/${FinancialYear}`;

            const getDo_Id = await getNextId({
                table: "tbl_Sales_Delivery_Gen_Info",
                column: "Do_Id",
            });
            if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) {
                throw new Error("Failed to get Do_Id");
            }

            const Do_Id = getDo_Id.MaxId;

            let Total_Invoice_value = 0;
            let Total_Before_Tax = 0;
            let Total_Tax = 0;
            let CSGT_Total = 0;
            let SGST_Total = 0;
            let IGST_Total = 0;
            let Round_off = 0;
            let totalCGST = 0;
            let totalSGST = 0;
            let totalIGST = 0;

            for (const item of Product_Array) {
                const product = findProductDetails(productsData, item.Item_Id);
                if (!product) continue;

                const itemRate = RoundNumber(item.Item_Rate);
                const billQty = RoundNumber(item.Bill_Qty);
                const Amount = Multiplication(billQty, itemRate);
                const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                if (isNotTaxableBill) {
                    Total_Before_Tax = Addition(Total_Before_Tax, Amount);
                    Total_Invoice_value = Addition(Total_Invoice_value, Amount);
                    continue;
                }

                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                Total_Before_Tax = Addition(Total_Before_Tax, gstInfo.base_amount);
                Total_Tax = Addition(Total_Tax, gstInfo.tax_amount);
                Total_Invoice_value = Addition(Total_Invoice_value, gstInfo.with_tax);

                if (isIGST) {
                    IGST_Total = Addition(IGST_Total, gstInfo.tax_amount);
                    totalIGST = Addition(totalIGST, gstInfo.tax_amount);
                } else {
                    const halfTax = gstInfo.tax_amount / 2;
                    CSGT_Total = Addition(CSGT_Total, halfTax);
                    SGST_Total = Addition(SGST_Total, halfTax);
                    totalCGST = Addition(totalCGST, halfTax);
                    totalSGST = Addition(totalSGST, halfTax);
                }
            }

            Total_Invoice_value = RoundNumber(Total_Invoice_value);
            Round_off = RoundNumber(
                Math.round(Total_Invoice_value) - Total_Invoice_value
            );
            Total_Invoice_value = Math.round(Total_Invoice_value);

            await new sql.Request(transaction)
                .input("Do_Id", sql.Int, Do_Id)
                .input("Do_No", sql.Int, Do_Branch_Inv_Id)
                .input("Do_Year", sql.Int, Year_Master_Id)
                .input("Voucher_Type", sql.Int, VoucherType)
                .input("Do_Inv_No", sql.NVarChar(100), Do_Inv_No)
                .input("Do_Date", sql.Date, Do_Date)
                .input("Retailer_Id", sql.Int, Retailer_Id)
                .input("Delivery_Person_Id", sql.Int, Number(Delivery_Person_Id) || 0)
                .input("Branch_Id", sql.Int, Branch_Id)
                .input("GST_Inclusive", sql.Int, GST_Inclusive)
                .input("CSGT_Total", sql.Decimal(18, 2), CSGT_Total)
                .input("SGST_Total", sql.Decimal(18, 2), SGST_Total)
                .input("IGST_Total", sql.Decimal(18, 2), IGST_Total)
                .input("IS_IGST", sql.Int, isIGST ? 1 : 0)
                .input("Round_off", sql.Decimal(18, 2), Round_off)
                .input("Total_Invoice_value", sql.Decimal(18, 2), Total_Invoice_value)
                .input("Total_Before_Tax", sql.Decimal(18, 2), Total_Before_Tax)
                .input("Total_Tax", sql.Decimal(18, 2), Total_Tax)
                .input("Narration", sql.NVarChar(sql.MAX), Narration)
                .input("Cancel_status", sql.Int, 1)
                .input("So_No", sql.Int, So_No)
                .input("Delivery_Status", sql.Int, Delivery_Status)
                .input("Delivery_Time", sql.NVarChar(50), Delivery_Time)
                .input("Delivery_Location", sql.NVarChar(250), Delivery_Location)
                .input("Payment_Ref_No", sql.NVarChar(255), Payment_Ref_No)
                .input("Payment_Mode", sql.Int, Payment_Mode)
                .input("Payment_Status", sql.Int, Payment_Status)
                .input("Alter_Id", sql.BigInt, Alter_Id)
                .input("Created_by", sql.BigInt, Created_by)
                .input("Created_on", sql.DateTime, new Date())
                .input("Trans_Type", sql.NVarChar(50), "INSERT").query(`
                INSERT INTO tbl_Sales_Delivery_Gen_Info (
                    Do_Id, Do_No, Do_Inv_No, Voucher_Type, Do_Date, Do_Year, Retailer_Id, 
                    Delivery_Person_Id, Branch_Id, GST_Inclusive, CSGT_Total, SGST_Total, 
                    IGST_Total, Round_off, Total_Before_Tax, Total_Tax, Total_Invoice_value, 
                    Narration, Cancel_status, So_No, Delivery_Status, Delivery_Time, 
                    Delivery_Location, Trans_Type, Payment_Mode, Payment_Ref_No, 
                    Payment_Status, Alter_Id, Created_by, Created_on
                ) VALUES (
                    @Do_Id, @Do_No, @Do_Inv_No, @Voucher_Type, @Do_Date, @Do_Year, @Retailer_Id, 
                    @Delivery_Person_Id, @Branch_Id, @GST_Inclusive, @CSGT_Total, @SGST_Total, 
                    @IGST_Total, @Round_off, @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, 
                    @Narration, @Cancel_status, @So_No, @Delivery_Status, @Delivery_Time, 
                    @Delivery_Location, @Trans_Type, @Payment_Mode, @Payment_Ref_No, 
                    @Payment_Status, @Alter_Id, @Created_by, @Created_on
                );
            `);

            await new sql.Request(transaction)
                .input("So_Id", sql.Int, So_No)
                .query(
                    `UPDATE tbl_Sales_Order_Gen_Info SET isConverted = 2 WHERE So_Id = @So_Id`
                );

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(
                    productsData,
                    product.Item_Id
                );
                if (!productDetails) continue;

                const gstPercentage = isIGST
                    ? productDetails.Igst_P
                    : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(
                    Item_Rate,
                    gstPercentage,
                    taxType
                );
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                const cgstPer = !isNotTaxableBill && !isIGST ? gstInfo.cgst_per : 0;
                const igstPer = !isNotTaxableBill && isIGST ? gstInfo.igst_per : 0;
                const Cgst_Amo = !isNotTaxableBill && !isIGST ? gstInfo.cgst_amount : 0;
                const Igst_Amo = !isNotTaxableBill && isIGST ? gstInfo.igst_amount : 0;

                await new sql.Request(transaction)
                    .input("Do_Date", sql.Date, Do_Date)
                    .input("Delivery_Order_Id", sql.Int, Do_Id)
                    .input("S_No", sql.Int, i + 1)
                    .input("Item_Id", sql.Int, product.Item_Id)
                    .input("Bill_Qty", sql.Decimal(18, 2), Bill_Qty)
                    .input("Item_Rate", sql.Decimal(18, 2), Item_Rate)
                    .input("GoDown_Id", sql.Int, 1)
                    .input("Amount", sql.Decimal(18, 2), Amount)
                    .input("Free_Qty", sql.Decimal(18, 2), 0)
                    .input("Total_Qty", sql.Decimal(18, 2), Bill_Qty)
                    .input("Taxble", sql.Bit, Taxble)
                    .input("Taxable_Rate", sql.Decimal(18, 2), itemRateGst.base_amount)
                    .input("HSN_Code", sql.NVarChar(50), productDetails.HSN_Code)
                    .input("Unit_Id", sql.Int, product.UOM ?? 0)
                    .input("Unit_Name", sql.NVarChar(50), product.Units ?? "")
                    .input("Taxable_Amount", sql.Decimal(18, 2), gstInfo.base_amount)
                    .input("Tax_Rate", sql.Decimal(18, 2), gstPercentage)
                    .input("Cgst", sql.Decimal(18, 2), cgstPer)
                    .input("Cgst_Amo", sql.Decimal(18, 2), Cgst_Amo)
                    .input("Sgst", sql.Decimal(18, 2), cgstPer)
                    .input("Sgst_Amo", sql.Decimal(18, 2), Cgst_Amo)
                    .input("Igst", sql.Decimal(18, 2), igstPer)
                    .input("Igst_Amo", sql.Decimal(18, 2), Igst_Amo)
                    .input("Final_Amo", sql.Decimal(18, 2), gstInfo.with_tax)
                    .input("Created_on", sql.DateTime, new Date()).query(`
                    INSERT INTO tbl_Sales_Delivery_Stock_Info (
                        Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, GoDown_Id, 
                        Amount, Free_Qty, Total_Qty, Taxble, Taxable_Rate, HSN_Code, Unit_Id, 
                        Unit_Name, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, Sgst, Sgst_Amo, 
                        Igst, Igst_Amo, Final_Amo, Created_on
                    ) VALUES (
                        @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @GoDown_Id, 
                        @Amount, @Free_Qty, @Total_Qty, @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, 
                        @Unit_Name, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, 
                        @Igst, @Igst_Amo, @Final_Amo, @Created_on
                    );
                `);
            }

            const expenseEntries = [];
            if (!isNotTaxableBill) {
                if (!isIGST) {
                    if (totalCGST > 0) {
                        expenseEntries.push({
                            type: "CGST",
                            amount: totalCGST,
                            isCredit: false,
                        });
                    }
                    if (totalSGST > 0) {
                        expenseEntries.push({
                            type: "SGST",
                            amount: totalSGST,
                            isCredit: false,
                        });
                    }
                } else if (totalIGST > 0) {
                    expenseEntries.push({
                        type: "IGST",
                        amount: totalIGST,
                        isCredit: false,
                    });
                }
            }

            if (Round_off !== 0) {
                expenseEntries.push({
                    type: "ROUNDOFF",
                    amount: Math.abs(Round_off),
                    isCredit: Round_off < 0,
                });
            }

            const defaultAccounts = await new sql.Request(transaction).query(`
                SELECT Acc_Id, AC_Reason 
                FROM tbl_Default_AC_Master 
                WHERE AC_Reason IN ('CGST', 'SGST', 'IGST', 'ROUNDOFF', 'GST', 'TAX', 'ROUND')
            `);

            const accountMap = {};
            defaultAccounts.recordset.forEach((account) => {
                const reason = (account.AC_Reason || "").toUpperCase();
                accountMap[reason] = account.Acc_Id;
            });

            for (let i = 0; i < expenseEntries.length; i++) {
                const expense = expenseEntries[i];
                let accountId = accountMap[expense.type];

                if (!accountId) {
                    if (
                        expense.type === "CGST" ||
                        expense.type === "SGST" ||
                        expense.type === "IGST"
                    ) {
                        accountId = accountMap["GST"] || accountMap["TAX"];
                    } else if (expense.type === "ROUNDOFF") {
                        accountId = accountMap["ROUND"];
                    }
                }

                if (!accountId) {
                    console.error(`No account mapping found for ${expense.type}`);
                    continue;
                }

                if (expense.type === "ROUNDOFF") {
                    const amount = Round_off;
                    const isCredit = Round_off < 0;

                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input(
                            "Expence_Value_Dr",
                            sql.Decimal(18, 2),
                            isCredit ? 0 : amount
                        )
                        .input(
                            "Expence_Value_Cr",
                            sql.Decimal(18, 2),
                            isCredit ? amount : 0
                        ).query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                            );
                        `);
                } else {
                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input("Expence_Value_Dr", sql.Decimal(18, 2), expense.amount)
                        .input("Expence_Value_Cr", sql.Decimal(18, 2), 0).query(`
                INSERT INTO tbl_Sales_Delivery_Expence_Info (
                    Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                ) VALUES (
                    @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                );
            `);
                }
            }

            await transaction.commit();
            success(res, "Delivery Created Successfully!");
        } catch (error) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(error, res);
        }
    };

    const editDeliveryOrder = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Do_Id,
                Retailer_Id,
                Branch_Id,
                Narration,
                Created_by,
                Product_Array,
                GST_Inclusive = 1,
                IS_IGST = 0,
                Delivery_Status,
                Delivery_Time,
                Delivery_Location,
                Delivery_Latitude,
                Delivery_Longitude,
                Collected_By,
                Collected_Status,
                Payment_Mode,
                Payment_Status,
                Payment_Ref_No,
            } = req.body;

            const Do_Date = ISOString(req?.body?.Do_Date);
            const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
            const isInclusive = isEqualNumber(GST_Inclusive, 1);
            const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
            const isIGST = isEqualNumber(IS_IGST, 1);
            const taxType = isNotTaxableBill
                ? "zerotax"
                : isInclusive
                    ? "remove"
                    : "add";

            if (
                !checkIsNumber(Do_Id) ||
                !checkIsNumber(Retailer_Id) ||
                !checkIsNumber(Created_by) ||
                !Array.isArray(Product_Array) ||
                Product_Array.length === 0
            ) {
                return invalidInput(
                    res,
                    "Do_Id, Retailer_Id, Created_by, Product_Array is Required"
                );
            }

            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            let Total_Invoice_value = 0;
            let Total_Before_Tax = 0;
            let Total_Tax = 0;
            let CSGT_Total = 0;
            let SGST_Total = 0;
            let IGST_Total = 0;
            let Round_off = 0;
            let totalCGST = 0;
            let totalSGST = 0;
            let totalIGST = 0;

            for (const item of Product_Array) {
                const product = findProductDetails(productsData, item.Item_Id);
                if (!product) continue;

                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = RoundNumber(item?.Bill_Qty);
                const Amount = Multiplication(billQty, itemRate);
                const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                if (isNotTaxableBill) {
                    Total_Before_Tax = Addition(Total_Before_Tax, Amount);
                    Total_Invoice_value = Addition(Total_Invoice_value, Amount);
                    continue;
                }

                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                Total_Before_Tax = Addition(Total_Before_Tax, gstInfo.base_amount);
                Total_Tax = Addition(Total_Tax, gstInfo.tax_amount);
                Total_Invoice_value = Addition(Total_Invoice_value, gstInfo.with_tax);

                if (isIGST) {
                    IGST_Total = Addition(IGST_Total, gstInfo.tax_amount);
                    totalIGST = Addition(totalIGST, gstInfo.tax_amount);
                } else {
                    const halfTax = gstInfo.tax_amount / 2;
                    CSGT_Total = Addition(CSGT_Total, halfTax);
                    SGST_Total = Addition(SGST_Total, halfTax);
                    totalCGST = Addition(totalCGST, halfTax);
                    totalSGST = Addition(totalSGST, halfTax);
                }
            }

            Total_Invoice_value = RoundNumber(Total_Invoice_value);
            Round_off = RoundNumber(
                Math.round(Total_Invoice_value) - Total_Invoice_value
            );
            Total_Invoice_value = Math.round(Total_Invoice_value);

            const Total_Expences = isNotTaxableBill
                ? Round_off  // Only round-off if non-taxable
                : Addition(Addition(Addition(CSGT_Total, SGST_Total), IGST_Total), Round_off); // Taxes + Round_off
            await transaction.begin();

            await new sql.Request(transaction)
                .input("Do_Id", sql.Int, Do_Id)
                .query(
                    `DELETE FROM tbl_Sales_Delivery_Stock_Info WHERE Delivery_Order_Id = @Do_Id`
                );

            await new sql.Request(transaction)
                .input("Do_Id", sql.Int, Do_Id)
                .query(
                    `DELETE FROM tbl_Sales_Delivery_Expence_Info WHERE Do_Id = @Do_Id`
                );

            await new sql.Request(transaction)
                .input("doid", Do_Id)
                .input("date", Do_Date)
                .input("retailer", Retailer_Id)
                .input("branch", Branch_Id)
                .input("GST_Inclusive", GST_Inclusive)
                .input("CSGT_Total", CSGT_Total)
                .input("SGST_Total", SGST_Total)
                .input("IGST_Total", IGST_Total)
                .input("IS_IGST", isIGST ? 1 : 0)
                .input("Total_Expences", Total_Expences)
                .input("roundoff", Round_off)
                .input("totalinvoice", Total_Invoice_value)
                .input("Total_Before_Tax", Total_Before_Tax)
                .input("Total_Tax", Total_Tax)
                .input("narration", Narration)
                .input("alterby", Created_by)
                .input("Alter_Id", Alter_Id)
                .input("alteron", new Date())
                .input("deliverystatus", Delivery_Status)
                .input("deliveryTime", Delivery_Time)
                .input("deliveryLocation", Delivery_Location)
                .input("deliverylatitude", Delivery_Latitude)
                .input("deliverylongitute", Delivery_Longitude)
                .input("collectedby", Collected_By)
                .input("collectedStatus", Collected_Status)
                .input("paymentMode", Payment_Mode)
                .input("paymentStatus", Payment_Status)
                .input("paymentrefno", Payment_Ref_No)
                .input("Trans_Type", "UPDATE").query(`
                UPDATE tbl_Sales_Delivery_Gen_Info
                SET
                    Do_Date = @date,
                    Retailer_Id = @retailer,
                    Branch_Id = @branch,
                    GST_Inclusive = @GST_Inclusive,
                    IS_IGST = @IS_IGST,
                    CSGT_Total = @CSGT_Total,
                    SGST_Total = @SGST_Total,
                    IGST_Total = @IGST_Total,
                    Total_Expences=@Total_Expences,
                    Round_off = @roundoff,
                    Total_Invoice_value = @totalinvoice,
                    Total_Before_Tax = @Total_Before_Tax,
                    Total_Tax = @Total_Tax,
                    Narration = @narration,  
                    Altered_by = @alterby,
                    Alter_Id = @Alter_Id,
                    Delivery_Time = @deliveryTime,
                    Delivery_Status = @deliverystatus,
                    Delivery_Location = @deliveryLocation,
                    Delivery_Latitude = @deliverylatitude,
                    Delivery_Longitude = @deliverylongitute,
                    Collected_By = @collectedby,
                    Collected_Status = @collectedStatus,
                    Payment_Mode = @paymentMode,
                    Payment_Status = @paymentStatus,
                    Payment_Ref_No = @paymentrefno,
                    Alterd_on = @alteron,
                    Trans_Type = @Trans_Type
                WHERE Do_Id = @doid;`
                );

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(
                    productsData,
                    product.Item_Id
                );
                if (!productDetails) continue;

                const gstPercentage = isIGST
                    ? productDetails.Igst_P
                    : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(
                    Item_Rate,
                    gstPercentage,
                    taxType
                );
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                await new sql.Request(transaction)
                    .input("Do_Date", Do_Date ? Do_Date : new Date())
                    .input("Delivery_Order_Id", Do_Id)
                    .input("S_No", i + 1)
                    .input("Item_Id", product.Item_Id)
                    .input("Bill_Qty", Bill_Qty)
                    .input("Item_Rate", Item_Rate)
                    .input("Amount", Amount)
                    .input("Free_Qty", 0)
                    .input("Total_Qty", Bill_Qty)
                    .input("Taxble", Taxble)
                    .input("Taxable_Rate", itemRateGst.base_amount)
                    .input("HSN_Code", productDetails.HSN_Code)
                    .input("GoDown_Id", 1)
                    .input("Unit_Id", product.UOM ?? "")
                    .input("Unit_Name", product.Units ?? "")
                    .input("Taxable_Amount", gstInfo.base_amount)
                    .input("Tax_Rate", gstPercentage)
                    .input("Cgst", !isNotTaxableBill && !isIGST ? gstInfo.cgst_per : 0)
                    .input(
                        "Cgst_Amo",
                        !isNotTaxableBill && !isIGST ? gstInfo.cgst_amount : 0
                    )
                    .input("Sgst", !isNotTaxableBill && !isIGST ? gstInfo.cgst_per : 0)
                    .input(
                        "Sgst_Amo",
                        !isNotTaxableBill && !isIGST ? gstInfo.cgst_amount : 0
                    )
                    .input("Igst", !isNotTaxableBill && isIGST ? gstInfo.igst_per : 0)
                    .input(
                        "Igst_Amo",
                        !isNotTaxableBill && isIGST ? gstInfo.igst_amount : 0
                    )
                    .input("Final_Amo", gstInfo.with_tax)
                    .input("Created_on", new Date()).query(`
                    INSERT INTO tbl_Sales_Delivery_Stock_Info (
                        Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, 
                        Free_Qty, Total_Qty, GoDown_Id, Taxble, Taxable_Rate, HSN_Code, 
                        Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, 
                        Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    ) VALUES (
                        @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, 
                        @Free_Qty, @Total_Qty, @GoDown_Id, @Taxble, @Taxable_Rate, @HSN_Code, 
                        @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, 
                        @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                    );
                `);
            }

            const expenseEntries = [];
            if (!isNotTaxableBill) {
                if (!isIGST) {
                    if (totalCGST > 0) {
                        expenseEntries.push({
                            type: "CGST",
                            amount: totalCGST,
                            isCredit: false,
                        });
                    }
                    if (totalSGST > 0) {
                        expenseEntries.push({
                            type: "SGST",
                            amount: totalSGST,
                            isCredit: false,
                        });
                    }
                } else if (totalIGST > 0) {
                    expenseEntries.push({
                        type: "IGST",
                        amount: totalIGST,
                        isCredit: false,
                    });
                }
            }

            if (Round_off !== 0) {
                expenseEntries.push({
                    type: "ROUNDOFF",
                    amount: Math.abs(Round_off),
                    isCredit: Round_off < 0,
                });
            }

            const defaultAccounts = await new sql.Request(transaction).query(`
                SELECT Acc_Id, AC_Reason 
                FROM tbl_Default_AC_Master 
                WHERE AC_Reason IN ('CGST', 'SGST', 'IGST', 'ROUNDOFF', 'GST', 'TAX', 'ROUND')
            `);

            const accountMap = {};
            defaultAccounts.recordset.forEach((account) => {
                const reason = (account.AC_Reason || "").toUpperCase();
                accountMap[reason] = account.Acc_Id;
            });

            for (let i = 0; i < expenseEntries.length; i++) {
                const expense = expenseEntries[i];
                let accountId = accountMap[expense.type];

                // Fallback logic for account mapping
                if (!accountId) {
                    if (
                        expense.type === "CGST" ||
                        expense.type === "SGST" ||
                        expense.type === "IGST"
                    ) {
                        accountId = accountMap["GST"] || accountMap["TAX"];
                    } else if (expense.type === "ROUNDOFF") {
                        accountId = accountMap["ROUND"];
                    }
                }

                if (!accountId) {
                    console.error(`No account mapping found for ${expense.type}`);
                    continue;
                }

                if (expense.type === "ROUNDOFF") {
                    const amount = Round_off; // keep negative value if present
                    const isCredit = Round_off < 0;

                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input(
                            "Expence_Value_Dr",
                            sql.Decimal(18, 2),
                            isCredit ? 0 : amount
                        )
                        .input(
                            "Expence_Value_Cr",
                            sql.Decimal(18, 2),
                            isCredit ? amount : 0
                        ).query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                            );`
                        );
                } else {
                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input("Expence_Value_Dr", sql.Decimal(18, 2), expense.amount)
                        .input("Expence_Value_Cr", sql.Decimal(18, 2), 0).query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                            );`
                        );
                }
            }
            await transaction.commit();
            success(res, "Delivery updated successfully");
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

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
        const { Retailer_Id, Delivery_Status, Created_by, Delivery_Person_Id, Route_Id, Area_Id, Sales_Person_Id,Branch_Id } = req.query;

        try {

            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
   const deliveryStatus =
            Delivery_Status !== undefined && Delivery_Status !== ""
                ? Number(Delivery_Status)
                : undefined;
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
                         LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                         LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                         LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
                                               WHERE
                                                   CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
                                                   AND CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
                                           )
                                   SELECT DISTINCT
                         so.Do_Id AS Delivery_Order_id,
                         so.*,
                         rm.Retailer_Name AS Retailer_Name,
                         bm.BranchName AS Branch_Name,
                         cb.Name AS Created_BY_Name,
                         rmt.Route_Name AS Routename,
                         am.Area_Name AS AreaName,
                         rmt.Route_Id AS Route_Id,
                         rm.Area_Id AS Area_Id,
                         st.Status AS DeliveryStatusName,
                         sgi.SO_Date AS SalesDate,
                     
                        
                         COALESCE(spUser.Name, 'not available') AS Sales_Person_Name,
                     
                        
                         COALESCE(dpUser.Name, 'not available') AS Delivery_Person_Name,
                     
                          ISNULL((acm.Acc_Id),0) As Acc_Id,
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
                     LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
                     LEFT JOIN tbl_Status AS st ON st.Status_Id = so.Delivery_Status
                     LEFT JOIN tbl_ERP_Cost_Center AS sp ON sp.User_Id = so.Delivery_Person_Id
                     LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = so.Branch_Id
                     LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
                     LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
                     LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
                     LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi ON sgi.So_Id = so.So_No
                     LEFT JOIN tbl_Account_Master AS acm ON acm.ERP_Id=rm.ERP_Id
                  
                     LEFT JOIN tbl_Users AS spUser ON spUser.UserId = sgi.Sales_Person_Id
                     
                     
                     LEFT JOIN tbl_ERP_Cost_Center AS ecc ON ecc.Cost_Center_Id = so.Delivery_Person_Id
                     LEFT JOIN tbl_Users AS dpUser ON dpUser.UserId = ecc.User_Id
                     
                     LEFT JOIN tbl_Trip_Details AS td ON td.Delivery_Id = so.Do_Id
                                           
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
                query += ` AND dpUser.UserId = @Delivery_Person_Id`;
            }
            if (Sales_Person_Id) {
                query += ` AND spUser.UserId = @Sales_Person_Id`;
            }
            if (Route_Id) {
                query += ` AND rmt.Route_Id = @Route_Id`;
            }
            if (Area_Id) {
                query += ` AND rm.Area_Id = @Area_Id`;
            }
          if (Branch_Id) {
                query += ` AND so.Branch_Id = @Branch_Id`;
            }
           if (deliveryStatus !== undefined) {
            query += ` AND so.Delivery_Status = @Delivery_Status`;
        }

            query += ` ORDER BY so.Do_Id DESC`;

            const request = new sql.Request();
            request.input('from', Fromdate);
            request.input('to', Todate);
            request.input('retailer', Retailer_Id);
            request.input('creater', Created_by);
            request.input('Delivery_Person_Id', sql.Int, Delivery_Person_Id);
            request.input('Sales_Person_Id', sql.Int, Sales_Person_Id);
            request.input('Route_Id', sql.Int, Route_Id);
            request.input('Area_Id', sql.Int, Area_Id);
            request.input('Branch_Id', sql.Int, Branch_Id);
               if (deliveryStatus !== undefined) {
            request.input('Delivery_Status', sql.Int, deliveryStatus);
        }

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

    // const editmobileApi = async (req, res) => {
    //     const {
    //         Do_Id, Retailer_Id, Delivery_Person_Id,
    //         Delivery_Status,
    //         Delivery_Time, Delivery_Location, Delivery_Latitude, Delivery_Longitude, Payment_Mode, Payment_Status, Payment_Ref_No, Altered_by, Altered_on
    //     } = req.body;

    //     const Do_Date = ISOString(req?.body?.Do_Date);


    //     if (
    //         !checkIsNumber(Do_Id)
    //         || !checkIsNumber(Delivery_Person_Id)

    //     ) {
    //         return invalidInput(res, 'Do_Id, Delivery_Person_Id is Required')
    //     }

    //     const transaction = new sql.Transaction();

    //     try {

    //         await transaction.begin();

    //         const request = new sql.Request(transaction)
    //             .input('doid', Do_Id)
    //             .input('deliveryperson', Delivery_Person_Id)
    //             .input('deliverystatus', Delivery_Status)
    //             .input('deliveryTime', Delivery_Time)
    //             .input('deliveryLocation', Delivery_Location)
    //             .input('deliverylatitude', Delivery_Latitude)
    //             .input('deliverylongitute', Delivery_Longitude)
    //             .input('paymentMode', Payment_Mode)
    //             .input('paymentStatus', Payment_Status)
    //             .input('paymentrefno', Payment_Ref_No)
    //             .input('Trans_Type', 'UPDATE')
    //             .input('Altered_by', Altered_by)
    //             .input('Alteron', new Date())
    //             .query(`
    //                 UPDATE
    //                     tbl_Sales_Delivery_Gen_Info
    //                 SET
    //                     Delivery_Person_Id = @deliveryperson,
    //                     Delivery_Time=@deliveryTime,
    //                     Delivery_Status=@deliverystatus,
    //                    Delivery_Location=@deliveryLocation,
    //                    Delivery_Latitude=@deliverylatitude,
    //                    Delivery_Longitude=@deliverylongitute,
    //                    Payment_Mode=@paymentMode,
    //                    Payment_Status=@paymentStatus,
    //                    Payment_Ref_No=@paymentrefno,
    //                     Trans_Type = @Trans_Type,
    //                     Altered_by=@Altered_by,
    //                     Alterd_on=@Alteron
    //                 WHERE
    //                     Do_Id = @doid;
    //                 `
    //             );

    //         const result = await request;

    //         if (result.rowsAffected[0] === 0) {

    //             throw new Error('Failed to update order, Try again')
    //         }

    //         await transaction.commit();
    //         success(res, 'Changes Saved!')

    //     } catch (e) {
    //         if (transaction._aborted === false) {
    //             await transaction.rollback();
    //         }
    //         servError(e, res)
    //     }
    // }

const editmobileApi = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const {
            Do_Id, Retailer_Id, Delivery_Person_Id,
            Delivery_Status, Delivery_Time, Delivery_Location, 
            Delivery_Latitude, Delivery_Longitude, Payment_Mode, 
            Payment_Status, Payment_Ref_No, Altered_by, Altered_on,Cancel_status,
            Product_Array,
            Branch_Id, Narration, GST_Inclusive = 1, IS_IGST = 0
        } = req.body;

        const Do_Date = ISOString(req?.body?.Do_Date);
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill
            ? "zerotax"
            : isInclusive
                ? "remove"
                : "add";

        if (!checkIsNumber(Do_Id) || !checkIsNumber(Delivery_Person_Id)) {
            return invalidInput(res, 'Do_Id, Delivery_Person_Id is Required');
        }

        await transaction.begin();

     
        const originalStockRequest = new sql.Request(transaction)
            .input('doid', Do_Id)
            .query(`
                SELECT 
                   *
                FROM tbl_Sales_Delivery_Stock_Info 
                WHERE Delivery_Order_Id = @doid
                ORDER BY S_No
            `);

        const originalStockResult = await originalStockRequest;
        const originalStockItems = originalStockResult.recordset;

        
        const returnItems = [];
        
        if (Product_Array && Product_Array.length > 0) {
            for (const originalItem of originalStockItems) {
                const updatedItem = Product_Array.find(item => 
                    Number(item.Item_Id) === Number(originalItem.Item_Id)
                );

                if (updatedItem) {
                    const originalQty = Number(originalItem.Bill_Qty);
                    const updatedQty = Number(updatedItem.Bill_Qty);
                    
                   
                    if (updatedQty < originalQty) {
                        const returnQty = originalQty - updatedQty;
                        const returnRatio = returnQty / originalQty;
                        
                        const returnItem = {
                            ...originalItem,
                            Return_Qty: returnQty,
                            Return_Amount: RoundNumber(Number(originalItem.Amount) * returnRatio),
                            Return_Taxable_Amount: RoundNumber(Number(originalItem.Taxable_Amount) * returnRatio),
                            Return_Cgst_Amo: RoundNumber(Number(originalItem.Cgst_Amo) * returnRatio),
                            Return_Sgst_Amo: RoundNumber(Number(originalItem.Sgst_Amo) * returnRatio),
                            Return_Igst_Amo: RoundNumber(Number(originalItem.Igst_Amo) * returnRatio),
                            Return_Final_Amo: RoundNumber(Number(originalItem.Final_Amo) * returnRatio),
                            Original_S_No: originalItem.S_No,
                            Item_Rate: originalItem.Item_Rate,
                            Taxable_Rate: originalItem.Taxable_Rate,
                            Tax_Rate: originalItem.Tax_Rate,
                            Cgst: originalItem.Cgst,
                            Sgst: originalItem.Sgst,
                            Igst: originalItem.Igst
                        };
                        
                        returnItems.push(returnItem);
                    }
                } else {
              
                    const returnItem = {
                        ...originalItem,
                        Return_Qty: Number(originalItem.Bill_Qty),
                        Return_Amount: Number(originalItem.Amount),
                        Return_Taxable_Amount: Number(originalItem.Taxable_Amount),
                        Return_Cgst_Amo: Number(originalItem.Cgst_Amo),
                        Return_Sgst_Amo: Number(originalItem.Sgst_Amo),
                        Return_Igst_Amo: Number(originalItem.Igst_Amo),
                        Return_Final_Amo: Number(originalItem.Final_Amo),
                        Original_S_No: originalItem.S_No
                    };
                    
                    returnItems.push(returnItem);
                }
            }

           
            if (returnItems.length > 0) {
                for (let i = 0; i < returnItems.length; i++) {
                    const returnItem = returnItems[i];
                    
                    await new sql.Request(transaction)
                        .input("Ret_Date", new Date())
                        .input("Delivery_Order_Id", Do_Id)
                        .input("GoDown_Id", returnItem.GoDown_Id)
                        .input("S_No", i + 1)
                        .input("Item_Id", returnItem.Item_Id)
                        .input("Bill_Qty", returnItem.Return_Qty)
                        .input("Act_Qty", returnItem.Return_Qty)
                        .input("Alt_Act_Qty", returnItem.Return_Qty)
                        .input("Taxable_Rate", returnItem.Taxable_Rate)
                        .input("Item_Rate", returnItem.Item_Rate)
                        .input("Amount", returnItem.Return_Amount)
                        .input("Free_Qty", 0)
                        .input("Total_Qty", returnItem.Return_Qty)
                        .input("Taxble", returnItem.Taxble)
                        .input("HSN_Code", returnItem.HSN_Code)
                        .input("Unit_Id", returnItem.Unit_Id)
                        .input("Unit_Name", returnItem.Unit_Name)
                        .input("Act_unit_Id", returnItem.Act_unit_Id)
                        .input("Alt_Act_Unit_Id", returnItem.Alt_Act_Unit_Id)
                        .input("Taxable_Amount", returnItem.Return_Taxable_Amount)
                        .input("Tax_Rate", returnItem.Tax_Rate)
                        .input("Cgst", returnItem.Cgst)
                        .input("Cgst_Amo", returnItem.Return_Cgst_Amo)
                        .input("Sgst", returnItem.Sgst)
                        .input("Sgst_Amo", returnItem.Return_Sgst_Amo)
                        .input("Igst", returnItem.Igst)
                        .input("Igst_Amo", returnItem.Return_Igst_Amo)
                        .input("Final_Amo", returnItem.Return_Final_Amo)
                        .input("Created_by", Altered_by)
                        .input("Altered_by", Altered_by)
                        .input("Created_on", new Date())
                        .input("Alterd_on", new Date())
                        .query(`
                            INSERT INTO tbl_Sales_Return_Stock_Info (
                                Ret_Date, Delivery_Order_Id, GoDown_Id, S_No, Item_Id, 
                                Bill_Qty, Act_Qty, Alt_Act_Qty, Taxable_Rate, Item_Rate, Amount, 
                                Free_Qty, Total_Qty, Taxble, HSN_Code, Unit_Id, Unit_Name, 
                                Act_unit_Id, Alt_Act_Unit_Id, Taxable_Amount, Tax_Rate, 
                                Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo,
                                Created_by, Altered_by, Created_on, Alterd_on
                            ) VALUES (
                                @Ret_Date, @Delivery_Order_Id, @GoDown_Id, @S_No, @Item_Id, 
                                @Bill_Qty, @Act_Qty, @Alt_Act_Qty, @Taxable_Rate, @Item_Rate, @Amount, 
                                @Free_Qty, @Total_Qty, @Taxble, @HSN_Code, @Unit_Id, @Unit_Name, 
                                @Act_unit_Id, @Alt_Act_Unit_Id, @Taxable_Amount, @Tax_Rate, 
                                @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo,
                                @Created_by, @Altered_by, @Created_on, @Alterd_on
                            );
                        `);
                }
            }
        }

      
        if (Product_Array && Product_Array.length > 0) {
            const productsData = (await getProducts()).dataArray;
            const Alter_Id = Math.floor(Math.random() * 999999);

            let Total_Invoice_value = 0;
            let Total_Before_Tax = 0;
            let Total_Tax = 0;
            let CSGT_Total = 0;
            let SGST_Total = 0;
            let IGST_Total = 0;
            let Round_off = 0;
            let totalCGST = 0;
            let totalSGST = 0;
            let totalIGST = 0;

            
            for (const item of Product_Array) {
                const product = findProductDetails(productsData, item.Item_Id);
                if (!product) continue;

                const itemRate = RoundNumber(item?.Item_Rate);
                const billQty = RoundNumber(item?.Bill_Qty);
                const Amount = Multiplication(billQty, itemRate);
                const gstPercentage = isIGST ? product.Igst_P : product.Gst_P;

                if (isNotTaxableBill) {
                    Total_Before_Tax = Addition(Total_Before_Tax, Amount);
                    Total_Invoice_value = Addition(Total_Invoice_value, Amount);
                    continue;
                }

                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                Total_Before_Tax = Addition(Total_Before_Tax, gstInfo.base_amount);
                Total_Tax = Addition(Total_Tax, gstInfo.tax_amount);
                Total_Invoice_value = Addition(Total_Invoice_value, gstInfo.with_tax);

                if (isIGST) {
                    IGST_Total = Addition(IGST_Total, gstInfo.tax_amount);
                    totalIGST = Addition(totalIGST, gstInfo.tax_amount);
                } else {
                    const halfTax = gstInfo.tax_amount / 2;
                    CSGT_Total = Addition(CSGT_Total, halfTax);
                    SGST_Total = Addition(SGST_Total, halfTax);
                    totalCGST = Addition(totalCGST, halfTax);
                    totalSGST = Addition(totalSGST, halfTax);
                }
            }

            Total_Invoice_value = RoundNumber(Total_Invoice_value);
            Round_off = RoundNumber(
                Math.round(Total_Invoice_value) - Total_Invoice_value
            );
            Total_Invoice_value = Math.round(Total_Invoice_value);

            const Total_Expences = isNotTaxableBill
                ? Round_off
                : Addition(Addition(Addition(CSGT_Total, SGST_Total), IGST_Total), Round_off);

            
            await new sql.Request(transaction)
                .input("Do_Id", sql.Int, Do_Id)
                .query(`DELETE FROM tbl_Sales_Delivery_Stock_Info WHERE Delivery_Order_Id = @Do_Id`);

            await new sql.Request(transaction)
                .input("Do_Id", sql.Int, Do_Id)
                .query(`DELETE FROM tbl_Sales_Delivery_Expence_Info WHERE Do_Id = @Do_Id`);

           
            await new sql.Request(transaction)
                .input("doid", Do_Id)
                .input("date", Do_Date)
                .input("retailer", Retailer_Id)
                .input("branch", Branch_Id)
                .input("GST_Inclusive", GST_Inclusive)
                .input("CSGT_Total", CSGT_Total)
                .input("SGST_Total", SGST_Total)
                .input("IGST_Total", IGST_Total)
                .input("IS_IGST", isIGST ? 1 : 0)
                .input("Total_Expences", Total_Expences)
                .input("roundoff", Round_off)
                .input("totalinvoice", Total_Invoice_value)
                .input("Total_Before_Tax", Total_Before_Tax)
                .input("Total_Tax", Total_Tax)
                .input("narration", Narration)
                .input("alterby", Altered_by)
                .input("Alter_Id", Alter_Id)
                .input("alteron", new Date())
                .input("deliveryperson", Delivery_Person_Id)
                .input("deliverystatus", Delivery_Status)
                .input("deliveryTime", Delivery_Time)
                .input("deliveryLocation", Delivery_Location)
                .input("deliverylatitude", Delivery_Latitude)
                .input("deliverylongitute", Delivery_Longitude)
                .input("Cancel_status",Cancel_status)
                .input("paymentMode", Payment_Mode)
                .input("paymentStatus", Payment_Status)
                .input("paymentrefno", Payment_Ref_No)
                .input("Trans_Type", "UPDATE").query(`
                UPDATE tbl_Sales_Delivery_Gen_Info
                SET
                    Do_Date = @date,
                    Retailer_Id = @retailer,
                    Branch_Id = @branch,
                    GST_Inclusive = @GST_Inclusive,
                    IS_IGST = @IS_IGST,
                    CSGT_Total = @CSGT_Total,
                    SGST_Total = @SGST_Total,
                    IGST_Total = @IGST_Total,
                    Total_Expences = @Total_Expences,
                    Round_off = @roundoff,
                    Total_Invoice_value = @totalinvoice,
                    Total_Before_Tax = @Total_Before_Tax,
                    Total_Tax = @Total_Tax,
                    Narration = @narration,
                    Altered_by = @alterby,
                    Alter_Id = @Alter_Id,
                    Delivery_Person_Id = @deliveryperson,
                    Delivery_Time = @deliveryTime,
                    Delivery_Status = @deliverystatus,
                    Cancel_status=@Cancel_status,
                    Delivery_Location = @deliveryLocation,
                    Delivery_Latitude = @deliverylatitude,
                    Delivery_Longitude = @deliverylongitute,
                    Payment_Mode = @paymentMode,
                    Payment_Status = @paymentStatus,
                    Payment_Ref_No = @paymentrefno,
                    Alterd_on = @alteron,
                    Trans_Type = @Trans_Type
                WHERE Do_Id = @doid;`
                );

            
            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Item_Id);
                if (!productDetails) continue;

                const gstPercentage = isIGST ? productDetails.Igst_P : productDetails.Gst_P;
                const Taxble = gstPercentage > 0 ? 1 : 0;
                const Bill_Qty = Number(product.Bill_Qty);
                const Item_Rate = RoundNumber(product.Item_Rate);
                const Amount = Multiplication(Bill_Qty, Item_Rate);

                const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                const gstInfo = calculateGSTDetails(Amount, gstPercentage, taxType);

                await new sql.Request(transaction)
                    .input("Do_Date", Do_Date ? Do_Date : new Date())
                    .input("Delivery_Order_Id", Do_Id)
                    .input("S_No", i + 1)
                    .input("Item_Id", product.Item_Id)
                    .input("Bill_Qty", Bill_Qty)
                    .input("Item_Rate", Item_Rate)
                    .input("Amount", Amount)
                    .input("Free_Qty", 0)
                    .input("Total_Qty", Bill_Qty)
                    .input("Taxble", Taxble)
                    .input("Taxable_Rate", itemRateGst.base_amount)
                    .input("HSN_Code", productDetails.HSN_Code)
                    .input("GoDown_Id", 1)
                    .input("Unit_Id", product.UOM ?? "")
                    .input("Unit_Name", product.Units ?? "")
                    .input("Taxable_Amount", gstInfo.base_amount)
                    .input("Tax_Rate", gstPercentage)
                    .input("Cgst", !isNotTaxableBill && !isIGST ? gstInfo.cgst_per : 0)
                    .input("Cgst_Amo", !isNotTaxableBill && !isIGST ? gstInfo.cgst_amount : 0)
                    .input("Sgst", !isNotTaxableBill && !isIGST ? gstInfo.cgst_per : 0)
                    .input("Sgst_Amo", !isNotTaxableBill && !isIGST ? gstInfo.cgst_amount : 0)
                    .input("Igst", !isNotTaxableBill && isIGST ? gstInfo.igst_per : 0)
                    .input("Igst_Amo", !isNotTaxableBill && isIGST ? gstInfo.igst_amount : 0)
                    .input("Final_Amo", gstInfo.with_tax)
                    .input("Created_on", new Date()).query(`
                    INSERT INTO tbl_Sales_Delivery_Stock_Info (
                        Do_Date, Delivery_Order_Id, S_No, Item_Id, Bill_Qty, Item_Rate, Amount, 
                        Free_Qty, Total_Qty, GoDown_Id, Taxble, Taxable_Rate, HSN_Code, 
                        Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, 
                        Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    ) VALUES (
                        @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @Bill_Qty, @Item_Rate, @Amount, 
                        @Free_Qty, @Total_Qty, @GoDown_Id, @Taxble, @Taxable_Rate, @HSN_Code, 
                        @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, 
                        @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                    );
                `);
            }


            const expenseEntries = [];
            if (!isNotTaxableBill) {
                if (!isIGST) {
                    if (totalCGST > 0) {
                        expenseEntries.push({
                            type: "CGST",
                            amount: totalCGST,
                            isCredit: false,
                        });
                    }
                    if (totalSGST > 0) {
                        expenseEntries.push({
                            type: "SGST",
                            amount: totalSGST,
                            isCredit: false,
                        });
                    }
                } else if (totalIGST > 0) {
                    expenseEntries.push({
                        type: "IGST",
                        amount: totalIGST,
                        isCredit: false,
                    });
                }
            }

            if (Round_off !== 0) {
                expenseEntries.push({
                    type: "ROUNDOFF",
                    amount: Math.abs(Round_off),
                    isCredit: Round_off < 0,
                });
            }

            const defaultAccounts = await new sql.Request(transaction).query(`
                SELECT Acc_Id, AC_Reason 
                FROM tbl_Default_AC_Master 
                WHERE AC_Reason IN ('CGST', 'SGST', 'IGST', 'ROUNDOFF', 'GST', 'TAX', 'ROUND')
            `);

            const accountMap = {};
            defaultAccounts.recordset.forEach((account) => {
                const reason = (account.AC_Reason || "").toUpperCase();
                accountMap[reason] = account.Acc_Id;
            });

            for (let i = 0; i < expenseEntries.length; i++) {
                const expense = expenseEntries[i];
                let accountId = accountMap[expense.type];

                if (!accountId) {
                    if (expense.type === "CGST" || expense.type === "SGST" || expense.type === "IGST") {
                        accountId = accountMap["GST"] || accountMap["TAX"];
                    } else if (expense.type === "ROUNDOFF") {
                        accountId = accountMap["ROUND"];
                    }
                }

                if (!accountId) {
                    console.error(`No account mapping found for ${expense.type}`);
                    continue;
                }

                if (expense.type === "ROUNDOFF") {
                    const amount = Round_off;
                    const isCredit = Round_off < 0;

                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input("Expence_Value_Dr", sql.Decimal(18, 2), isCredit ? 0 : amount)
                        .input("Expence_Value_Cr", sql.Decimal(18, 2), isCredit ? amount : 0).query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                            );`
                        );
                } else {
                    await new sql.Request(transaction)
                        .input("Do_Id", sql.Int, Do_Id)
                        .input("Sno", sql.Int, i + 1)
                        .input("Expense_Id", sql.Int, accountId)
                        .input("Expence_Value_Dr", sql.Decimal(18, 2), expense.amount)
                        .input("Expence_Value_Cr", sql.Decimal(18, 2), 0).query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_Dr, Expence_Value_Cr
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_Dr, @Expence_Value_Cr
                            );`
                        );
                }
            }

            await transaction.commit();
            
            if (returnItems.length > 0) {
                success(res, "Delivery order updated successfully with return records created");
            } else {
                success(res, "Delivery order updated successfully");
            }

        } else {
    
            await new sql.Request(transaction)
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
                .input('Cancel_status',Cancel_status)
                .input('Altered_by', Altered_by)
                .input('Alterd_on', new Date())
                .input('Trans_Type', 'UPDATE')
                .query(`
                    UPDATE tbl_Sales_Delivery_Gen_Info
                    SET
                        Delivery_Person_Id = @deliveryperson,
                        Delivery_Time = @deliveryTime,
                        Delivery_Status = @deliverystatus,
                        Delivery_Location = @deliveryLocation,
                        Delivery_Latitude = @deliverylatitude,
                        Delivery_Longitude = @deliverylongitute,
                        Payment_Mode = @paymentMode,
                        Payment_Status = @paymentStatus,
                        Payment_Ref_No = @paymentrefno,
                        Cancel_status=@Cancel_status,
                        Altered_by = @Altered_by,
                        Alterd_on = @Alterd_on,
                        Trans_Type = @Trans_Type
                    WHERE Do_Id = @doid;
                `);

            await transaction.commit();
            success(res, 'Delivery information updated successfully!');
        }

    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
};








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
            BillType='SALES',
            VoucherType=-1,
            IS_IGST = 0,
            Delivery_Person_Id,
            Delivery_Location

        } = req.body;

        var Trip_Date = req.body.Trip_Date;
        var Alter_Id = req.body.Alter_Id;
        const transaction = new sql.Transaction();
        //    const Delivery_Person_Ids = Delivery_Person_Id || 0;
        // if (!Delivery_Person_Ids || !Branch_Id  || !TripStatus) {
        //     return invalidInput(res, 'Please Select Required Fields');
        // }

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

   

            // const Trip_No = Number((await new sql.Request()
            //     .input('Trip_Date', Trip_Date)
            //     .query(`
            //                    SELECT COALESCE(MAX(Trip_No), 0) AS MaxId
            //                    FROM tbl_Trip_Master    
            //                    WHERE 
            //                        Trip_Date = @Trip_Date
            //                     `
            //     ))?.recordset[0]?.MaxId) + 1;

            // if (!checkIsNumber(Trip_No)) throw new Error('Failed to get Trip_No');


   let finalTripNo;
        
       
        if (Trip_No && Trip_No !== '') {
        
            
            finalTripNo = Trip_No; 
        } else {
     
            const maxTripNo = Number((await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .query(`
                    SELECT COALESCE(MAX(Trip_No), 0) AS MaxId
                    FROM tbl_Trip_Master    
                    WHERE Trip_Date = @Trip_Date
                `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(maxTripNo)) throw new Error('Failed to generate Trip_No');
            finalTripNo = maxTripNo;
        }



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
            let Trip_Number;
            if(Trip_No !=''){
                Trip_Number=Trip_No
            }
            else {
                Trip_Number=T_No
            }
           
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
                 .input('Trip_No', finalTripNo) // Use the determined Trip_No
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

//      const deliveryTripsheetList = async (req, res) => {
//     try {
//         const FromDate = ISOString(req.query.Fromdate);
//         const ToDate = ISOString(req.query.Todate);

//         const { Branch_Id,Delivery_Person_Id } = req.query;

//         if (!FromDate || !ToDate) {
//             return invalidInput(res, 'Select StartDate & EndDate');
//         }

//         let query = `WITH TRIP_MASTER AS (
//     SELECT
//         tr.Trip_Id,
//         tr.Challan_No,
//         tr.EndTime,
//         tr.StartTime,
//         tr.Trip_Date,
//         tr.Trip_EN_KM,
//         tr.Trip_No,
//         tr.Trip_ST_KM,
//         tr.Trip_Tot_Kms,
//         tr.Vehicle_No,
//         tr.Branch_Id,
//         tr.BillType,
//         tr.VoucherType,
//         tr.TR_INV_ID,
//         bm.BranchName
//     FROM tbl_Trip_Master tr
//     LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = tr.Branch_Id
//     WHERE tr.Trip_Date BETWEEN @FromDate AND @ToDate AND tr.BillType = 'SALES'`;

//         // Add Branch_Id condition if provided
//         if (Branch_Id) {
//             query += ` AND tr.Branch_Id = @Branch_Id`;
//         }

//         query += `),
// TRIP_DETAILS AS (
//     SELECT DISTINCT
//         td.Trip_Id,
//         td.Delivery_Id,
//         sgi.Do_Id,
//         sgi.So_No,
//         sgi.Total_Before_Tax,
//         sgi.Total_Invoice_Value,
//         sgi.SGST_Total,
//         sgi.CSGT_Total,
//         sgi.IGST_Total,
//         sgi.Delivery_Person_Id,
//         sgi.Delivery_Status,
//         sgi.Cancel_status,
//         sgi.Total_Tax,
//         sgi.Created_by,
//         sgi.Altered_by,
//         sgi.Do_Date AS Delivery_Do_Date,  
//         sogi.So_Id AS Sales_Order_Id,  
//         sogi.Retailer_Id AS Order_Retailer_Id  
//     FROM tbl_Trip_Details AS td
//     LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sgi ON sgi.Do_Id = td.Delivery_Id
//     LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sgi.So_No
//      WHERE 1 = 1
//       ${Delivery_Person_Id ? 'AND sgi.Delivery_Person_Id = @Delivery_Person_Id' : ''}
// ),
// TRIP_EMPLOYEES AS (
//     SELECT
//         te.Trip_Id,
//         te.Involved_Emp_Id,
//         e.Cost_Center_Name AS Emp_Name,
//         cc.Cost_Category,
//         cc.Cost_Category_Id
//     FROM tbl_Trip_Employees AS te
//     LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = te.Involved_Emp_Id
//     LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = te.Cost_Center_Type_Id
// )
// SELECT
//     tm.Trip_Id,
//     tm.Challan_No,
//     tm.EndTime,
//     tm.StartTime,
//     tm.Trip_Date,
//     tm.Trip_EN_KM,
//     tm.Trip_No,
//     tm.Trip_ST_KM,
//     tm.Trip_Tot_Kms,
//     tm.Vehicle_No,
//     tm.Branch_Id, 
//     tm.TR_INV_ID,
//     tm.BillType,
//     tm.VoucherType,

//     (SELECT MIN(td.Delivery_Do_Date) 
//      FROM TRIP_DETAILS AS td 
//      WHERE td.Trip_Id = tm.Trip_Id) AS DO_Date,

//     COALESCE((  
//         SELECT DISTINCT
//             td.Delivery_Id,
//             td.Do_Id,
//             td.So_No,
//             td.Total_Before_Tax,
//             td.Total_Invoice_Value,
//             td.SGST_Total,
//             td.CSGT_Total,
//             td.IGST_Total,
//             td.Delivery_Person_Id,
//             ecc.Cost_Center_Name,
//             ecc.User_Id,
//             us.Name,
//             td.Delivery_Status,
//             td.Cancel_status,
//             td.Total_Tax,
//             td.Created_by,
//             td.Altered_by,
//             td.Sales_Order_Id,
//             td.Order_Retailer_Id,
//             ISNULL(sgi.Delivery_Time, '') AS Delivery_Time,  
//             ISNULL(sgi.Payment_Mode, '') AS Payment_Mode,
//             ISNULL(sgi.Payment_Ref_No, '') AS Payment_Ref_No,
//             ISNULL(sgi.Delivery_Location, '') AS Delivery_Location,
//             ISNULL(sgi.Delivery_Latitude, 0) AS Delivery_Latitude,
//             ISNULL(sgi.Delivery_Longitude, 0) AS Delivery_Longitude,
//             ISNULL(sgi.Collected_By, '') AS Collected_By,
//             ISNULL(sgi.Collected_Status, '') AS Collected_Status,
//             sgi.Payment_Status
//         FROM TRIP_DETAILS AS td
//         LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = td.Delivery_Person_Id
//         LEFT JOIN tbl_Users us ON us.UserId = ecc.User_Id  
//         LEFT JOIN tbl_Sales_Delivery_Gen_Info sgi ON sgi.Do_Id = td.Delivery_Id  
//         WHERE td.Trip_Id = tm.Trip_Id
//         FOR JSON PATH
//     ), '[]') AS Trip_Details,

//     COALESCE((  
//     SELECT
//         sgi.Do_Id,
//         sgi.So_No,
//         rm.Retailer_Name,
//         sgi.Do_Date AS Product_Do_Date, 

//         (SELECT
//             sdsi.*,
//             sgi2.Do_Inv_No,
//             pm.Product_Name,
//             pm.Product_Image_Name,
//             tm.BranchName AS Branch,  
//             rm2.Retailer_Name,  
//             rm2.Latitude,
//             rm2.Longitude,
//            -- ssi.*,
//             (SELECT
//                 ssi.Id,
//                 ssi.Do_Id,
//                 ssi.Emp_Id,
//                 ecc.Cost_Center_Name AS Emp_Name,
//                 ssi.Emp_Type_Id,
//                 et.Cost_Category AS Emp_Type_Name
//             FROM tbl_Sales_Delivery_Staff_Info AS ssi
//             LEFT JOIN tbl_ERP_Cost_Center AS ecc ON ecc.Cost_Center_Id = ssi.Emp_Id
//             LEFT JOIN tbl_ERP_Cost_Category AS et ON et.Cost_Category_Id = ssi.Emp_Type_Id
//             WHERE ssi.Do_Id = sgi2.Do_Id
//             FOR JSON PATH
//             ) AS Delivery_Staff
//         FROM tbl_Sales_Delivery_Stock_Info AS sdsi
//         LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = sdsi.Item_Id
//         LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sgi2 ON sgi2.Do_Id = sdsi.Delivery_Order_Id
//         LEFT JOIN tbl_Retailers_Master AS rm2 ON rm2.Retailer_Id = sgi2.Retailer_Id
//         LEFT JOIN tbl_Sales_Delivery_Staff_Info AS ssi ON ssi.Do_Id = sgi2.Do_Id
      
//     --    LEFT JOIN tbl_ERP_Cost_Center AS ecc ON ecc.Cost_Center_Id = ssi.Emp_Id
       
//       --  LEFT JOIN tbl_ERP_Cost_Category AS et ON et.Cost_Category_Id = ssi.Emp_Type_Id
     
//         WHERE sdsi.Delivery_Order_Id = sgi.Do_Id
//         FOR JSON PATH
//         ) AS Products_List
//     FROM tbl_Sales_Delivery_Gen_Info AS sgi
//     LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sgi.Retailer_Id
//     WHERE sgi.Do_Id IN (SELECT td.Delivery_Id FROM TRIP_DETAILS td WHERE td.Trip_Id = tm.Trip_Id)
//     FOR JSON PATH
// ), '[]') AS Product_Array,

//     COALESCE((  
//         SELECT
//             te.Involved_Emp_Id,
//             te.Emp_Name,
//             te.Cost_Category,
//             te.Cost_Category_Id AS Cost_Center_Type_Id
//         FROM TRIP_EMPLOYEES AS te
//         WHERE te.Trip_Id = tm.Trip_Id
//         FOR JSON PATH
//     ), '[]') AS Employees_Involved
// FROM TRIP_MASTER AS tm`;

//         const request = new sql.Request();
//         request.input('FromDate', sql.Date, FromDate);
//         request.input('ToDate', sql.Date, ToDate);
    
//         if (Branch_Id) {
//             request.input('Branch_Id', sql.Int, Branch_Id);
//         }
//          if (Delivery_Person_Id) {
//             request.input('Delivery_Person_Id', sql.Int, Delivery_Person_Id);
//         }


//         const result = await request.query(query);

//         if (result.recordset && Array.isArray(result.recordset) && result.recordset.length > 0) {
//             const parsed = result.recordset.map(o => ({
//                 ...o,
//                 Product_Array: o?.Product_Array ? JSON.parse(o.Product_Array) : [],
//                 Trip_Details: o?.Trip_Details ? JSON.parse(o.Trip_Details) : [],
//                 Employees_Involved: o?.Employees_Involved ? JSON.parse(o.Employees_Involved) : []
//             }));

//             dataFound(res, parsed);
//         } else {
//             noData(res);
//         }

//     } catch (e) {
//         servError(e, res);
//     }
// };

const deliveryTripsheetList = async (req, res) => {
    try {
        const { Fromdate, Todate, Branch_Id, User_Id, Delivery_Person_Id } = req.query;

        if (!Fromdate || !Todate) {
            return invalidInput(res, 'Select StartDate & EndDate');
        }

        const FromDate = new Date(Fromdate);
        const ToDate = new Date(Todate);
        
        if (isNaN(FromDate.getTime()) || isNaN(ToDate.getTime())) {
            return invalidInput(res, 'Invalid date format');
        }

        const branchIdNum = Branch_Id ? parseInt(Branch_Id, 10) : null;
        const deliveryPersonIdNum = Delivery_Person_Id ? parseInt(Delivery_Person_Id, 10) : null;

        // 1. Get Trip Master Data
        let tripMasterQuery = `
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
    bm.BranchName,
    MIN(sgi.Do_Date) AS DO_Date
FROM tbl_Trip_Master tr
LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = tr.Branch_Id
LEFT JOIN tbl_Trip_Details td ON td.Trip_Id = tr.Trip_Id
LEFT JOIN tbl_Sales_Delivery_Gen_Info sgi ON TRY_CAST(sgi.Do_Id AS INT) = TRY_CAST(td.Delivery_Id AS INT)
WHERE tr.Trip_Date BETWEEN @FromDate AND @ToDate
    AND tr.BillType = 'SALES'
`;

        const conditions = [];
        if (branchIdNum && !isNaN(branchIdNum)) {
            conditions.push(`AND tr.Branch_Id = @Branch_Id`);
        }
        if (deliveryPersonIdNum && !isNaN(deliveryPersonIdNum)) {
            conditions.push(`AND EXISTS (
                SELECT 1 FROM tbl_Trip_Details td2
                INNER JOIN tbl_Sales_Delivery_Gen_Info sgi2 ON TRY_CAST(sgi2.Do_Id AS INT) = TRY_CAST(td2.Delivery_Id AS INT)
                WHERE td2.Trip_Id = tr.Trip_Id 
                AND TRY_CAST(sgi2.Delivery_Person_Id AS INT) = @Delivery_Person_Id
            )`);
        }

        if (conditions.length > 0) {
            tripMasterQuery += ' ' + conditions.join(' ');
        }

        tripMasterQuery += `
GROUP BY 
    tr.Trip_Id, tr.Challan_No, tr.EndTime, tr.StartTime, tr.Trip_Date,
    tr.Trip_EN_KM, tr.Trip_No, tr.Trip_ST_KM, tr.Trip_Tot_Kms,
    tr.Vehicle_No, tr.Branch_Id, tr.BillType, tr.VoucherType,
    tr.TR_INV_ID, bm.BranchName
ORDER BY tr.Trip_Date DESC
`;

        const request = new sql.Request();
        request.input('FromDate', sql.Date, FromDate);
        request.input('ToDate', sql.Date, ToDate);
        
        if (branchIdNum && !isNaN(branchIdNum)) {
            request.input('Branch_Id', sql.Int, branchIdNum);
        }
        if (deliveryPersonIdNum && !isNaN(deliveryPersonIdNum)) {
            request.input('Delivery_Person_Id', sql.Int, deliveryPersonIdNum);
        }

        const tripMasterResult = await request.query(tripMasterQuery);
        
        if (!tripMasterResult.recordset?.length) {
            return noData(res);
        }

        const tripIds = tripMasterResult.recordset.map(t => t.Trip_Id);
        if (tripIds.length === 0) {
            return noData(res);
        }

        // 2. Get Trip Details
        const tripDetailsQuery = `
SELECT DISTINCT
    td.Trip_Id,
    td.Delivery_Id,
    sgi.Do_Id,
    sgi.So_No,
    sgi.Do_Inv_No,
    lol.Ledger_Name,
    lol.Ledger_Alias,
    TRY_CAST(sgi.Retailer_Id AS INT) as Retailer_Id,
    CAST(COALESCE(TRY_CAST(sgi.Total_Before_Tax AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Total_Before_Tax,
    CAST(COALESCE(TRY_CAST(sgi.Total_Invoice_Value AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Total_Invoice_Value,
    CAST(COALESCE(TRY_CAST(sgi.SGST_Total AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as SGST_Total,
    CAST(COALESCE(TRY_CAST(sgi.CSGT_Total AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as CSGT_Total,
    CAST(COALESCE(TRY_CAST(sgi.IGST_Total AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as IGST_Total,
    TRY_CAST(sgi.Delivery_Person_Id AS INT) as Delivery_Person_Id,
    sgi.Delivery_Status,
    sgi.Cancel_status,
    CAST(COALESCE(TRY_CAST(sgi.Total_Tax AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Total_Tax,
    sgi.Created_by,
    sgi.Altered_by,
    sgi.Do_Date AS Delivery_Do_Date,
    ecc.Cost_Center_Name,
    ecc.User_Id,
    us.Name,
    ISNULL(sgi.Delivery_Time, '') AS Delivery_Time,
    ISNULL(sgi.Payment_Mode, 0) AS Payment_Mode,
    ISNULL(sgi.Payment_Ref_No, '') AS Payment_Ref_No,
    ISNULL(sgi.Delivery_Location, '') AS Delivery_Location,
    ISNULL(sgi.Delivery_Latitude, 0) AS Delivery_Latitude,
    ISNULL(sgi.Delivery_Longitude, 0) AS Delivery_Longitude,
    ISNULL(sgi.Collected_By, 0) AS Collected_By,
    ISNULL(sgi.Collected_Status, 0) AS Collected_Status,
    sgi.Payment_Status
FROM tbl_Trip_Details td
INNER JOIN tbl_Sales_Delivery_Gen_Info sgi ON TRY_CAST(sgi.Do_Id AS INT) = TRY_CAST(td.Delivery_Id AS INT)
LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = TRY_CAST(sgi.Delivery_Person_Id AS INT)
LEFT JOIN tbl_Users us ON us.UserId = TRY_CAST(ecc.User_Id AS INT)
LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id=TRY_CAST(sgi.Retailer_Id AS INT)
LEFT JOIN tbl_Ledger_LOL lol ON lol.Ret_Id=TRY_CAST(rm.Retailer_Id AS INT)
WHERE td.Trip_Id IN (${tripIds.map((_, i) => `@TripId${i}`).join(',')})
`;

        const detailsRequest = new sql.Request();
        tripIds.forEach((id, i) => {
            detailsRequest.input(`TripId${i}`, sql.Int, id);
        });
        
        let tripDetailsResult;
        if (deliveryPersonIdNum && !isNaN(deliveryPersonIdNum)) {
            const newQuery = tripDetailsQuery + ` AND TRY_CAST(sgi.Delivery_Person_Id AS INT) = @Delivery_Person_Id`;
            detailsRequest.input('Delivery_Person_Id', sql.Int, deliveryPersonIdNum);
            tripDetailsResult = await detailsRequest.query(newQuery);
        } else {
            tripDetailsResult = await detailsRequest.query(tripDetailsQuery);
        }

        return await processResults(tripDetailsResult);

        async function processResults(tripDetailsResult) {
            const tripDetailsMap = {};
            const deliveryIds = [];
            
            tripDetailsResult.recordset.forEach(detail => {
                const tripId = detail.Trip_Id;
                if (!tripDetailsMap[tripId]) {
                    tripDetailsMap[tripId] = [];
                }
                tripDetailsMap[tripId].push(detail);
                
                if (detail.Do_Id && !deliveryIds.includes(detail.Do_Id)) {
                    deliveryIds.push(detail.Do_Id);
                }
            });

            // 3. Get Products Data
            let productMap = {};
            let staffMap = {};
            let deliveryInvoiceMap = {}; // Store Do_Inv_No for each Do_Id
            
            if (deliveryIds.length > 0) {
                // Get Products Data
                const productsQuery = `
SELECT DISTINCT
    TRY_CAST(sdsi.Delivery_Order_Id AS INT) AS Do_Id,
    sdsi.S_No,
    TRY_CAST(sdsi.Item_Id AS INT) AS Item_Id,
    CAST(COALESCE(TRY_CAST(sdsi.Bill_Qty AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Bill_Qty,
    CAST(COALESCE(TRY_CAST(sdsi.Act_Qty AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Act_Qty,
    CAST(COALESCE(TRY_CAST(sdsi.Taxable_Rate AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Taxable_Rate,
    CAST(COALESCE(TRY_CAST(sdsi.Item_Rate AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Item_Rate,
    CAST(COALESCE(TRY_CAST(sdsi.Amount AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Amount,
    CAST(COALESCE(TRY_CAST(sdsi.Free_Qty AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Free_Qty,
    CAST(COALESCE(TRY_CAST(sdsi.Total_Qty AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Total_Qty,
    CAST(COALESCE(TRY_CAST(sdsi.Taxble AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Taxble,
    sdsi.HSN_Code,
    TRY_CAST(sdsi.Unit_Id AS INT) AS Unit_Id,
    sdsi.Unit_Name,
    TRY_CAST(sdsi.Act_unit_Id AS INT) AS Act_unit_Id,
    TRY_CAST(sdsi.Alt_Act_Unit_Id AS INT) AS Alt_Act_Unit_Id,
    CAST(COALESCE(TRY_CAST(sdsi.Taxable_Amount AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Taxable_Amount,
    CAST(COALESCE(TRY_CAST(sdsi.Tax_Rate AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Tax_Rate,
    CAST(COALESCE(TRY_CAST(sdsi.Cgst AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Cgst,
    CAST(COALESCE(TRY_CAST(sdsi.Cgst_Amo AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Cgst_Amo,
    CAST(COALESCE(TRY_CAST(sdsi.Sgst AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Sgst,
    CAST(COALESCE(TRY_CAST(sdsi.Sgst_Amo AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Sgst_Amo,
    CAST(COALESCE(TRY_CAST(sdsi.Igst AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Igst,
    CAST(COALESCE(TRY_CAST(sdsi.Igst_Amo AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Igst_Amo,
    CAST(COALESCE(TRY_CAST(sdsi.Final_Amo AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) as Final_Amo,
    sdsi.Created_on,
    sdsi.Batch_Name,
    sgi.Do_Inv_No,
    pm.Product_Name,
    TRY_CAST(pm.Pack_Id AS INT) AS Pack_Id,
    CAST(COALESCE(TRY_CAST(ppm.Pack AS DECIMAL(18,2)), 0) AS DECIMAL(18,2)) AS Pack,
    pm.Product_Image_Name,
    bm.BranchName AS Branch,
    rm.Retailer_Name,
    CAST(COALESCE(TRY_CAST(rm.Latitude AS DECIMAL(10,6)), 0) AS DECIMAL(10,6)) as Latitude,
    CAST(COALESCE(TRY_CAST(rm.Longitude AS DECIMAL(10,6)), 0) AS DECIMAL(10,6)) as Longitude,
    sda.deliveryName AS Party_Mailing_Name,
    sda.cityName AS Party_Location,
    -- Calculate Alt_Act_Qty with safe conversion
    CASE 
        WHEN COALESCE(TRY_CAST(sdsi.Act_Qty AS DECIMAL(18,2)), 0) = 0 
             OR COALESCE(TRY_CAST(ppm.Pack AS DECIMAL(18,2)), 0) = 0
        THEN 0
        ELSE CAST(
            TRY_CAST(sdsi.Act_Qty AS DECIMAL(18,2)) 
            / NULLIF(TRY_CAST(ppm.Pack AS DECIMAL(18,2)), 0)
            AS DECIMAL(18,2)
        )
    END AS Alt_Act_Qty,
    sdsi.DO_St_Id,
    sdsi.Do_Date,
    TRY_CAST(sdsi.Delivery_Order_Id AS INT) AS Delivery_Order_Id,
    TRY_CAST(sdsi.GoDown_Id AS INT) AS GoDown_Id
FROM tbl_Sales_Delivery_Stock_Info sdsi
INNER JOIN tbl_Sales_Delivery_Gen_Info sgi ON TRY_CAST(sgi.Do_Id AS INT) = TRY_CAST(sdsi.Delivery_Order_Id AS INT)
LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = TRY_CAST(sdsi.Item_Id AS INT)
LEFT JOIN tbl_Pack_Master ppm ON ppm.Pack_Id = TRY_CAST(pm.Pack_Id AS INT)
LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = TRY_CAST(sgi.Branch_Id AS INT)
LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = TRY_CAST(sgi.Retailer_Id AS INT)
LEFT JOIN tbl_Sales_Delivery_Address sda ON sda.id = TRY_CAST(sgi.shipingAddressId AS INT)
WHERE TRY_CAST(sdsi.Delivery_Order_Id AS INT) IN (${deliveryIds.map((_, i) => `@DeliveryId${i}`).join(',')})
ORDER BY TRY_CAST(sdsi.Delivery_Order_Id AS INT), sdsi.S_No
`;

                const productsRequest = new sql.Request();
                deliveryIds.forEach((id, i) => {
                    productsRequest.input(`DeliveryId${i}`, sql.Int, id);
                });

                const productsResult = await productsRequest.query(productsQuery);
                
                productMap = {};
                productsResult.recordset.forEach(product => {
                    const doId = product.Do_Id;
                    if (!productMap[doId]) {
                        productMap[doId] = [];
                    }
                    productMap[doId].push(product);
                });

                // Get Staff Info
                const staffQuery = `
SELECT
    ssi.Id,
    TRY_CAST(ssi.Do_Id AS INT) AS Do_Id,
    TRY_CAST(ssi.Emp_Id AS INT) AS Emp_Id,
    ecc.Cost_Center_Name AS Emp_Name,
    TRY_CAST(ssi.Emp_Type_Id AS INT) AS Emp_Type_Id,
    et.Cost_Category AS Emp_Type_Name
FROM tbl_Sales_Delivery_Staff_Info ssi
LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = TRY_CAST(ssi.Emp_Id AS INT)
LEFT JOIN tbl_ERP_Cost_Category et ON et.Cost_Category_Id = TRY_CAST(ssi.Emp_Type_Id AS INT)
WHERE TRY_CAST(ssi.Do_Id AS INT) IN (${deliveryIds.map((_, i) => `@StaffDoId${i}`).join(',')})
`;

                const staffRequest = new sql.Request();
                deliveryIds.forEach((id, i) => {
                    staffRequest.input(`StaffDoId${i}`, sql.Int, id);
                });

                const staffResult = await staffRequest.query(staffQuery);
                
                staffMap = {};
                staffResult.recordset.forEach(staff => {
                    const doId = staff.Do_Id;
                    if (!staffMap[doId]) {
                        staffMap[doId] = [];
                    }
                    staffMap[doId].push(staff);
                });
            }

            // 4. Get Employees Involved
            const employeesQuery = `
SELECT
    te.Trip_Id,
    te.Involved_Emp_Id,
    e.Cost_Center_Name AS Emp_Name,
    cc.Cost_Category,
    cc.Cost_Category_Id AS Cost_Center_Type_Id
FROM tbl_Trip_Employees te
LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = te.Involved_Emp_Id
LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = te.Cost_Center_Type_Id
WHERE te.Trip_Id IN (${tripIds.map((_, i) => `@EmpTripId${i}`).join(',')})
`;

            const empRequest = new sql.Request();
            tripIds.forEach((id, i) => {
                empRequest.input(`EmpTripId${i}`, sql.Int, id);
            });

            const employeesResult = await empRequest.query(employeesQuery);
            
            const employeesMap = {};
            employeesResult.recordset.forEach(emp => {
                const tripId = emp.Trip_Id;
                if (!employeesMap[tripId]) {
                    employeesMap[tripId] = [];
                }
                employeesMap[tripId].push({
                    Involved_Emp_Id: emp.Involved_Emp_Id,
                    Emp_Name: emp.Emp_Name,
                    Cost_Category: emp.Cost_Category,
                    Cost_Center_Type_Id: emp.Cost_Center_Type_Id
                });
            });

            // 5. Assemble Final Data with Sales Invoice No sorting
            const finalData = tripMasterResult.recordset.map(trip => {
                const tripId = trip.Trip_Id;
                const details = tripDetailsMap[tripId] || [];
                
                // Format Trip_Details (without Products_List)
                const formattedTripDetails = details.map(detail => {
                    return {
                        Delivery_Id: detail.Delivery_Id,
                        Do_Id: detail.Do_Id,
                        So_No: detail.So_No,
                        Ledger_Name:detail.Ledger_Name,
                        Total_Before_Tax: detail.Total_Before_Tax,
                        Total_Invoice_Value: detail.Total_Invoice_Value,
                        SGST_Total: detail.SGST_Total,
                        CSGT_Total: detail.CSGT_Total,
                        IGST_Total: detail.IGST_Total,
                        Delivery_Person_Id: detail.Delivery_Person_Id,
                        Delivery_Status: detail.Delivery_Status,
                        Cancel_status: detail.Cancel_status,
                        Total_Tax: detail.Total_Tax,
                        Created_by: detail.Created_by,
                        Altered_by: detail.Altered_by,
                        Cost_Center_Name: detail.Cost_Center_Name,
                        Delivery_Time: detail.Delivery_Time,
                        Payment_Mode: detail.Payment_Mode,
                        Payment_Ref_No: detail.Payment_Ref_No,
                        Delivery_Location: detail.Delivery_Location,
                        Delivery_Latitude: detail.Delivery_Latitude,
                        Delivery_Longitude: detail.Delivery_Longitude,
                        Collected_By: detail.Collected_By,
                        Collected_Status: detail.Collected_Status,
                        Payment_Status: detail.Payment_Status
                    };
                });
                
                // Format Product_Array with Sales Invoice No ASC sorting
                // First, sort details by Do_Inv_No (Sales Invoice No)
                const sortedDetails = [...details].sort((a, b) => {
                    // Handle null/undefined values
                    const invoiceA = a.Do_Inv_No || '';
                    const invoiceB = b.Do_Inv_No || '';
                    
                    // Custom sorting for alphanumeric invoice numbers like "OGS/000175/25-26"
                    // Extract numeric part for better sorting
                    const numA = extractInvoiceNumber(invoiceA);
                    const numB = extractInvoiceNumber(invoiceB);
                    
                    if (numA !== null && numB !== null) {
                        return numA - numB;
                    }
                    
                    // Fallback to string comparison
                    return invoiceA.localeCompare(invoiceB);
                });
                
                const productArray = sortedDetails.map(detail => {
                    const doId = detail.Do_Id;
                    const products = productMap[doId] || [];
                    
                    const formattedProducts = products.map(product => {
                        // Remove Do_Id from product to match your structure
                        const { Do_Id, ...productWithoutDoId } = product;
                        return {
                            ...productWithoutDoId,
                            Delivery_Staff: staffMap[doId] || []
                        };
                    });
                    
                    return {
                        Do_Id: detail.Do_Id,
                        So_No: detail.So_No,
                        Retailer_Name: detail.Cost_Center_Name || 'N/A',
                        Product_Do_Date: detail.Delivery_Do_Date,
                        Products_List: formattedProducts
                    };
                });

                return {
                    Trip_Id: trip.Trip_Id,
                    Challan_No: trip.Challan_No,
                    EndTime: trip.EndTime,
                    StartTime: trip.StartTime,
                    Trip_Date: trip.Trip_Date,
                    Trip_EN_KM: trip.Trip_EN_KM,
                    Trip_No: trip.Trip_No,
                    Trip_ST_KM: trip.Trip_ST_KM,
                    Trip_Tot_Kms: trip.Trip_Tot_Kms,
                    Vehicle_No: trip.Vehicle_No,
                    Branch_Id: trip.Branch_Id,
                    BillType: trip.BillType,
                    VoucherType: trip.VoucherType,
                    TR_INV_ID: trip.TR_INV_ID,
                    BranchName: trip.BranchName,
                    DO_Date: trip.DO_Date,
                    Trip_Details: formattedTripDetails,
                    Product_Array: productArray,
                    Employees_Involved: employeesMap[tripId] || []
                };
            });

            dataFound(res, finalData);
        }

    } catch (e) {
        console.error('Delivery Tripsheet Error:', e);
        servError(e, res);
    }
};


function extractInvoiceNumber(invoiceNo) {
    if (!invoiceNo) return null;
    
   
    const matches = invoiceNo.match(/\d+/g);
    if (matches && matches.length > 0) {
   
        let longestNum = 0;
        matches.forEach(match => {
            const num = parseInt(match, 10);
            if (!isNaN(num) && num > longestNum) {
                longestNum = num;
            }
        });
        return longestNum;
    }
    return null;
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

        if (!Trip_ST_KM || !StartTime || !Do_Date || !Branch_Id || !Array.isArray(Product_Array) || Product_Array.length === 0) {
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
            Do_Date: rawDoDate,
            Created_by,
            GST_Inclusive = 1,
            Voucher_Type_Id
        } = req.body;

        const GoDown_Id = req?.body?.GoDown_Id;
        const Trip_Date = req.body.Trip_Date;
        const Stock_Item_Ledger_Name = req?.body?.Stock_Item_Ledger_Name;
        const transaction = new sql.Transaction();

        try {
            if (!rawDoDate || !GoDown_Id || !Stock_Item_Ledger_Name || (Voucher_Type_Id === undefined || Voucher_Type_Id === null)) {
                return invalidInput(res, 'Please Select Required Fields');
            }

            const Do_Date = ISOString(rawDoDate);
            if (!Do_Date || Do_Date === 'Invalid Date') {
                return invalidInput(res, 'Invalid Do_Date format');
            }

            await transaction.begin();

            const yearData = await new sql.Request(transaction).query(
                "SELECT Year_Desc, Id FROM tbl_Year_Master WHERE Active_Status IN ('Yes', 'YES')"
            );
            const branchData = await new sql.Request(transaction)
                .input('Branch_Id', sql.Int, Branch_Id)
                .query("SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @Branch_Id");
            const voucherData = await new sql.Request(transaction)
                .input('Voucher_Type_Id', Voucher_Type_Id)
                .query("SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Voucher_Type_Id");

            if (!yearData.recordset[0] || !branchData.recordset[0] || !voucherData.recordset[0]) {
                throw new Error('Failed to fetch required master data');
            }

            const Do_Year_Desc = yearData.recordset[0].Year_Desc;
            const Year_Master_Id = yearData.recordset[0].Id;
            const BranchCode = branchData.recordset[0].BranchCode;
            const VoucherCode = voucherData.recordset[0].Voucher_Code;
            const FinancialYear = `${Do_Year_Desc}`;

            const accountMappings = await getAccountMappings(transaction);

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
                    .input('Voucher_Type', sql.Int, Voucher_Type_Id)
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

                let totalCGST = 0;
                let totalSGST = 0;
                let totalIGST = 0;
                let totalRoundOff = product?.Round_off || 0;

                if (product.Products_List && Array.isArray(product.Products_List)) {
                    product.Products_List.forEach(subProduct => {
                        totalCGST += subProduct?.Cgst_Amo || 0;
                        totalSGST += subProduct?.Sgst_Amo || 0;
                        totalIGST += subProduct?.Igst_Amo || 0;
                    });
                }


                const genInfoRequest = new sql.Request(transaction);
                genInfoRequest.input('Do_Id', sql.Int, Do_Id);
                genInfoRequest.input('Do_No', sql.Int, Do_Branch_Inv_Id);
                genInfoRequest.input('Do_Year', sql.Int, Year_Master_Id);
                genInfoRequest.input('Do_Inv_No', sql.NVarChar(100), Do_Inv_No);
                genInfoRequest.input('Voucher_Type', sql.Int, Voucher_Type_Id);
                genInfoRequest.input('Do_Date', sql.DateTime, new Date(Do_Date));
                genInfoRequest.input('Retailer_Id', sql.Int, product?.Retailer_Id || null);
                genInfoRequest.input('Delivery_Person_Id', sql.Int, 0);
                genInfoRequest.input('Branch_Id', sql.Int, Branch_Id);
                genInfoRequest.input('GST_Inclusive', sql.Int, GST_Inclusive);
                genInfoRequest.input('CSGT_Total', sql.Decimal(18, 2), totalCGST);
                genInfoRequest.input('SGST_Total', sql.Decimal(18, 2), totalSGST);
                genInfoRequest.input('IGST_Total', sql.Decimal(18, 2), totalIGST);
                genInfoRequest.input('Total_Expences', totalCGST + totalSGST + totalIGST + totalRoundOff);
                genInfoRequest.input('Round_off', sql.Decimal(18, 2), totalRoundOff);
                genInfoRequest.input('Total_Before_Tax', sql.Decimal(18, 2), product?.Total_Before_Tax || 0);
                genInfoRequest.input('Total_Tax', sql.Decimal(18, 2), totalCGST + totalSGST + totalIGST);
                genInfoRequest.input('Total_Invoice_value', sql.Decimal(18, 2), product?.Total_Invoice_value || 0);
                genInfoRequest.input('Cancel_status', sql.Int, 1);
                genInfoRequest.input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name);
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
                    CSGT_Total, SGST_Total, IGST_Total,Total_Expences, Round_off, Total_Before_Tax, 
                    Total_Tax, Total_Invoice_value, Cancel_status,Stock_Item_Ledger_Name, So_No, 
                    Delivery_Status, Delivery_Location, Payment_Status, Alter_Id, 
                    Created_by, Created_on, Trans_Type
                ) VALUES (
                    @Do_Id, @Do_No, @Do_Year, @Do_Inv_No, @Voucher_Type, @Do_Date, 
                    @Retailer_Id, @Delivery_Person_Id, @Branch_Id, @GST_Inclusive, 
                    @CSGT_Total, @SGST_Total, @IGST_Total,@Total_Expences, @Round_off, @Total_Before_Tax, 
                    @Total_Tax, @Total_Invoice_value, @Cancel_status,@Stock_Item_Ledger_Name, @So_No, 
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
                        stockRequest.input('Tax_Rate', sql.Decimal(18, 2), ((subProduct?.Cgst + subProduct?.Sgst) || 0));
                        stockRequest.input('Cgst', sql.Decimal(18, 2), subProduct?.Cgst || 0);
                        stockRequest.input('Cgst_Amo', sql.Decimal(18, 2), subProduct?.Cgst_Amo || 0);

                        stockRequest.input('Sgst', sql.Decimal(18, 2), subProduct?.Sgst || 0);
                        stockRequest.input('Sgst_Amo', sql.Decimal(18, 2), subProduct?.Sgst_Amo || 0);
                        stockRequest.input('Igst', sql.Decimal(18, 2), subProduct?.Igst || 0);
                        stockRequest.input('Igst_Amo', sql.Decimal(18, 2), subProduct?.Igst_Amo || 0);
                        stockRequest.input('Final_Amo', sql.Decimal(18, 2), subProduct?.Final_Amo || 0);
                        stockRequest.input('Created_on', sql.DateTime, new Date());

                        await stockRequest.query(`
                        INSERT INTO tbl_Sales_Delivery_Stock_Info (
                            Do_Date, Delivery_Order_Id, S_No, Item_Id, GoDown_Id, Bill_Qty, Item_Rate, 
                            Amount, Free_Qty, Total_Qty, Taxble, Taxable_Rate, HSN_Code, 
                            Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, Cgst, Cgst_Amo, 
                            Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                        ) VALUES (
                            @Do_Date, @Delivery_Order_Id, @S_No, @Item_Id, @GoDown_Id, @Bill_Qty, @Item_Rate, 
                            @Amount, @Free_Qty, @Total_Qty, @Taxble, @Taxable_Rate, @HSN_Code, 
                            @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, @Cgst, @Cgst_Amo, 
                            @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                        )
                    `);
                    }
                }

                await insertExpenseEntries(transaction, Do_Id, {
                    cgst: totalCGST,
                    sgst: totalSGST,
                    igst: totalIGST,
                    roundOff: totalRoundOff
                }, accountMappings);
            }

            await transaction.commit();
            success(res, 'Delivery Created Successfully!', { deliveryIds: createdDeliveryIds });

        } catch (error) {
            if (transaction._aborted === false) {
                try {
                    await transaction.rollback();
                } catch (rollbackError) {
                    console.error('Rollback failed:', rollbackError);
                }
            }
            servError(error, res);
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

// const getDeliveryDetailsListing = async (req, res) => {
//     const { Sales_Person_Id, VoucherType, Branch, Broker, Transporter, Item, Godown, Retailer } = req.query;

//     const Fromdate = ISOString(req.query.Fromdate), Todate = ISOString(req.query.Todate);

//     try {
//         let query = `
//         WITH DELIVERY_DETAILS AS (
//             SELECT
//                 oi.*,
//                 pm.Product_Id,
//                 COALESCE(pm.Product_Name, '') AS Product_Name,
//                 COALESCE(pm.Product_Image_Name, '') AS Product_Image_Name,
//                 COALESCE(u.Units, '') AS UOM,
//                 COALESCE(b.Brand_Name, '') AS BrandGet
//             FROM tbl_Sales_Delivery_Stock_Info AS oi
//             LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
//             LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
//             LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
//             LEFT JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = oi.Godown_Id
//             WHERE
//                 CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
//                 AND
//                 CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
//         ),
//         DELIVERY_STAFF AS (
//             SELECT
//                 dsi.Do_Id,
//                 dsi.Emp_Id,
//                 dsi.Emp_Type_Id,
//                 ecc.Cost_Category,
//                 ecc.Cost_Category_Id,
//                 COALESCE(e.Cost_Center_Name, '') AS Staff_Name
//             FROM tbl_Sales_Delivery_Staff_Info dsi
//             LEFT JOIN tbl_Erp_Cost_Category ecc ON ecc.Cost_Category_Id = dsi.Emp_Type_Id
//             LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = dsi.Emp_Id
//             -- LEFT JOIN tbl_Users u ON u.UserId = dsi.Emp_Id
//         ),
//         DELIVERY_ALL_STAFF AS (
//             SELECT
//               ds.*
//             FROM DELIVERY_STAFF ds
//         )
//         SELECT 
//             sdgi.*,
//             COALESCE(rm.Retailer_Name, '') AS Retailer_Name,
//             COALESCE(sp.Name, '') AS Sales_Person_Name,
//             COALESCE(bm.BranchName, '') AS Branch_Name,
//             COALESCE(cb.Name, '') AS Created_BY_Name,
//             COALESCE(rmt.Route_Name, '') AS RouteName,
//             COALESCE(am.Area_Name, '') AS AreaName,
//             COALESCE(sdgi.Total_Invoice_Value, 0) AS Total_Invoice_Value,
        
//             COALESCE((
//                 SELECT Top 1 ds.Emp_Id 
//                 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category = 'BROKER'
//             ), 0) AS Broker_Id,
//             COALESCE((
//                 SELECT TOP 1 ds.Staff_Name 
//                 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category = 'BROKER'
//             ), '') AS Broker_Name,
           
//             COALESCE((
//                 SELECT TOP 1 ds.Emp_Id 
//                 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category = 'TRANSPORT'
//             ), 0) AS Transporter_Id,
//             COALESCE((
//                 SELECT TOP 1 ds.Staff_Name 
//                 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category = 'TRANSPORT'
//             ), '') AS Transporter_Name,
           
//             COALESCE((
//                 SELECT 
//                    ds.*
//                 FROM DELIVERY_ALL_STAFF ds
//                 WHERE ds.Do_Id = sdgi.Do_Id
//                 ORDER BY ds.Cost_Category, ds.Staff_Name
//                 FOR JSON PATH
//             ), '[]') AS All_Staff_Details,
//             -- Products list
//             COALESCE((
//                 SELECT 
//                     sd.*,
//                     sdgi.Do_Inv_No,
//                     COALESCE(rm.Retailer_Name, '') AS Retailer_Name
//                 FROM DELIVERY_DETAILS AS sd
//                 WHERE sd.Delivery_Order_Id = sdgi.Do_Id
//                 FOR JSON PATH
//             ), '[]') AS Products_List
//         FROM 
//             tbl_Sales_Delivery_Gen_Info AS sdgi
//         LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sdgi.So_No 
//         LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sdgi.Retailer_Id
//         LEFT JOIN tbl_Users AS sp ON sp.UserId = sogi.Sales_Person_Id 
//         LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = sdgi.Branch_Id
//         LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
//         LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
//         LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
//         WHERE 
//             CONVERT(DATE, sdgi.Do_Date) >= CONVERT(DATE, @from)
//             AND
//             CONVERT(DATE, sdgi.Do_Date) <= CONVERT(DATE, @to)
//             AND NOT EXISTS (
//                 SELECT 1 FROM tbl_Trip_Details td WHERE td.Delivery_Id = sdgi.Do_Id
//             )`;

//         const request = new sql.Request();
//         request.input('from', Fromdate);
//         request.input('to', Todate);

//         const parseArrayParam = (param) => {
//             if (!param) return [];
//             if (Array.isArray(param)) return param;
//             if (typeof param === 'string') return param.split(',').filter(item => item.trim() !== '');
//             return [param];
//         };

//         const retailerTypes = parseArrayParam(Retailer);
//         const voucherTypes = parseArrayParam(VoucherType);
//         const brokers = parseArrayParam(Broker);
//         const transporters = parseArrayParam(Transporter);
//         const items = parseArrayParam(Item);

//         if (checkIsNumber(Sales_Person_Id)) {
//             query += ` AND sogi.Sales_Person_Id = @salesPerson`;
//             request.input('salesPerson', sql.Int, parseInt(Sales_Person_Id));
//         }
        
//         if (voucherTypes.length > 0) {
//             query += ` AND sdgi.Voucher_Type IN (${voucherTypes.map((_, index) => `@VoucherType${index}`).join(', ')})`;
//             voucherTypes.forEach((voucherType, index) => {
//                 request.input(`VoucherType${index}`, sql.VarChar, voucherType);
//             });
//         }
        
//         if (Branch && Branch !== '') {
//             query += ` AND sdgi.Branch_Id = @Branch`;
//             request.input('Branch', sql.Int, parseInt(Branch));
//         }

//         if (retailerTypes.length > 0) {
//             query += ` AND sdgi.Retailer_Id IN (${retailerTypes.map((_, index) => `@Retailer${index}`).join(', ')})`;
//             retailerTypes.forEach((retailer, index) => {
//                 request.input(`Retailer${index}`, sql.Int, parseInt(retailer));
//             });
//         }
        
//         if (brokers.length > 0) {
//             query += ` AND EXISTS (
//                 SELECT 1 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id 
//                 AND ds.Cost_Category = 'BROKER' 
//                 AND ds.Emp_Id IN (${brokers.map((_, index) => `@Broker${index}`).join(', ')})
//             )`;
//             brokers.forEach((broker, index) => {
//                 request.input(`Broker${index}`, sql.Int, parseInt(broker));
//             });
//         }

//         if (transporters.length > 0) {
//             query += ` AND EXISTS (
//                 SELECT 1 FROM DELIVERY_STAFF ds 
//                 WHERE ds.Do_Id = sdgi.Do_Id 
//                 AND ds.Cost_Category = 'TRANSPORT' 
//                 AND ds.Emp_Id IN (${transporters.map((_, index) => `@Transporter${index}`).join(', ')})
//             )`;
//             transporters.forEach((transporter, index) => {
//                 request.input(`Transporter${index}`, sql.Int, parseInt(transporter));
//             });
//         }

//         if (items.length > 0) {
//             query += ` AND EXISTS (
//                 SELECT 1 FROM DELIVERY_DETAILS dd 
//                 WHERE dd.Delivery_Order_Id = sdgi.Do_Id 
//                 AND dd.Product_Id IN (${items.map((_, index) => `@Item${index}`).join(', ')})
//             )`;
//             items.forEach((item, index) => {
//                 request.input(`Item${index}`, sql.Int, parseInt(item));
//             });
//         }

//         if (Godown && Godown !== '') {
//             query += ` AND EXISTS (
//                 SELECT 1 FROM DELIVERY_DETAILS dd 
//                 WHERE dd.Delivery_Order_Id = sdgi.Do_Id 
//                 AND dd.Godown_Id = @Godown
//             )`;
//             request.input('Godown', sql.Int, parseInt(Godown));
//         }

//         query += ` ORDER BY CONVERT(DATETIME, sdgi.Do_Id) DESC`;

//         const result = await request.query(query);

//         if (result.recordset.length > 0) {
//             const parsed = result.recordset.map(o => {
//                 // Parse Products_List
//                 let productsList = o.Products_List;
//                 if (typeof productsList === 'string') {
//                     try {
//                         productsList = JSON.parse(productsList);
//                     } catch (e) {
//                         console.error('Error parsing Products_List:', e);
//                         productsList = [];
//                     }
//                 }
                
//                 // Parse All_Staff_Details - CORRECTION: Parse only once
//                 let allStaffDetails = o.All_Staff_Details;
//                 if (typeof allStaffDetails === 'string') {
//                     try {
//                         allStaffDetails = JSON.parse(allStaffDetails);
//                     } catch (e) {
//                         console.error('Error parsing All_Staff_Details:', e);
//                         allStaffDetails = [];
//                     }
//                 }
                
//                 // Return with consistent naming
//                 return {
//                     ...o,
//                     Products_List: productsList,
//                     // Use only one field for staff details - remove duplicates
//                     All_Staff_Details: allStaffDetails
//                 };
//             });
            
//             const withImage = parsed.map(o => ({
//                 ...o,
//                 Products_List: o?.Products_List?.map(product => ({
//                     ...product,
//                     ProductImageUrl: getImage('products', product?.Product_Image_Name)
//                 })) || [],
//                 // Ensure Staff_Involved is consistent
//                 Staff_Involved: o.All_Staff_Details // Or keep as All_Staff_Details based on your preference
//             }));
            
//             dataFound(res, withImage);
//         } else {
//             noData(res);
//         }
//     } catch (e) {
//         servError(e, res);
//     }
// };


const getDeliveryDetailsListing = async (req, res) => {
    const { Sales_Person_Id, VoucherType, Branch, Broker, Transporter, Loadman, Item, Godown, Retailer } = req.query;


    const Fromdate = ISOString(req.query.Fromdate), Todate = ISOString(req.query.Todate);

    try {
        let query = `
     WITH DELIVERY_DETAILS AS (
    SELECT
        oi.*,
        pm.Product_Id,
        COALESCE(pm.Product_Name, '') AS Product_Name,
        COALESCE(pm.Product_Image_Name, '') AS Product_Image_Name,
        COALESCE(u.Units, '') AS UOM,
        COALESCE(b.Brand_Name, '') AS BrandGet
    FROM tbl_Sales_Delivery_Stock_Info AS oi
    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
    LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
    LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
    LEFT JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = oi.Godown_Id
    WHERE
        CONVERT(DATE, oi.Do_Date) >= CONVERT(DATE, @from)
        AND
        CONVERT(DATE, oi.Do_Date) <= CONVERT(DATE, @to)
),
DELIVERY_STAFF AS (
    SELECT
        dsi.Do_Id,
        dsi.Emp_Id,
        dsi.Emp_Type_Id,
        ecc.Cost_Category,
        ecc.Cost_Category_Id,
        COALESCE(e.Cost_Center_Name, '') AS Staff_Name
    FROM tbl_Sales_Delivery_Staff_Info dsi
    LEFT JOIN tbl_Erp_Cost_Category ecc ON ecc.Cost_Category_Id = dsi.Emp_Type_Id
    LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = dsi.Emp_Id
),
DELIVERY_ALL_STAFF AS (
    SELECT
      ds.*
    FROM DELIVERY_STAFF ds
),
TRANSPORTER_INFO AS (
    SELECT DISTINCT
        ds.Do_Id,
        COALESCE(ds.Staff_Name, '') AS Transporter_Name
    FROM DELIVERY_STAFF ds
    WHERE ds.Cost_Category_Id = 2  -- Transport
)
SELECT 
    sdgi.*,
     COALESCE(sda.deliveryName, '') AS Retailer_Name,
    COALESCE(sda.deliveryAddress, '') AS Delivery_Address,
    COALESCE(sda.cityName, '') AS City_Name,
    COALESCE(sda.stateName, '') AS State_Name,
    COALESCE(sda.phoneNumber, '') AS Phone_Number,
    COALESCE(sda.gstNumber, '') AS GST_Number,
    COALESCE(sp.Name, '') AS Sales_Person_Name,
    COALESCE(bm.BranchName, '') AS Branch_Name,
    COALESCE(cb.Name, '') AS Created_BY_Name,
    COALESCE(rmt.Route_Name, '') AS RouteName,
    COALESCE(am.Area_Name, '') AS AreaName,
    COALESCE(sdgi.Total_Invoice_Value, 0) AS Total_Invoice_Value,

    COALESCE((
        SELECT Top 1 ds.Emp_Id 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 3  -- Broker
    ), 0) AS Broker_Id,
    COALESCE((
        SELECT TOP 1 ds.Staff_Name 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 3  -- Broker
    ), '') AS Broker_Name,
   
    COALESCE((
        SELECT TOP 1 ds.Emp_Id 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 2  -- Transport
    ), 0) AS Transporter_Id,
    COALESCE((
        SELECT TOP 1 ds.Staff_Name 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 2  -- Transport
    ), '') AS Transporter_Name,
   
    COALESCE((
        SELECT TOP 1 ds.Emp_Id 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 4  -- Load Man
    ), 0) AS LoadMan_Id,
    COALESCE((
        SELECT TOP 1 ds.Staff_Name 
        FROM DELIVERY_STAFF ds 
        WHERE ds.Do_Id = sdgi.Do_Id AND ds.Cost_Category_Id = 4  -- Load Man
    ), '') AS LoadMan_Name,
   
    COALESCE((
        SELECT 
           ds.*
        FROM DELIVERY_ALL_STAFF ds
        WHERE ds.Do_Id = sdgi.Do_Id
        ORDER BY ds.Cost_Category, ds.Staff_Name
        FOR JSON PATH
    ), '[]') AS All_Staff_Details,
    -- Products list
    COALESCE((
        SELECT 
            sd.*,
            sdgi.Do_Inv_No,
            COALESCE(ti.Transporter_Name, '') AS Transporter_Name,
              COALESCE(sda.deliveryName, '') AS Retailer_Name
        FROM DELIVERY_DETAILS AS sd
        LEFT JOIN TRANSPORTER_INFO ti ON ti.Do_Id = sdgi.Do_Id
        WHERE sd.Delivery_Order_Id = sdgi.Do_Id
        FOR JSON PATH
    ), '[]') AS Products_List
FROM 
    tbl_Sales_Delivery_Gen_Info AS sdgi
LEFT JOIN tbl_Sales_Order_Gen_Info AS sogi ON sogi.So_Id = sdgi.So_No 
LEFT JOIN tbl_Sales_Delivery_Address AS sda ON sda.id = sdgi.shipingAddressId 
LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = sdgi.Retailer_Id
LEFT JOIN tbl_Users AS sp ON sp.UserId = sogi.Sales_Person_Id 
LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = sdgi.Branch_Id
LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
LEFT JOIN TRANSPORTER_INFO ti ON ti.Do_Id = sdgi.Do_Id
WHERE 
    CONVERT(DATE, sdgi.Do_Date) >= CONVERT(DATE, @from)
    AND
    CONVERT(DATE, sdgi.Do_Date) <= CONVERT(DATE, @to)
    AND NOT EXISTS (
        SELECT 1 FROM tbl_Trip_Details td WHERE td.Delivery_Id = sdgi.Do_Id
    )`

        const request = new sql.Request();
        request.input('from', Fromdate);
        request.input('to', Todate);

        const parseArrayParam = (param) => {
            if (!param) return [];
            if (Array.isArray(param)) return param;
            if (typeof param === 'string') return param.split(',').filter(item => item.trim() !== '');
            return [param];
        };

        const retailerTypes = parseArrayParam(Retailer);
        const voucherTypes = parseArrayParam(VoucherType);
        const brokers = parseArrayParam(Broker);
        const transporters = parseArrayParam(Transporter);
        const loadmen = parseArrayParam(Loadman);  // Changed from LoadMan to Loadman
        const items = parseArrayParam(Item);

        if (checkIsNumber(Sales_Person_Id)) {
            query += ` AND sogi.Sales_Person_Id = @salesPerson`;
            request.input('salesPerson', sql.Int, parseInt(Sales_Person_Id));
        }
        
        if (voucherTypes.length > 0) {
            query += ` AND sdgi.Voucher_Type IN (${voucherTypes.map((_, index) => `@VoucherType${index}`).join(', ')})`;
            voucherTypes.forEach((voucherType, index) => {
                request.input(`VoucherType${index}`, sql.VarChar, voucherType);
            });
        }
        
        if (Branch && Branch !== '') {
            query += ` AND sdgi.Branch_Id = @Branch`;
            request.input('Branch', sql.Int, parseInt(Branch));
        }

        if (retailerTypes.length > 0) {
            query += ` AND sdgi.Retailer_Id IN (${retailerTypes.map((_, index) => `@Retailer${index}`).join(', ')})`;
            retailerTypes.forEach((retailer, index) => {
                request.input(`Retailer${index}`, sql.Int, parseInt(retailer));
            });
        }
        
        if (brokers.length > 0) {
            query += ` AND EXISTS (
                SELECT 1 FROM DELIVERY_STAFF ds 
                WHERE ds.Do_Id = sdgi.Do_Id 
                AND ds.Cost_Category_Id = 3  -- Broker
                AND ds.Emp_Id IN (${brokers.map((_, index) => `@Broker${index}`).join(', ')})
            )`;
            brokers.forEach((broker, index) => {
                request.input(`Broker${index}`, sql.Int, parseInt(broker));
            });
        }

        if (transporters.length > 0) {
            query += ` AND EXISTS (
                SELECT 1 FROM DELIVERY_STAFF ds 
                WHERE ds.Do_Id = sdgi.Do_Id 
                AND ds.Cost_Category_Id = 2  -- Transport
                AND ds.Emp_Id IN (${transporters.map((_, index) => `@Transporter${index}`).join(', ')})
            )`;
            transporters.forEach((transporter, index) => {
                request.input(`Transporter${index}`, sql.Int, parseInt(transporter));
            });
        }

        if (loadmen.length > 0) { 
            query += ` AND EXISTS (
                SELECT 1 FROM DELIVERY_STAFF ds 
                WHERE ds.Do_Id = sdgi.Do_Id 
                AND ds.Cost_Category_Id = 4  -- Load Man
                AND ds.Emp_Id IN (${loadmen.map((_, index) => `@LoadMan${index}`).join(', ')})
            )`;
            loadmen.forEach((loadman, index) => {
                request.input(`LoadMan${index}`, sql.Int, parseInt(loadman));
            });
        }

        if (items.length > 0) {
            query += ` AND EXISTS (
                SELECT 1 FROM DELIVERY_DETAILS dd 
                WHERE dd.Delivery_Order_Id = sdgi.Do_Id 
                AND dd.Product_Id IN (${items.map((_, index) => `@Item${index}`).join(', ')})
            )`;
            items.forEach((item, index) => {
                request.input(`Item${index}`, sql.Int, parseInt(item));
            });
        }

        if (Godown && Godown !== '') {
            query += ` AND EXISTS (
                SELECT 1 FROM DELIVERY_DETAILS dd 
                WHERE dd.Delivery_Order_Id = sdgi.Do_Id 
                AND dd.Godown_Id = @Godown
            )`;
            request.input('Godown', sql.Int, parseInt(Godown));
        }

        query += ` ORDER BY CONVERT(DATETIME, sdgi.Do_Id) DESC`;


        const result = await request.query(query);

        if (result.recordset.length > 0) {
            const parsed = result.recordset.map(o => {
              
                let productsList = o.Products_List;
                if (typeof productsList === 'string') {
                    try {
                        productsList = JSON.parse(productsList);
                    } catch (e) {
                        console.error('Error parsing Products_List:', e);
                        productsList = [];
                    }
                }
                
  
                let allStaffDetails = o.All_Staff_Details;
                if (typeof allStaffDetails === 'string') {
                    try {
                        allStaffDetails = JSON.parse(allStaffDetails);
                    } catch (e) {
                        console.error('Error parsing All_Staff_Details:', e);
                        allStaffDetails = [];
                    }
                }
                
               
                return {
                    ...o,
                    Products_List: productsList,
                    All_Staff_Details: allStaffDetails
                };
            });
            
            const withImage = parsed.map(o => ({
                ...o,
                Products_List: o?.Products_List?.map(product => ({
                    ...product,
                    ProductImageUrl: getImage('products', product?.Product_Image_Name)
                })) || [],
               
                Staff_Involved: o.All_Staff_Details 
            }));
            
            dataFound(res, withImage);
        } else {
            noData(res);
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

       const getDeliveryorderList = async (req, res) => {
        const { Retailer_Id, Cancel_status, Created_by, Delivery_Person_Id, Route_Id, Area_Id,Branch_Id } = req.query;

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
                            FROM tbl_Sales_Delivery_Stock_Info AS oi
                            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
                            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
                            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
                        ),
                        SALES_ORDER_COUNT_SAME_DAY AS (
                            SELECT
                                SO_Date,
                                COUNT(*) AS Order_Count
                            FROM tbl_Sales_Order_Gen_Info
                            GROUP BY SO_Date
                        ),
                        PENDING_SALES_ORDERS AS (
                            SELECT
                                SO_Date,
                                COUNT(*) AS PendingSalesOrderCount
                            FROM tbl_Sales_Order_Gen_Info
                            WHERE isConverted = 1
                            GROUP BY SO_Date
                        ),
                        PREVIOUS_DAY_SALES_ORDER_COUNT AS (
                            SELECT COUNT(*) AS PreviousDaySalesOrderCount
                            FROM tbl_Sales_Order_Gen_Info
                            WHERE CAST(SO_Date AS DATE) = (
                                SELECT MAX(CAST(SO_Date AS DATE))
                                FROM tbl_Sales_Order_Gen_Info
                                WHERE CAST(SO_Date AS DATE) < CAST(@from AS DATE)
                            )
                        )
                        SELECT DISTINCT
                            so.Do_Id AS Delivery_Order_id,
                            so.*,
                            rm.Retailer_Name,
                            erpUser.Name AS Delivery_Person_Name,
                            bm.BranchName AS Branch_Name,
                            cb.Name AS Created_BY_Name,
                            rmt.Route_Name AS Routename,
                            am.Area_Name AS AreaName,
                            rmt.Route_Id,
                            rm.Area_Id,
                            st.Status AS DeliveryStatusName,
                            sgi.SO_Date AS SalesDate,
                            soc.Order_Count AS SameDaySalesOrderCount,
                            pso.PendingSalesOrderCount,
                            pdsoc.PreviousDaySalesOrderCount,
                            COALESCE((
                                SELECT sd.*
                                FROM SALES_DETAILS AS sd
                                WHERE sd.Delivery_Order_Id = so.Do_Id
                                FOR JSON PATH
                            ), '[]') AS Products_List
                        FROM tbl_Sales_Delivery_Gen_Info AS so
                        LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
                        LEFT JOIN tbl_Status AS st ON st.Status_Id = so.Delivery_Status
                        LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Delivery_Person_Id
                        LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
                        LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
                        LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
                        LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
                        LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi ON sgi.So_Id = so.So_No
                        LEFT JOIN tbl_Trip_Details AS td ON td.Delivery_Id = so.Do_Id
                        LEFT JOIN tbl_ERP_Cost_Center AS ecc ON ecc.Cost_Center_Id = so.Delivery_Person_Id
                        LEFT JOIN tbl_Users AS erpUser ON erpUser.UserId = ecc.User_Id
                        LEFT JOIN SALES_ORDER_COUNT_SAME_DAY soc ON soc.SO_Date = CAST(so.Do_Date AS DATE)
                        LEFT JOIN PENDING_SALES_ORDERS pso ON pso.SO_Date = CAST(so.Do_Date AS DATE)
                        LEFT JOIN PREVIOUS_DAY_SALES_ORDER_COUNT pdsoc ON 1 = 1
                        --WHERE CAST(so.Do_Date AS DATE) = @from
                        WHERE CAST(so.Do_Date AS DATE) BETWEEN @from AND @to
                                  `;

          
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
             if (Branch_Id) {
                query += ` AND so.Branch_Id = @Branch_Id`;
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
              request.input('Branch_Id', Branch_Id);

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




    const getDeliveryorderListMobile = async (req, res) => {
    const { 
        Retailer_Id, 
        Cancel_status, 
        Created_by, 
        Delivery_Person_Id, 
        Route_Id, 
        Area_Id, 
        Branch_Id,
        Fromdate,
        Todate
    } = req.query;

    try {
     const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
            const toDate = Todate ? ISOString(Todate) : ISOString();
        let query = `              
           WITH SALES_DETAILS AS (
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
                        ),
            SALES_ORDER_COUNT_SAME_DAY AS (
                SELECT
                    CAST(SO_Date AS DATE) AS SO_Date,
                    COUNT(*) AS Order_Count
                FROM tbl_Sales_Order_Gen_Info
                GROUP BY CAST(SO_Date AS DATE)
            ),
            PENDING_SALES_ORDERS AS (
                SELECT
                    CAST(SO_Date AS DATE) AS SO_Date,
                    COUNT(*) AS PendingSalesOrderCount
                FROM tbl_Sales_Order_Gen_Info
                WHERE isConverted = 1
                GROUP BY CAST(SO_Date AS DATE)
            ),
            PREVIOUS_DAY_SALES_ORDER_COUNT AS (
                SELECT COUNT(*) AS PreviousDaySalesOrderCount
                FROM tbl_Sales_Order_Gen_Info
                WHERE CAST(SO_Date AS DATE) = DATEADD(DAY, -1, CAST(@from AS DATE))
            )
              SELECT DISTINCT
                            so.Do_Id AS Delivery_Order_id,
                            so.*,
                            rm.Retailer_Name,
                            erpUser.Name AS Delivery_Person_Name,
                            bm.BranchName AS Branch_Name,
                            cb.Name AS Created_BY_Name,
                            rmt.Route_Name AS Routename,
                            am.Area_Name AS AreaName,
                            rmt.Route_Id,
                            rm.Area_Id,
                            st.Status AS DeliveryStatusName,
                            sgi.SO_Date AS SalesDate,
                            soc.Order_Count AS SameDaySalesOrderCount,
                            pso.PendingSalesOrderCount,
                            pdsoc.PreviousDaySalesOrderCount,
                            COALESCE((
                                SELECT sd.*
                                FROM SALES_DETAILS AS sd
                                WHERE sd.Delivery_Order_Id = so.Do_Id
                                FOR JSON PATH
                            ), '[]') AS Products_List
                        FROM tbl_Sales_Delivery_Gen_Info AS so
                        LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
                        LEFT JOIN tbl_Status AS st ON st.Status_Id = so.Delivery_Status
                        LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Delivery_Person_Id
                        LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
                        LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
                        LEFT JOIN tbl_Route_Master AS rmt ON rmt.Route_Id = rm.Route_Id
                        LEFT JOIN tbl_Area_Master AS am ON am.Area_Id = rm.Area_Id
                        LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi ON sgi.So_Id = so.So_No
                        LEFT JOIN tbl_Trip_Details AS td ON td.Delivery_Id = so.Do_Id
                        LEFT JOIN tbl_ERP_Cost_Center AS ecc ON ecc.Cost_Center_Id = so.Delivery_Person_Id
                        LEFT JOIN tbl_Users AS erpUser ON erpUser.UserId = ecc.User_Id
                        LEFT JOIN SALES_ORDER_COUNT_SAME_DAY soc ON soc.SO_Date = CAST(so.Do_Date AS DATE)
                        LEFT JOIN PENDING_SALES_ORDERS pso ON pso.SO_Date = CAST(so.Do_Date AS DATE)
            CROSS JOIN PREVIOUS_DAY_SALES_ORDER_COUNT pdsoc
            WHERE CAST(so.Do_Date AS DATE) BETWEEN @from AND @to
        `;

       
        const conditions = [];
        
        if (Retailer_Id) {
            conditions.push(`so.Retailer_Id = @retailer`);
        }
        if (Created_by) {
            conditions.push(`so.Created_by = @creater`);
        }
        if (Delivery_Person_Id) {
            conditions.push(`erpUser.UserId = @Delivery_Person_Id`);
        }
        if (Route_Id) {
            conditions.push(`rmt.Route_Id = @Route_Id`);
        }
        if (Area_Id) {
            conditions.push(`rm.Area_Id = @Area_Id`);
        }
        if (Branch_Id) {
            conditions.push(`so.Branch_Id = @Branch_Id`);
        }
        if (Cancel_status !== undefined) {
            conditions.push(`so.Cancel_status = @cancel`);
        }

        if (conditions.length > 0) {
            query += ` AND ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY so.Do_Id DESC`;

        const request = new sql.Request();
        
        
        request.input('from', sql.Date, fromDate);
        request.input('to', sql.Date, toDate);
        
        if (Retailer_Id) request.input('retailer', sql.Int, Retailer_Id);
        if (Created_by) request.input('creater', sql.Int, Created_by);
        if (Delivery_Person_Id) request.input('Delivery_Person_Id', sql.Int, Delivery_Person_Id);
        if (Route_Id) request.input('Route_Id', sql.Int, Route_Id);
        if (Area_Id) request.input('Area_Id', sql.Int, Area_Id);
        if (Branch_Id) request.input('Branch_Id', sql.Int, Branch_Id);
        if (Cancel_status !== undefined) request.input('cancel', sql.Bit, Cancel_status);

        const result = await request.query(query);

        if (result.recordset.length > 0) {
            const parsed = result.recordset.map(o => ({
                ...o,
                Products_List: o?.Products_List ? JSON.parse(o.Products_List) : []
            }));
            
            const withImage = parsed.map(o => ({
                ...o,
                Products_List: Array.isArray(o.Products_List) ? o.Products_List.map(product => ({
                    ...product,
                    ProductImageUrl: getImage('products', product?.Product_Image_Name)
                })) : []
            }));
            
            dataFound(res, withImage);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
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
        getClosingStock,
        getDeliveryorderList,
        getDeliveryorderListMobile
    }
}


export default DeliveryOrder();