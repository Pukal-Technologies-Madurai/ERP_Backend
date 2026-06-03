import sql from 'mssql';
import { checkIsNumber, Division, isEqualNumber, ISOString, Multiplication, Subraction, toArray, toNumber } from '../../../helper_functions.mjs';
import { servError, sentData, success, invalidInput, failed,dataFound,noData } from '../../../res.mjs';
import { validateBody } from '../../../middleware/zodValidator.mjs';
import { multipleSalesInvoiceStaffUpdateSchema } from './validationSchema.mjs';
import { error } from 'console';
import uploadFile from '../../../middleware/uploadMiddleware.mjs';
import getImage from '../../../middleware/getImageIfExist.mjs';

export const getSalesInvoiceForAssignCostCenter = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const status = req.query.staffStatus ;

        const getSalesInvoice = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .input('status', sql.Int, toNumber(status))
            .query(`
            -- filtered invoices ids temp table
                DECLARE @FilteredInvoice TABLE (Do_Id BIGINT);
            -- inserting data to temp table
                INSERT INTO @FilteredInvoice (Do_Id)
                SELECT Do_Id
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE 
                    -- FIX: Convert both sides to DATE for comparison
                    CONVERT(DATE, Do_Date) = @reqDate
                    ${isEqualNumber(status, 0) ? ' AND ISNULL(staffInvolvedStatus, 0) = 0 ' : ''}
                SELECT 
                    gen.Do_Id,
                    gen.Do_Inv_No,
                    gen.Voucher_Type,
                    vt.Voucher_Type AS voucherTypeGet,
                    gen.Do_Date,
                    gen.Retailer_Id,
                    s.Status AS Delivery_Status, 
                    s.Status_Id AS Delivery_Status_Id,
                    CASE  
                        WHEN gen.Cancel_status = 0 THEN 'Canceled Invoice' 
                        ELSE r.Retailer_Name
                    END AS retailerNameGet,
                    gen.Branch_Id,
                    b.BranchName AS branchNameGet,
                    gen.Total_Invoice_value,
                    gen.Cancel_status,
                    gen.Created_by,
                    gen.Created_on,
                    ISNULL(gen.staffInvolvedStatus, 0) staffInvolvedStatus,
                    CONVERT(DATETIME, gen.Created_on) AS createdOn,
                    gen.Narration,
                     COALESCE(cb.Name, 'unknown') AS Created_BY_Name
                FROM tbl_Sales_Delivery_Gen_Info AS gen
                LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = gen.Voucher_Type
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = gen.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = gen.Branch_Id
                LEFT JOIN tbl_Status AS s ON s.Status_Id = gen.Delivery_Status
                LEFT JOIN tbl_Users AS cb ON cb.UserId = gen.Created_by
                WHERE gen.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY Do_Id;
            -- involved staffs
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
                ORDER BY stf.Do_Id;
            -- Unique Cost Category IDs
                SELECT DISTINCT Emp_Type_Id
                FROM tbl_Sales_Delivery_Staff_Info
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);
            -- Cost Types
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category
                ORDER BY Cost_Category;
            -- Stock Details
                SELECT 
                    sdsi.Do_Date,
                    sdsi.Delivery_Order_Id,
                    COALESCE(sdsi.Bill_Qty, 0) AS Bill_Qty,
                    COALESCE(sdsi.Act_Qty, 0) AS Act_Qty,
                    -- Calculated Alt_Act_Qty (SAFE)
                    CASE 
                        WHEN TRY_CAST(pck.Pack AS DECIMAL(18,2)) IS NULL
                             OR TRY_CAST(pck.Pack AS DECIMAL(18,2)) = 0
                        THEN 0
                        ELSE CONVERT(
                            DECIMAL(18,2),
                            COALESCE(sdsi.Bill_Qty, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
                        )
                    END AS Alt_Act_Qty,
                    -- Unit value (numeric)
                    TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS unitValue,
                    COALESCE(p.Product_Rate, 0) AS itemRate,
                    COALESCE(sdsi.Item_Rate, 0) AS billedRate
                FROM tbl_Sales_Delivery_Stock_Info sdsi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
                LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY sdsi.S_No`
            );

        const result = await getSalesInvoice;

        const [invoices = [], staffs = [], uniqeInvolvedStaffs = [], costTypes = [], stockDetails = []] = result.recordsets;

        const calculatedStockDetails = stockDetails.map(stock => ({
            ...stock,

            Alt_Act_Qty: Division(stock.Act_Qty, stock.unitValue),
            quantityDifference: Subraction(stock.Bill_Qty, stock.Act_Qty)
        }));

        const invoicesWithStaffs = invoices.map(invoice => {
            const involvedStaffs = staffs.filter(stf =>
                isEqualNumber(stf.Do_Id, invoice.Do_Id)
            );

            const invoiceStockDetails = calculatedStockDetails.filter(stk =>
                isEqualNumber(stk.Delivery_Order_Id, invoice.Do_Id)
            );

            return {
                ...invoice,
                involvedStaffs,
                stockDetails: invoiceStockDetails
            };
        });

        sentData(res, invoicesWithStaffs, {
            costTypes: toArray(costTypes),
            uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(i => i.Emp_Type_Id)
        });

    } catch (e) {
        servError(e, res);
    }
};

export const postAssignCostCenterToSalesInvoice = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { Do_Id, involvedStaffs, staffInvolvedStatus } = req.body;

        await transaction.begin();

        const updateStatusRequest = new sql.Request(transaction);
        await updateStatusRequest
            .input('Do_Id', sql.BigInt, Do_Id)
            .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
            .query(`
                UPDATE tbl_Sales_Delivery_Gen_Info
                SET staffInvolvedStatus = @staffInvolvedStatus
                WHERE Do_Id = @Do_Id;`
            );

        // Update involved staffs
        const request = new sql.Request(transaction);
        await request
            .input('Do_Id', sql.BigInt, Do_Id)
            .input('involvedStaffs', sql.NVarChar, JSON.stringify(involvedStaffs))
            .query(`
                -- Delete old staff entries
                DELETE FROM tbl_Sales_Delivery_Staff_Info
                WHERE Do_Id = @Do_Id;
                -- Insert new staff entries
                INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
                SELECT 
                    @Do_Id,
                    JSON_VALUE(value, '$.Emp_Type_Id') AS Emp_Type_Id,
                    JSON_VALUE(value, '$.Emp_Id') AS Emp_Id
                FROM OPENJSON(@involvedStaffs);`
            );

        await transaction.commit();

        success(res, 'Changes saved');
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
};

export const multipleSalesInvoiceStaffUpdate = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const validate = validateBody(multipleSalesInvoiceStaffUpdateSchema, req.body, res);
        if (!validate) {
            return;
        }

        const { CostCategory, Do_Id, involvedStaffs, staffInvolvedStatus, deliveryStatus = 5 } = req.body;
        const invoiceIdsStr = Do_Id.join(',');

        await transaction.begin();

        await new sql.Request(transaction)
            .input('invoiceIds', sql.NVarChar(sql.MAX), invoiceIdsStr)
            .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
            .input('deliveryStatus', sql.Int, deliveryStatus)
            .query(`
                UPDATE tbl_Sales_Delivery_Gen_Info
                SET 
                    staffInvolvedStatus = @staffInvolvedStatus,
                    Delivery_Status = @deliveryStatus
                WHERE Do_Id IN (
                    SELECT CAST(value AS INT)
                    FROM STRING_SPLIT(@invoiceIds, ',')
                );`
            );

        if (Do_Id.length > 0 && CostCategory) {
            await new sql.Request(transaction)
                .input('invoiceIds', sql.NVarChar(sql.MAX), invoiceIdsStr)
                .input('Emp_Type_Id', sql.Int, CostCategory)
                .query(`
                    DELETE FROM tbl_Sales_Delivery_Staff_Info
                    WHERE 
                        Do_Id IN (
                            SELECT CAST(value AS INT)
                            FROM STRING_SPLIT(@invoiceIds, ',')
                        )
                        AND Emp_Type_Id = @Emp_Type_Id;`
                );
        }

        if (involvedStaffs.length > 0) {
            const values = [];
            Do_Id.forEach(doId => {
                involvedStaffs.forEach(staffId => {
                    values.push(`(${doId}, ${CostCategory}, ${staffId})`);
                });
            });

            if (values.length > 0) {
                const query = `
                    INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
                    VALUES ${values.join(',')};`;
                const request = new sql.Request(transaction);
                await request.query(query);
            }
        }

        await transaction.commit();
        success(res, 'Sales Invoice Staff Updated!');
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
}

export const multipleSalesInvoiceStaffDelete = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        // Validate required fields
        if (!req.body.CostCategory || !req.body.Do_Id || !Array.isArray(req.body.Do_Id)) {
            return res.status(400).json({
                success: false,
                message: 'CostCategory and Do_Id (array) are required'
            });
        }

        const { CostCategory, Do_Id } = req.body;
        const invoiceIdsStr = Do_Id.join(',');

        await transaction.begin();

        // Delete staff entries for specific Do_Ids and CostCategory
        await new sql.Request(transaction)
            .input('invoiceIds', sql.NVarChar(sql.MAX), invoiceIdsStr)
            .input('Emp_Type_Id', sql.Int, CostCategory)
            .query(`
                DELETE FROM tbl_Sales_Delivery_Staff_Info
                WHERE 
                    Do_Id IN (
                        SELECT CAST(value AS INT)
                        FROM STRING_SPLIT(@invoiceIds, ',')
                    )
                    AND Emp_Type_Id = @Emp_Type_Id;`
            );

        await transaction.commit();
        success(res, `Staff with CostCategory ${CostCategory} removed from ${Do_Id.length} invoices!`);
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
}

export const katchathCopyPrintOut = async (req, res) => {
    try {
        const { Do_Id } = req.query;

        if (!checkIsNumber(Do_Id)) return invalidInput(res, 'Do_Id is required');

        const request = new sql.Request()
            .input('Do_Id', sql.BigInt, Do_Id)
            .query(`
                SELECT
                	sdgi.Do_Id id,
                	sdgi.Voucher_Type voucherType,
                	v.Voucher_Type voucherTypeGet, 
                	cb.Name createdByGet,
                	sdgi.Created_on createdOn,
                	sda.deliveryName mailingName,
                	sda.deliveryAddress mailingAddress,
                	sda.cityName mailingCity,
                	sda.phoneNumber mailingNumber,
                	COALESCE((
                			SELECT 
                			sdsi.Item_Id itemId,
                			p.Short_Name itemName,
                			sdsi.Alt_Act_Qty,
							sdsi.Act_Qty,
							pm.Pack,
							 CASE 
                                WHEN COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0) IS NULL
                                THEN 0 
                                ELSE CONVERT(DECIMAL(18,2), COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0))
                            END AS quantity
                		FROM tbl_Sales_Delivery_Stock_Info AS sdsi
                		LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
						LEFT JOIN tbl_Pack_Master as pm ON pm.Pack_Id=p.Pack_Id
                		WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id
                        ORDER BY sdsi.S_No
                		FOR JSON PATH
                	), '[]') AS productDetails,
                	COALESCE((
                		SELECT 
                			stf.Emp_Id AS empId,
                			stf.Emp_Type_Id AS empTypeId,
                			e.Cost_Center_Name AS empName,
                            cc.Cost_Category AS empType
                		FROM tbl_Sales_Delivery_Staff_Info AS stf
                		LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                		LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                		WHERE stf.Do_Id = sdgi.Do_Id
                		FOR JSON PATH
                	), '[]') AS staffDetails
                FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = sdgi.Voucher_Type
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
                LEFT JOIN tbl_Sales_Delivery_Address AS sda ON sda.id = sdgi.shipingAddressId
                WHERE sdgi.Do_Id = @Do_Id;`);

        const result = await request;

        const parseData = result.recordset.map(inv => ({
            ...inv,
            productDetails: JSON.parse(inv.productDetails),
            staffDetails: JSON.parse(inv.staffDetails)
        }))

        sentData(res, parseData);
    } catch (e) {
        servError(e, res);
    }
}

export const invoiceCopyPrintOut = async (req, res) => {
    try {
        const { Do_Id } = req.query;

        if (!checkIsNumber(Do_Id)) return invalidInput(res, 'Do_Id is required');

        const request = new sql.Request()
            .input('Do_Id', sql.BigInt, Do_Id)
            .query(`
                SELECT
                	sdgi.Do_Id id,
                	sdgi.Voucher_Type voucherType,
                    sdgi.Do_Inv_No voucherNumber,
                	v.Voucher_Type voucherTypeGet, 
                	r.Retailer_Name retailerNameGet,
                	ISNULL(sda.gstNumber, '') retailerGstNumber,
                	cb.Name createdByGet,
                	sdgi.Created_on createdOn,
                	sda.deliveryName mailingName,
                	sda.deliveryAddress mailingAddress,
                	sda.cityName mailingCity,
                	sda.phoneNumber mailingNumber,
                	COALESCE(sdgi.Round_off, 0) roundOffValue,
                	COALESCE((
                		SELECT 
                			sdsi.Item_Id itemId,
                			p.Short_Name itemName,
                			p.HSN_Code hsnCode,
                			COALESCE((sdsi.Cgst + sdsi.Sgst + sdsi.Igst), 0) AS gstPercentage,
                			COALESCE((sdsi.Cgst_Amo + sdsi.Sgst_Amo + sdsi.Igst_Amo), 0) AS gstAmount,
                			sdsi.Alt_Act_Qty,
                            sdsi.Act_Qty,
                            sdsi.Bill_Qty billQuantity,
                			sdsi.Item_Rate itemRate,
                			sdsi.Final_Amo amount,
                            CASE 
                            WHEN COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0) IS NULL
                            THEN 0 
                            ELSE CONVERT(DECIMAL(18,2), COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0))
                            END AS quantity
                		FROM tbl_Sales_Delivery_Stock_Info AS sdsi
                		LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
                        LEFT JOIN tbl_Pack_Master AS pm ON pm.Pack_Id = p.Pack_Id
                		WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id
                        ORDER BY sdsi.S_No ASC  
                		FOR JSON PATH
                	), '[]') AS productDetails,
                	COALESCE((
                		SELECT 
                			stf.Emp_Id AS empId,
                			stf.Emp_Type_Id AS empTypeId,
                			e.Cost_Center_Name AS empName,
                            cc.Cost_Category AS empType
                		FROM tbl_Sales_Delivery_Staff_Info AS stf
                		LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                		LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                		WHERE stf.Do_Id = sdgi.Do_Id
                		FOR JSON PATH
                	), '[]') AS staffDetails,
                	COALESCE((
                		SELECT 
                            em.Account_name AS expenseName, 
                            CASE  
                                WHEN exp.Expence_Value_DR > 0 THEN exp.Expence_Value_DR 
                                ELSE -exp.Expence_Value_CR
                            END AS expenseValue
                        FROM tbl_Sales_Delivery_Expence_Info AS exp
                        LEFT JOIN tbl_Account_Master AS em ON em.Acc_Id = exp.Expense_Id
                        WHERE exp.Do_Id = sdgi.Do_Id
                		FOR JSON PATH
                	), '[]') AS expencessDetails
                FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = sdgi.Retailer_Id
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = sdgi.Voucher_Type
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
                LEFT JOIN tbl_Sales_Delivery_Address AS sda ON sda.id = sdgi.deliveryAddressId
                WHERE sdgi.Do_Id = @Do_Id;`
            );

        const result = await request;

        const parseData = result.recordset.map(inv => ({
            ...inv,
            productDetails: JSON.parse(inv.productDetails),
            staffDetails: JSON.parse(inv.staffDetails),
            expencessDetails: JSON.parse(inv.expencessDetails)
        }))

        sentData(res, parseData);
    } catch (e) {
        servError(e, res);
    }
}

export const getSalesInvoiceDetails = async (Do_Id) => {
    try {

        const request = new sql.Request()
            .input('Do_Id', sql.BigInt, Do_Id)
            .query(`
                SELECT
                	sdgi.Do_Id id,
                    sdgi.Do_Inv_No,
                	sdgi.Voucher_Type voucherType,
                	v.Voucher_Type voucherTypeGet, 
                	cb.Name createdByGet,
                	sdgi.Created_on createdOn,
                	sda.deliveryName mailingName,
                	sda.deliveryAddress mailingAddress,
                	sda.cityName mailingCity,
                	sda.phoneNumber mailingNumber,
                	COALESCE((
                	    SELECT 
					     	p.Product_Rate,
                            p.Short_Name,
                            sdsi.Item_Rate,
							p.Pack_Id,
                			sdsi.Item_Id itemId,
                			p.Product_Name itemName,
                			sdsi.Alt_Act_Qty quantity,
                            sdsi.Bill_Qty,
                            sdsi.Alt_Act_Qty,
						pm.Pack
                		FROM tbl_Sales_Delivery_Stock_Info AS sdsi
                		LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
						LEFT JOIN tbl_Pack_Master As pm ON pm.Pack_Id=p.Pack_Id
                		WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id
                        ORDER BY sdsi.S_No ASC
                		FOR JSON PATH
                	), '[]') AS productDetails,
                	COALESCE((
                		SELECT 
                			stf.Emp_Id AS empId,
                			stf.Emp_Type_Id AS empTypeId,
                			e.Cost_Center_Name AS empName,
                            cc.Cost_Category AS empType
                		FROM tbl_Sales_Delivery_Staff_Info AS stf
                		LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                		LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                		WHERE stf.Do_Id = sdgi.Do_Id
                		FOR JSON PATH
                	), '[]') AS staffDetails
                FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = sdgi.Voucher_Type
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
                LEFT JOIN tbl_Sales_Delivery_Address AS sda ON sda.id = sdgi.deliveryAddressId
                WHERE sdgi.Do_Id = @Do_Id;`);

        const result = await request;

        const parseData = result.recordset.map(inv => ({
            ...inv,
            productDetails: JSON.parse(inv.productDetails),
            staffDetails: JSON.parse(inv.staffDetails)
        }));

        return {
            success: true,
            data: parseData
        }

    } catch (e) {
       
        return {
            success: false,
            data: [],
            error: e
        }
    }
}

export const PendingSalesInvoice = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const request = new sql.Request();
        request.input('reqDate', sql.Date, reqDate);

        const [invoicesResult, staffResult, stockResult, costTypesResult, uniqueStaffResult] = await Promise.all([

            request.query(`
                SELECT 
                    gen.Do_Id,
                    gen.Do_Inv_No,
                    gen.Voucher_Type,
                    vt.Voucher_Type AS voucherTypeGet,
                    gen.Do_Date,
                    gen.Retailer_Id,
                    s.Status AS Delivery_Status, 
                    s.Status_Id AS Delivery_Status_Id,
                    CASE  
                        WHEN gen.Cancel_status = 0 THEN 'Canceled Invoice' 
                        ELSE r.Retailer_Name
                    END AS retailerNameGet,
                    gen.Branch_Id,
                    b.BranchName AS branchNameGet,
                    gen.Total_Invoice_value,
                    gen.Cancel_status,
                    gen.Created_by,
                    gen.Created_on,
                    ISNULL(gen.staffInvolvedStatus, 0) staffInvolvedStatus,
                    CONVERT(DATETIME, gen.Created_on) AS createdOn,
                    gen.Narration
                FROM tbl_Sales_Delivery_Gen_Info AS gen WITH (NOLOCK)
                LEFT JOIN tbl_Voucher_Type AS vt WITH (NOLOCK) ON vt.Vocher_Type_Id = gen.Voucher_Type
                LEFT JOIN tbl_Retailers_Master AS r WITH (NOLOCK) ON r.Retailer_Id = gen.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS b WITH (NOLOCK) ON b.BranchId = gen.Branch_Id
                LEFT JOIN tbl_Status AS s WITH (NOLOCK) ON s.Status_Id = gen.Delivery_Status
                WHERE 
                    gen.Do_Date >= @reqDate
                    AND gen.Delivery_Status IN (1,2,5,6)
                ORDER BY gen.Do_Id;
            `),


            request.query(`
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info stf WITH (NOLOCK)
                INNER JOIN tbl_Sales_Delivery_Gen_Info gen WITH (NOLOCK) 
                    ON gen.Do_Id = stf.Do_Id 
                    AND gen.Do_Date >= @reqDate
                    AND gen.Delivery_Status IN (1,2,5,6)
                LEFT JOIN tbl_ERP_Cost_Center e WITH (NOLOCK) 
                    ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category cc WITH (NOLOCK) 
                    ON cc.Cost_Category_Id = stf.Emp_Type_Id
                ORDER BY stf.Do_Id;
            `),


            request.query(`
                SELECT 
                    sdsi.Do_Date,
                    sdsi.Delivery_Order_Id,
                    ISNULL(sdsi.Bill_Qty, 0) AS Bill_Qty,
                    ISNULL(sdsi.Act_Qty, 0) AS Act_Qty,
                    pck.Pack AS unitValue,
                    ISNULL(p.Product_Rate, 0) AS itemRate,
                    ISNULL(sdsi.Item_Rate, 0) AS billedRate
                FROM tbl_Sales_Delivery_Stock_Info sdsi WITH (NOLOCK)
                INNER JOIN tbl_Sales_Delivery_Gen_Info gen WITH (NOLOCK) 
                    ON gen.Do_Id = sdsi.Delivery_Order_Id 
                    AND gen.Do_Date >= @reqDate
                    AND gen.Delivery_Status IN (1,2,5,6)
                LEFT JOIN tbl_Product_Master p WITH (NOLOCK) 
                    ON p.Product_Id = sdsi.Item_Id
                LEFT JOIN tbl_Pack_Master pck WITH (NOLOCK) 
                    ON pck.Pack_Id = p.Pack_Id
                ORDER BY sdsi.S_No;
            `),


            request.query(`
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category WITH (NOLOCK)
                ORDER BY Cost_Category;
            `),


            request.query(`
                SELECT DISTINCT stf.Emp_Type_Id
                FROM tbl_Sales_Delivery_Staff_Info stf WITH (NOLOCK)
                INNER JOIN tbl_Sales_Delivery_Gen_Info gen WITH (NOLOCK) 
                    ON gen.Do_Id = stf.Do_Id 
                    AND gen.Do_Date >= @reqDate
                    AND gen.Delivery_Status IN (1,2,5,6)
                WHERE stf.Emp_Type_Id IS NOT NULL;
            `)
        ]);


        const invoices = invoicesResult.recordset;
        const staffs = staffResult.recordset;
        const stockDetails = stockResult.recordset;
        const costTypes = costTypesResult.recordset;
        const uniqueStaffs = uniqueStaffResult.recordset;


        const Division = (a, b) => {
            if (!b || b === 0) return 0;
            return Number(((a || 0) / b).toFixed(2));
        };

        const Subtraction = (a, b) => {
            return Number(((a || 0) - (b || 0)).toFixed(2));
        };


        const processedStockDetails = stockDetails.map(stock => ({
            Do_Date: stock.Do_Date,
            Delivery_Order_Id: stock.Delivery_Order_Id,
            Bill_Qty: stock.Bill_Qty,
            Act_Qty: stock.Act_Qty,
            unitValue: stock.unitValue,
            itemRate: stock.itemRate,
            billedRate: stock.billedRate,
            Alt_Act_Qty: Division(stock.Act_Qty, stock.unitValue),
            quantityDifference: Subtraction(stock.Bill_Qty, stock.Act_Qty)
        }));


        const staffMap = new Map();
        staffs.forEach(staff => {
            const doId = staff.Do_Id;
            if (!staffMap.has(doId)) {
                staffMap.set(doId, []);
            }
            staffMap.get(doId).push(staff);
        });

        const stockMap = new Map();
        processedStockDetails.forEach(stock => {
            const doId = stock.Delivery_Order_Id;
            if (!stockMap.has(doId)) {
                stockMap.set(doId, []);
            }
            stockMap.get(doId).push(stock);
        });

        const invoicesWithDetails = invoices.map(invoice => ({
            ...invoice,
            involvedStaffs: staffMap.get(invoice.Do_Id) || [],
            stockDetails: stockMap.get(invoice.Do_Id) || []
        }));


        const responseData = {
            data: invoicesWithDetails,
            options: {
                costTypes: costTypes,
                uniqeInvolvedStaffs: uniqueStaffs.map(item => item.Emp_Type_Id)
            }
        };


        sentData(res, invoicesWithDetails, {
            costTypes: costTypes,
            uniqeInvolvedStaffs: uniqueStaffs.map(i => i.Emp_Type_Id)
        });

    } catch (e) {
        servError(e, res);
    }
};

export const deliverySlipPrintOut = async (req, res) => {
    try {
        const { Do_Id } = req.query;

        if (!checkIsNumber(Do_Id)) return invalidInput(res, 'Do_Id is required');

        const request = new sql.Request()
            .input('Do_Id', sql.BigInt, Do_Id)
            .query(`
                SELECT
                	sdgi.Do_Id id,
                    sdgi.Do_Inv_No,
                	sdgi.Voucher_Type voucherType,
                	v.Voucher_Type voucherTypeGet, 
                	cb.Name createdByGet,
                	sdgi.Created_on createdOn,
                	sda.deliveryName mailingName,
                	sda.deliveryAddress mailingAddress,
                	sda.cityName mailingCity,
                	sda.phoneNumber mailingNumber,
                	COALESCE((
                	    SELECT 
					     	p.Product_Rate,
                            p.Short_Name,
                            sdsi.Item_Rate,
							p.Pack_Id,
                			sdsi.Item_Id itemId,
                			p.Product_Name itemName,
                			sdsi.Alt_Act_Qty,
                            sdsi.Bill_Qty,
                            sdsi.Act_Qty,
						    pm.Pack,
                        	 CASE 
                                WHEN COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0) IS NULL
                                THEN 0 
                                ELSE CONVERT(DECIMAL(18,2), COALESCE(sdsi.Act_Qty, 0) / NULLIF(COALESCE(TRY_CAST(pm.Pack AS DECIMAL(18,2)), 0), 0))
                            END AS quantity
                		FROM tbl_Sales_Delivery_Stock_Info AS sdsi
                		LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
						LEFT JOIN tbl_Pack_Master As pm ON pm.Pack_Id=p.Pack_Id
                		WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id
                        ORDER BY sdsi.S_No ASC  
                		FOR JSON PATH
                	), '[]') AS productDetails,
                	COALESCE((
                		SELECT 
                			stf.Emp_Id AS empId,
                			stf.Emp_Type_Id AS empTypeId,
                			e.Cost_Center_Name AS empName,
                            cc.Cost_Category AS empType
                		FROM tbl_Sales_Delivery_Staff_Info AS stf
                		LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                		LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                		WHERE stf.Do_Id = sdgi.Do_Id
                		FOR JSON PATH
                	), '[]') AS staffDetails
                FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = sdgi.Voucher_Type
                LEFT JOIN tbl_Users AS cb ON cb.UserId = sdgi.Created_by
                LEFT JOIN tbl_Sales_Delivery_Address AS sda ON sda.id = sdgi.deliveryAddressId
                WHERE sdgi.Do_Id = @Do_Id;`);

        const result = await request;

        const parseData = result.recordset.map(inv => ({
            ...inv,
            productDetails: JSON.parse(inv.productDetails),
            staffDetails: JSON.parse(inv.staffDetails)
        }))

        sentData(res, parseData);
    } catch (e) {
        servError(e, res);
    }
}

export const salesInvoicePaper = async (req, res) => {
    try {
        const reqDate = req.query?.reqDate ? ISOString(req.query.reqDate) : ISOString();

        const request = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .query(`
            -- SALES GENERAL INFO
                SELECT 
                	sdgi.Do_Id AS invId,
                	sdgi.Voucher_Type AS voucherId,
                	COALESCE(v.Voucher_Type, '-') AS voucheGet,
                	sdgi.Retailer_Id AS retailerId,
                	COALESCE(r.Retailer_Name, '-') AS retailerGet,
                	sdgi.Do_Inv_No voucherNumber,
                    sdgi.Created_on,
                    COALESCE(tm.Trip_No, '') AS tripNumber,
                    COALESCE(tm.Vehicle_No, '') AS vehicleNumber,
                    COALESCE(tm.Trip_Date, '') AS tripDate
                FROM tbl_Sales_Delivery_Gen_Info AS sdgi
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = sdgi.Voucher_Type
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = sdgi.Retailer_Id
                LEFT JOIN tbl_Trip_Details AS td ON td.Delivery_Id = sdgi.Do_Id
                LEFT JOIN tbl_Trip_mASTER AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE 
                    sdgi.Do_Date = @reqDate 
                    AND sdgi.Cancel_status <> 0
                ORDER BY v.Voucher_Type, sdgi.Created_on
            -- SALES STOCK INFO
                SELECT
                	sdgi.Do_Id AS invId,
                	sdsi.Item_Id AS itemId,
                	p.Product_Name AS itemNameGet,
                	COALESCE(sdsi.Bill_Qty, 0) AS billedQuantity,
                	COALESCE(sdsi.Act_Qty, 0) AS actQuantity,
                	COALESCE(sdsi.Alt_Act_Qty, 0) AS unitQuantity,
                	COALESCE(pck.Pack, '0') AS unitValue,
                	COALESCE(p.Product_Rate, 0) AS itemRate,
                	COALESCE(sdsi.Item_Rate, 0) AS billedRate
                --  COALESCE(tm.Trip_No, '') AS tripNumber,
                --  COALESCE(tm.Vehicle_No, '') AS vehicleNumber,
                --  COALESCE(tm.Trip_Date, '') AS tripDate
                FROM tbl_Sales_Delivery_Stock_Info AS sdsi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
                LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON sdgi.Do_Id = sdsi.Delivery_Order_Id
             -- LEFT JOIN tbl_Trip_Details AS td ON td.Delivery_Id = sdgi.Do_Id
             -- LEFT JOIN tbl_Trip_mASTER AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE sdgi.Do_Date = @reqDate AND sdgi.Cancel_status <> 0
                ORDER BY sdsi.S_No ASC;
            -- SALES STAFF DETAILS
                SELECT 
                	sdgi.Do_Id AS invId,
                	stf.Emp_Id AS empId,
                	stf.Emp_Type_Id AS empTypeId,
                	e.Cost_Center_Name AS empName,
                    cc.Cost_Category AS empType
                FROM tbl_Sales_Delivery_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON sdgi.Do_Id = stf.Do_Id
                WHERE 
                	sdgi.Do_Date = @reqDate AND sdgi.Cancel_status <> 0
                	AND cc.Cost_Category IN ('Broker', 'Load Man', 'Transport');`
            );

        const result = await request;

        const [salesDetails, stockDetails, staffDetails] = result.recordsets;

        const compiledData = salesDetails.map(inv => {
            const products = stockDetails.filter(stock => isEqualNumber(stock.invId, inv.invId));
            const staffs = staffDetails.filter(staff => isEqualNumber(staff.invId, inv.invId));

            const productsDifference = products.map(product => {
                return {
                    ...product,
                    quantityDifference: Subraction(product.billedQuantity, product.actQuantity),
                    actUnitQuantity: Division(product.actQuantity, product.unitValue)
                }
            })

            return {
                ...inv,
                productDetails: productsDifference,
                staffDetails: staffs
            }
        });

        sentData(res, compiledData);
    } catch (e) {
        servError(e, res);
    }
}



export const getSalesInvoiceForAssignCostCenterWhatsapp = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const status = req.query.staffStatus;

        const getSalesInvoice = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .input('status', sql.Int, toNumber(status))
            .query(`
            -- filtered invoices ids temp table
                DECLARE @FilteredInvoice TABLE (Do_Id BIGINT);
            -- inserting data to temp table
                INSERT INTO @FilteredInvoice (Do_Id)
                SELECT Do_Id
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE 
                    -- FIX: Convert both sides to DATE for comparison
                    CONVERT(DATE, Do_Date) = @reqDate
                    ${isEqualNumber(status, 0) ? ' AND ISNULL(staffInvolvedStatus, 0) = 0 ' : ''}
                SELECT 
                    gen.Do_Id,
                    gen.Do_Inv_No,
                    gen.Voucher_Type,
                    vt.Voucher_Type AS voucherTypeGet,
                    gen.Do_Date,
                    gen.Retailer_Id,
                    s.Status AS Delivery_Status, 
                    s.Status_Id AS Delivery_Status_Id,
                    CASE  
                        WHEN gen.Cancel_status = 0 THEN 'Canceled Invoice' 
                        ELSE r.Retailer_Name
                    END AS retailerNameGet,
                    gen.Branch_Id,
                    b.BranchName AS branchNameGet,
                    gen.Total_Invoice_value,
                    gen.Cancel_status,
                    gen.Created_by,
                    gen.Created_on,
                    ISNULL(gen.staffInvolvedStatus, 0) staffInvolvedStatus,
                    CONVERT(DATETIME, gen.Created_on) AS createdOn,
                    gen.Narration
                FROM tbl_Sales_Delivery_Gen_Info AS gen
                LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = gen.Voucher_Type
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = gen.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = gen.Branch_Id
                LEFT JOIN tbl_Status AS s ON s.Status_Id = gen.Delivery_Status
                WHERE gen.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY Do_Id;
            -- involved staffs
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
                ORDER BY stf.Do_Id;
            -- Unique Cost Category IDs
                SELECT DISTINCT Emp_Type_Id
                FROM tbl_Sales_Delivery_Staff_Info
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);
            -- Cost Types
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category
                ORDER BY Cost_Category;
            -- Stock Details
                SELECT 
                    sdsi.Do_Date,
                    sdsi.Delivery_Order_Id,
                    COALESCE(sdsi.Bill_Qty, 0) AS Bill_Qty,
                    COALESCE(sdsi.Act_Qty, 0) AS Act_Qty,
                    -- Calculated Alt_Act_Qty (SAFE)
                    CASE 
                        WHEN TRY_CAST(pck.Pack AS DECIMAL(18,2)) IS NULL
                             OR TRY_CAST(pck.Pack AS DECIMAL(18,2)) = 0
                        THEN 0
                        ELSE CONVERT(
                            DECIMAL(18,2),
                            COALESCE(sdsi.Bill_Qty, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
                        )
                    END AS Alt_Act_Qty,
                    -- Unit value (numeric)
                    TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS unitValue,
                    COALESCE(p.Product_Rate, 0) AS itemRate,
                    COALESCE(sdsi.Item_Rate, 0) AS billedRate
                FROM tbl_Sales_Delivery_Stock_Info sdsi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
                LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY sdsi.S_No`
            );

        const result = await getSalesInvoice;

        const [invoices = [], staffs = [], uniqeInvolvedStaffs = [], costTypes = [], stockDetails = []] = result.recordsets;

        const calculatedStockDetails = stockDetails.map(stock => ({
            ...stock,

            Alt_Act_Qty: Division(stock.Act_Qty, stock.unitValue),
            quantityDifference: Subraction(stock.Bill_Qty, stock.Act_Qty)
        }));

        const invoicesWithStaffs = invoices.map(invoice => {
            const involvedStaffs = staffs.filter(stf =>
                isEqualNumber(stf.Do_Id, invoice.Do_Id)
            );

            const invoiceStockDetails = calculatedStockDetails.filter(stk =>
                isEqualNumber(stk.Delivery_Order_Id, invoice.Do_Id)
            );

            return {
                ...invoice,
                involvedStaffs,
                stockDetails: invoiceStockDetails
            };
        });

        sentData(res, invoicesWithStaffs, {
            costTypes: toArray(costTypes),
            uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(i => i.Emp_Type_Id)
        });

    } catch (e) {
        servError(e, res);
    }
};



export const lrReportUploadgetMobile = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const status = req.query.staffStatus;

        const getSalesInvoice = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .input('status', sql.Int, toNumber(status))
            .query(`
    -- filtered invoices ids temp table
        DECLARE @FilteredInvoice TABLE (Do_Id BIGINT);
    -- inserting data to temp table
        INSERT INTO @FilteredInvoice (Do_Id)
        SELECT Do_Id
        FROM tbl_Sales_Delivery_Gen_Info
        WHERE 
            CONVERT(DATE, Do_Date) = @reqDate
            ${isEqualNumber(status, 0) ? ' AND ISNULL(staffInvolvedStatus, 0) = 0 ' : ''}
       SELECT 
    gen.Do_Id,
    gen.Do_Inv_No,
    gen.Voucher_Type,
    vt.Voucher_Type AS voucherTypeGet,
    gen.Do_Date,
    gen.Retailer_Id,
    s.Status AS Delivery_Status, 
    s.Status_Id AS Delivery_Status_Id,
    CASE  
        WHEN gen.Cancel_status = 0 THEN 'Canceled Invoice' 
        ELSE r.Retailer_Name
    END AS retailerNameGet,
    gen.Branch_Id,
    b.BranchName AS branchNameGet,
    gen.Total_Invoice_value,
    gen.Cancel_status,
    gen.Created_by,
    gen.Created_on,
    ISNULL(gen.staffInvolvedStatus, 0) staffInvolvedStatus,
    CONVERT(DATETIME, gen.Created_on) AS createdOn,
    gen.Narration,
    COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
    lr.ImageUrl,
    lr.Image_Name,
    lr.Id AS LrId,
    lr.Uploaded_By AS LR_Uploaded_By,
    COALESCE(lu.Name, '') AS LR_Uploaded_By_Name
FROM tbl_Sales_Delivery_Gen_Info AS gen
LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = gen.Voucher_Type
LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = gen.Retailer_Id
LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = gen.Branch_Id
LEFT JOIN tbl_Status AS s ON s.Status_Id = gen.Delivery_Status
LEFT JOIN tbl_Users AS cb ON cb.UserId = gen.Created_by
LEFT JOIN (
    SELECT 
        Id,
        Do_Id,
        ImageUrl,
        Image_Name,
        Uploaded_By,
        ROW_NUMBER() OVER (PARTITION BY Do_Id ORDER BY Id DESC) as rn
    FROM tbl_LrReport
) AS lr ON CAST(lr.Do_Id AS BIGINT) = gen.Do_Id AND lr.rn = 1
LEFT JOIN tbl_Users AS lu ON lu.UserId = lr.Uploaded_By
WHERE gen.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
ORDER BY Do_Id;
    -- involved staffs
        SELECT 
            stf.*,
            e.Cost_Center_Name AS Emp_Name,
            cc.Cost_Category AS Involved_Emp_Type
        FROM tbl_Sales_Delivery_Staff_Info AS stf
        LEFT JOIN tbl_ERP_Cost_Center AS e
            ON e.Cost_Center_Id = stf.Emp_Id
        LEFT JOIN tbl_ERP_Cost_Category AS cc
            ON cc.Cost_Category_Id = stf.Emp_Type_Id
        WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
        ORDER BY stf.Do_Id;
    -- Unique Cost Category IDs
        SELECT DISTINCT Emp_Type_Id
        FROM tbl_Sales_Delivery_Staff_Info
        WHERE Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);
    -- Cost Types
        SELECT Cost_Category_Id, Cost_Category
        FROM tbl_ERP_Cost_Category
        ORDER BY Cost_Category;
    -- Stock Details
        SELECT 
            sdsi.Do_Date,
            sdsi.Delivery_Order_Id,
            sdsi.Item_Id,
            sdsi.S_No,
            gm.Godown_Name,
            COALESCE(p.Product_Name, 'not available') AS Product_Name,
            COALESCE(p.Product_Image_Name, 'not available') AS Product_Image_Name,
            COALESCE(u.Units, 'not available') AS UOM,
            COALESCE(br.Brand_Name, 'not available') AS Brand_Name,
            COALESCE(sdsi.Bill_Qty, 0) AS Bill_Qty,
            COALESCE(sdsi.Act_Qty, 0) AS Act_Qty,
            CASE 
                WHEN TRY_CAST(pck.Pack AS DECIMAL(18,2)) IS NULL
                     OR TRY_CAST(pck.Pack AS DECIMAL(18,2)) = 0
                THEN 0
                ELSE CONVERT(
                    DECIMAL(18,2),
                    COALESCE(sdsi.Bill_Qty, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
                )
            END AS Alt_Act_Qty,
            TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS unitValue,
            COALESCE(p.Product_Rate, 0) AS itemRate,
            COALESCE(sdsi.Item_Rate, 0) AS billedRate
        FROM tbl_Sales_Delivery_Stock_Info sdsi
        LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Item_Id
        LEFT JOIN tbl_UOM AS u ON u.Unit_Id = sdsi.Unit_Id
        LEFT JOIN tbl_Brand_Master AS br ON br.Brand_Id = p.Brand
        LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
        LEFT JOIN tbl_Godown_Master As gm ON gm.Godown_Id =sdsi.GoDown_Id
        WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
        ORDER BY sdsi.Delivery_Order_Id, sdsi.S_No`
            );

        const result = await getSalesInvoice;

        const [invoices = [], staffs = [], uniqeInvolvedStaffs = [], costTypes = [], stockDetails = []] = result.recordsets;

        if (!invoices.length) {
            return noData(res);
        }

        const calculatedStockDetails = stockDetails.map(stock => ({
            ...stock,
            Alt_Act_Qty: Division(stock.Act_Qty, stock.unitValue),
            quantityDifference: Subraction(stock.Bill_Qty, stock.Act_Qty)
        }));
      

        
        const invoicesWithStaffs = invoices.map(invoice => {
            const involvedStaffs = staffs.filter(stf =>
                isEqualNumber(stf.Do_Id, invoice.Do_Id)
            );

            const invoiceStockDetails = calculatedStockDetails.filter(stk =>
                isEqualNumber(stk.Delivery_Order_Id, invoice.Do_Id)
            );

             
            const transformedImageUrl = getImage('LRReport',invoice.Image_Name);
            
            const hasImage = invoice.Image_Name && invoice.Image_Name.trim() !== '';
            const imageStatus = hasImage ? 'uploaded' : 'pending';

            const { ImageUrl, Image_Name, LrId, ...invoiceWithoutImageUrl } = invoice;

            const transformedInvoice = {
                ...invoiceWithoutImageUrl,
                Id: LrId,
                Imageurl: transformedImageUrl,  
                Image_Name: Image_Name || '',
                imageStatus: imageStatus,
                involvedStaffs,
                stockDetails: invoiceStockDetails
            };

            return transformedInvoice;
        });

        dataFound(res, invoicesWithStaffs, {
            costTypes: toArray(costTypes),
            uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(i => i.Emp_Type_Id)
        });

    } catch (e) {
        servError(e, res);
    }
}



// export const lrReportUploadMobile = async (req, res) => {

//     const transaction = new sql.Transaction();

//     try {
//         await uploadFile(req, res, 6, 'LRReport');

//         const fileName = req?.file?.filename;
//         const filePath = req?.file?.path;

//         const { Do_Id, Do_Inv_No, involvedStaffs, staffInvolvedStatus = 0, Uploaded_By } = req.body;

//         if (!Do_Id) {
//             return invalidInput(res, 'Do_Id is required');
//         }

//         await transaction.begin();


//         const updateStatusRequest = new sql.Request(transaction);
//         await updateStatusRequest
//             .input('Do_Id', sql.BigInt, Do_Id)
//             .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
//             .query(`
//                 UPDATE tbl_Sales_Delivery_Gen_Info
//                 SET staffInvolvedStatus = @staffInvolvedStatus
//                 WHERE Do_Id = @Do_Id;
//             `);


//         if (involvedStaffs && JSON.parse(involvedStaffs || '[]').length > 0) {
//             const staffRequest = new sql.Request(transaction);
//             await staffRequest
//                 .input('Do_Id', sql.BigInt, Do_Id)
//                 .input('involvedStaffs', sql.NVarChar, involvedStaffs)
//                 .query(`
//                     INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
//                     SELECT 
//                         @Do_Id,
//                         JSON_VALUE(value, '$.Emp_Type_Id') AS Emp_Type_Id,
//                         JSON_VALUE(value, '$.Emp_Id') AS Emp_Id
//                     FROM OPENJSON(@involvedStaffs);
//                 `);
//         }


//         if (fileName) {

//             const idRequest = new sql.Request(transaction);
//             const idResult = await idRequest.query(`
//                 SELECT ISNULL(MAX(Id), 0) + 1 AS NewId 
//                 FROM tbl_LrReport WITH (UPDLOCK, HOLDLOCK)
//             `);
//             const newLrId = idResult.recordset[0].NewId;

//             const imageRequest = new sql.Request(transaction);
//             await imageRequest
//                 .input('Id', sql.BigInt, newLrId)
//                 .input('Do_Id', sql.NVarChar, Do_Id.toString())
//                 .input('Do_Inv_No', sql.NVarChar, Do_Inv_No || '')
//                 .input('ImageUrl', sql.NVarChar, filePath )
//                 .input('Image_Name', fileName)
//                 .input('Uploaded_By', sql.BigInt, Uploaded_By || null)
//                 .query(`
//                     INSERT INTO tbl_LrReport (Id, Do_Id, Do_Inv_No, ImageUrl,Image_Name, Uploaded_By)
//                     VALUES (@Id, @Do_Id, @Do_Inv_No, @ImageUrl,@Image_Name, @Uploaded_By);
//                 `);
//         }

//         await transaction.commit();

//         success(res, 'Changes saved successfully');
//     } catch (e) {
//         if (transaction._aborted === false) {
//             await transaction.rollback();
//         }
//         servError(e, res);
//     }
// };

// export const lrReportUpdateMobile = async (req, res) => {
//     const transaction = new sql.Transaction();

//     try {
//         await uploadFile(req, res, 6, 'LRReport');

//         const fileName = req?.file?.filename;
//         const filePath = req?.file?.path;

//         if (!fileName) {
//             return invalidInput(res, 'New image is required');
//         }

//         const { Id, Do_Id, Do_Inv_No, Uploaded_By } = req.body;

//         if (!Id) {
//             return invalidInput(res, 'Id is required to update');
//         }

//         await transaction.begin();

        
//         const getOldImageRequest = new sql.Request(transaction);
//         const oldImageResult = await getOldImageRequest
//             .input('Id', sql.BigInt, Id)
//             .query(`SELECT ImageUrl FROM tbl_LrReport WHERE Id = @Id`);

//         if (oldImageResult.recordset.length === 0) {
//             await transaction.rollback();
//             return failed(res, 'LR Report record not found');
//         }

//         // Delete old image file
//         const oldImagePath = oldImageResult.recordset[0].ImageUrl;
//         if (oldImagePath) {
//             try {
//                 const fs = await import('fs');
//                 if (fs.existsSync(oldImagePath)) {
//                     fs.unlinkSync(oldImagePath);
//                 }
//             } catch (fileErr) {
//                 console.error('Failed to delete old image file:', fileErr.message);
//             }
//         }

//         // Delete the old record
//         const deleteRequest = new sql.Request(transaction);
//         await deleteRequest
//             .input('Id', sql.BigInt, Id)
//             .query(`DELETE FROM tbl_LrReport WHERE Id = @Id`);

//         // Insert new record with same Id
//         const insertRequest = new sql.Request(transaction);
//         await insertRequest
//             .input('Id', sql.BigInt, Id)
//             .input('Do_Id', sql.NVarChar, Do_Id?.toString() || '')
//             .input('Do_Inv_No', sql.NVarChar, Do_Inv_No || '')
//             .input('ImageUrl', sql.NVarChar, filePath)
//             .input('Image_Name', sql.NVarChar, fileName)
//             .input('Uploaded_By', sql.BigInt, Uploaded_By || null)
//             .query(`
//                 INSERT INTO tbl_LrReport (Id, Do_Id, Do_Inv_No, ImageUrl, Image_Name, Uploaded_By)
//                 VALUES (@Id, @Do_Id, @Do_Inv_No, @ImageUrl, @Image_Name, @Uploaded_By)
//             `);

//         await transaction.commit();
//         success(res, 'LR Report image updated successfully');

//     } catch (e) {
//         if (transaction._aborted === false) {
//             await transaction.rollback();
//         }
//         servError(e, res);
//     }
// };


export const lrReportUploadMobile = async (req, res) => {

    const transaction = new sql.Transaction();
    let transactionBegun = false;

    try {
        await uploadFile(req, res, 6, 'LRReport');

        const fileName = req?.file?.filename;
        const filePath = req?.file?.path;

        const { Do_Id, Do_Inv_No, involvedStaffs, staffInvolvedStatus, Uploaded_By } = req.body;
       

        if (!Do_Id) {
            return invalidInput(res, 'Do_Id is required');
        }

        await transaction.begin();
        transactionBegun = true;


     

        if (involvedStaffs && JSON.parse(involvedStaffs || '[]').length > 0) {
            const staffRequest = new sql.Request(transaction);
            await staffRequest
                .input('Do_Id', sql.BigInt, Do_Id)
                .input('involvedStaffs', sql.NVarChar, involvedStaffs)
                .query(`
                    INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
                    SELECT 
                        @Do_Id,
                        JSON_VALUE(value, '$.Emp_Type_Id') AS Emp_Type_Id,
                        JSON_VALUE(value, '$.Emp_Id') AS Emp_Id
                    FROM OPENJSON(@involvedStaffs);
                `);
        }


        if (fileName) {

            const idRequest = new sql.Request(transaction);
            const idResult = await idRequest.query(`
                SELECT ISNULL(MAX(Id), 0) + 1 AS NewId 
                FROM tbl_LrReport WITH (UPDLOCK, HOLDLOCK)
            `);
            const newLrId = idResult.recordset[0].NewId;

            const imageRequest = new sql.Request(transaction);
            await imageRequest
                .input('Id', sql.BigInt, newLrId)
                .input('Do_Id', sql.NVarChar, Do_Id.toString())
                .input('Do_Inv_No', sql.NVarChar, Do_Inv_No || '')
                .input('ImageUrl', sql.NVarChar, filePath )
                .input('Image_Name', fileName)
                .input('Uploaded_By', sql.BigInt, Uploaded_By || null)
                .query(`
                    INSERT INTO tbl_LrReport (Id, Do_Id, Do_Inv_No, ImageUrl,Image_Name, Uploaded_By)
                    VALUES (@Id, @Do_Id, @Do_Inv_No, @ImageUrl,@Image_Name, @Uploaded_By);
                `);
        }

        await transaction.commit();

        success(res, 'Changes saved successfully');
    } catch (e) {
        if (transactionBegun) {
            try { await transaction.rollback(); } catch (_) { /* already rolled back or aborted */ }
        }
        servError(e, res);
    }
};

export const lrReportUpdateMobile = async (req, res) => {
    const transaction = new sql.Transaction();
    let transactionBegun = false;

    try {
        await uploadFile(req, res, 6, 'LRReport');

        const fileName = req?.file?.filename;
        const filePath = req?.file?.path;

        if (!fileName) {
            return invalidInput(res, 'New image is required');
        }

        const { Id, Do_Id, Do_Inv_No, Uploaded_By } = req.body;

        if (!Id) {
            return invalidInput(res, 'Id is required to update');
        }

        await transaction.begin();
        transactionBegun = true;

        
        const getOldImageRequest = new sql.Request(transaction);
        const oldImageResult = await getOldImageRequest
            .input('Id', sql.BigInt, Id)
            .query(`SELECT ImageUrl FROM tbl_LrReport WHERE Id = @Id`);

        if (oldImageResult.recordset.length === 0) {
            await transaction.rollback();
            transactionBegun = false;
            return failed(res, 'LR Report record not found');
        }

        // Delete old image file
        const oldImagePath = oldImageResult.recordset[0].ImageUrl;
        if (oldImagePath) {
            try {
                const fs = await import('fs');
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            } catch (fileErr) {
                console.error('Failed to delete old image file:', fileErr.message);
            }
        }

        // Delete the old record
        const deleteRequest = new sql.Request(transaction);
        await deleteRequest
            .input('Id', sql.BigInt, Id)
            .query(`DELETE FROM tbl_LrReport WHERE Id = @Id`);

        // Insert new record with same Id
        const insertRequest = new sql.Request(transaction);
        await insertRequest
            .input('Id', sql.BigInt, Id)
            .input('Do_Id', sql.NVarChar, Do_Id?.toString() || '')
            .input('Do_Inv_No', sql.NVarChar, Do_Inv_No || '')
            .input('ImageUrl', sql.NVarChar, filePath)
            .input('Image_Name', sql.NVarChar, fileName)
            .input('Uploaded_By', sql.BigInt, Uploaded_By || null)
            .query(`
                INSERT INTO tbl_LrReport (Id, Do_Id, Do_Inv_No, ImageUrl, Image_Name, Uploaded_By)
                VALUES (@Id, @Do_Id, @Do_Inv_No, @ImageUrl, @Image_Name, @Uploaded_By)
            `);

        await transaction.commit();
        success(res, 'LR Report image updated successfully');

    } catch (e) {
        if (transactionBegun) {
            try { await transaction.rollback(); } catch (_) { }
        }
        servError(e, res);
    }
};

export const getSalesOrderForAssignCostCenterWhatsapp = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? req.query.reqDate : ISOString();
        const status = req.query.staffStatus;

        const getSalesOrder = new sql.Request()
            .input('reqDate', sql.Date, new Date(reqDate))
            .input('status', sql.Int, toNumber(status))
            .query(`
            -- filtered sales orders temp table
                DECLARE @FilteredSalesOrder TABLE (So_Id BIGINT);
            
            -- inserting sales order data to temp table (all sales orders for the date)
                INSERT INTO @FilteredSalesOrder (So_Id)
                SELECT So_Id
                FROM tbl_Sales_Order_Gen_Info
                WHERE 
                    CAST(So_Date AS DATE) = CAST(@reqDate AS DATE)
            
            -- Debug: Return the count and sample data
                SELECT 
                    COUNT(*) AS TotalOrders,
                    @reqDate AS RequestDate,
                    (SELECT TOP 1 So_Date FROM tbl_Sales_Order_Gen_Info WHERE CAST(So_Date AS DATE) = CAST(@reqDate AS DATE)) AS SampleDate,
                    (SELECT TOP 1 Cancel_status FROM tbl_Sales_Order_Gen_Info WHERE CAST(So_Date AS DATE) = CAST(@reqDate AS DATE)) AS SampleCancelStatus
                FROM tbl_Sales_Order_Gen_Info
                WHERE CAST(So_Date AS DATE) = CAST(@reqDate AS DATE)
            
            -- Sales Orders with Conversion Status
                SELECT 
                    'SalesOrder' AS Document_Type,
                    sog.So_Id AS So_Id,
                    sog.So_Inv_No AS So_Inv_No,
                    sog.VoucherType AS Voucher_Type,
                    vt.Voucher_Type AS voucherTypeGet,
                    sog.So_Date AS Document_Date,
                    sog.Retailer_Id,
                    ISNULL(r.Retailer_Name, 'Unknown') AS retailerNameGet,
                    sog.Branch_Id,
                    b.BranchName AS branchNameGet,
                    sog.Total_Invoice_value,
                    sog.Cancel_status,
                    sog.Created_by,
                    sog.Created_on,
                    CONVERT(DATETIME, sog.Created_on) AS createdOn,
                    sog.Narration,
                    sog.isConverted,
                    CASE 
                        WHEN sog.Cancel_status = 0 THEN 'Canceled Order'
                        WHEN EXISTS (
                            SELECT 1 
                            FROM tbl_Sales_Delivery_Gen_Info dgi 
                            WHERE dgi.So_No = sog.So_Id
                        ) THEN 'Converted to Delivery'
                        ELSE 'Not Converted'
                    END AS Conversion_Status,
                    (
                        SELECT TOP 1 
                            dgi.Do_Id,
                            dgi.Do_Inv_No,
                            dgi.Do_Date,
                            dgi.Delivery_Status
                        FROM tbl_Sales_Delivery_Gen_Info dgi
                        WHERE dgi.So_No = sog.So_Id
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    ) AS Delivery_Details
                FROM tbl_Sales_Order_Gen_Info AS sog
                LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = sog.VoucherType
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = sog.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = sog.Branch_Id
                WHERE sog.So_Id IN (SELECT So_Id FROM @FilteredSalesOrder)
                ORDER BY sog.So_Date, sog.So_Id;
            
            -- Sales Order Staff Info
                SELECT 
                    'SalesOrder' AS Document_Type,
                    sosi.So_Id AS So_Id,
                    sosi.Involved_Emp_Id AS Emp_Id,
                    sosi.Cost_Center_Type_Id AS Emp_Type_Id,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Sales_Order_Staff_Info AS sosi
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = sosi.Involved_Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
                WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredSalesOrder)
                ORDER BY sosi.So_Id;
            
            -- Unique Cost Category IDs from Sales Orders
                SELECT DISTINCT sosi.Cost_Center_Type_Id AS Emp_Type_Id
                FROM tbl_Sales_Order_Staff_Info sosi
                WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredSalesOrder);
            
            -- Cost Types
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category
                ORDER BY Cost_Category;
            
            -- Sales Order Stock Details
                SELECT 
                    'SalesOrder' AS Document_Type,
                    sosi.Sales_Order_Id AS So_Id,
                    sosi.So_Date AS Document_Date,
                    COALESCE(sosi.Bill_Qty, 0) AS Bill_Qty,
                    COALESCE(sosi.Free_Qty, 0) AS Free_Qty,
                    COALESCE(sosi.Total_Qty, 0) AS Total_Qty,
                    COALESCE(sosi.Item_Rate, 0) AS Item_Rate,
                    COALESCE(sosi.Taxable_Rate, 0) AS Taxable_Rate,
                    COALESCE(sosi.Amount, 0) AS Amount,
                    COALESCE(sosi.Tax_Rate, 0) AS Tax_Rate,
                    COALESCE(sosi.Cgst, 0) AS Cgst,
                    COALESCE(sosi.Cgst_Amo, 0) AS Cgst_Amo,
                    COALESCE(sosi.Sgst, 0) AS Sgst,
                    COALESCE(sosi.Sgst_Amo, 0) AS Sgst_Amo,
                    COALESCE(sosi.Igst, 0) AS Igst,
                    COALESCE(sosi.Igst_Amo, 0) AS Igst_Amo,
                    COALESCE(sosi.Final_Amo, 0) AS Final_Amo,
                    sosi.Item_Id,
                    p.Product_Name,
                    p.HSN_Code,
                    pck.Pack AS Unit_Name,
                    sosi.Taxble
                FROM tbl_Sales_Order_Stock_Info sosi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sosi.Item_Id
                LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                WHERE sosi.Sales_Order_Id IN (SELECT So_Id FROM @FilteredSalesOrder)
                ORDER BY sosi.Sales_Order_Id, sosi.S_No;
            
            -- Get Delivery details for converted orders
                SELECT 
                    dgi.So_No AS Sales_Order_Id,
                    dgi.Do_Id,
                    dgi.Do_Inv_No AS Delivery_Invoice_No,
                    dgi.Do_Date AS Delivery_Date,
                    dgi.Delivery_Status,
                    s.Status AS Delivery_Status_Name,
                    dgi.Total_Invoice_value AS Delivery_Total_Value,
                    dgi.Delivery_Person_Id
                FROM tbl_Sales_Delivery_Gen_Info dgi
                LEFT JOIN tbl_Status s ON s.Status_Id = dgi.Delivery_Status
                WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredSalesOrder)
                ORDER BY dgi.So_No;
        `);

        const result = await getSalesOrder;

     
        const debugInfo = result.recordsets[0] || [];
        const orders = result.recordsets[1] || [];
        const staffs = result.recordsets[2] || [];
        const uniqueInvolvedStaffs = result.recordsets[3] || [];
        const costTypes = result.recordsets[4] || [];
        const stockDetails = result.recordsets[5] || [];
        const deliveryDetails = result.recordsets[6] || [];

   

        if (orders.length === 0) {
            return sentData(res, [], {
                costTypes: [],
                uniqueInvolvedStaffs: [],
                summary: {
                    total_orders: 0,
                    converted_orders: 0,
                    not_converted_orders: 0,
                    canceled_orders: 0,
                    total_order_value: 0,
                    message: `No sales orders found for date: ${reqDate}.`
                },
                debug: debugInfo[0]
            });
        }

        // Calculate additional fields for stock details
        const calculatedStockDetails = stockDetails.map(stock => ({
            ...stock,
            Total_Amount: stock.Final_Amo || stock.Amount || 0,
            Tax_Amount: (Number(stock.Cgst_Amo) || 0) + (Number(stock.Sgst_Amo) || 0) + (Number(stock.Igst_Amo) || 0),
            Subtotal: (Number(stock.Item_Rate) || 0) * (Number(stock.Bill_Qty) || 0)
        }));

        // Group staff and stock details by order
        const ordersWithDetails = orders.map(order => {
            // Filter staffs using So_Id
            const involvedStaffs = staffs.filter(stf =>
                isEqualNumber(stf.So_Id, order.So_Id) && stf.Document_Type === order.Document_Type
            );

            // Filter stock details using So_Id
            const orderStockDetails = calculatedStockDetails.filter(stk =>
                isEqualNumber(stk.So_Id, order.So_Id) && stk.Document_Type === order.Document_Type
            );

            // Get delivery details for this order if converted
            const deliveryInfo = deliveryDetails.find(del => 
                isEqualNumber(del.Sales_Order_Id, order.So_Id)
            );

            // Parse Delivery_Details JSON if it exists
            let parsedDeliveryDetails = null;
            if (order.Delivery_Details) {
                try {
                    parsedDeliveryDetails = JSON.parse(order.Delivery_Details);
                } catch(e) {
                    console.error('Error parsing delivery details:', e);
                }
            }

            return {
                ...order,
                involvedStaffs,
                stockDetails: orderStockDetails,
                // Add delivery information if converted
                ...(deliveryInfo && {
                    Delivery_Info: {
                        Delivery_Id: deliveryInfo.Do_Id,
                        Delivery_Invoice_No: deliveryInfo.Delivery_Invoice_No,
                        Delivery_Date: deliveryInfo.Delivery_Date,
                        Delivery_Status_Id: deliveryInfo.Delivery_Status,
                        Delivery_Status: deliveryInfo.Delivery_Status_Name,
                        Delivery_Total_Value: deliveryInfo.Delivery_Total_Value
                    }
                }),
                // Include parsed delivery details
                Delivery_Details_Info: parsedDeliveryDetails,
                // Calculate summary statistics
                Order_Summary: {
                    Total_Items: orderStockDetails.length,
                    Total_Quantity: orderStockDetails.reduce((sum, item) => sum + (Number(item.Bill_Qty) || 0), 0),
                    Total_Free_Quantity: orderStockDetails.reduce((sum, item) => sum + (Number(item.Free_Qty) || 0), 0),
                    Total_Amount: orderStockDetails.reduce((sum, item) => sum + (Number(item.Final_Amo) || 0), 0),
                    Total_Tax: orderStockDetails.reduce((sum, item) => sum + (Number(item.Cgst_Amo) || 0) + (Number(item.Sgst_Amo) || 0) + (Number(item.Igst_Amo) || 0), 0)
                }
            };
        });

        // Prepare response
        sentData(res, ordersWithDetails, {
            costTypes: toArray(costTypes),
            uniqueInvolvedStaffs: toArray(uniqueInvolvedStaffs).map(i => i.Emp_Type_Id).filter(Boolean),
            summary: {
                total_orders: ordersWithDetails.length,
                converted_orders: ordersWithDetails.filter(o => o.Conversion_Status === 'Converted to Delivery').length,
                not_converted_orders: ordersWithDetails.filter(o => o.Conversion_Status === 'Not Converted').length,
                canceled_orders: ordersWithDetails.filter(o => o.Conversion_Status === 'Canceled Order').length,
                total_order_value: ordersWithDetails.reduce((sum, o) => sum + (Number(o.Total_Invoice_value) || 0), 0)
            },
            debug: debugInfo[0]
        });

    } catch (e) {
        console.error('Error in getSalesOrderForAssignCostCenterWhatsapp:', e);
        servError(e, res);
    }
};


// export const lrReportUploadMobile = async (req, res) => {
//     const transaction = new sql.Transaction();

//     try {
//         await uploadFile(req, res, 0, 'LR_Image');

//         const fileName = req?.file?.filename;
//         const filePath = req?.file?.path;

//         const { Do_Id, Do_Inv_No, staffInvolvedStatus = 0, Uploaded_By } = req.body;

//         // ✅ Parse involvedStaffs — handles both string and array
//         let involvedStaffs = [];
//         try {
//             const raw = req.body.involvedStaffs;
//             if (Array.isArray(raw)) {
//                 involvedStaffs = raw;
//             } else if (typeof raw === 'string' && raw.trim()) {
//                 involvedStaffs = JSON.parse(raw);
//             }
//         } catch (parseErr) {
//             return invalidInput(res, 'involvedStaffs must be a valid JSON array');
//         }

//         if (!Do_Id) {
//             return invalidInput(res, 'Do_Id is required');
//         }

//         await transaction.begin();

//         // 1. Update staffInvolvedStatus
//         const updateStatusRequest = new sql.Request(transaction);
//         await updateStatusRequest
//             .input('Do_Id', sql.BigInt, Do_Id)
//             .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
//             .query(`
//                 UPDATE tbl_Sales_Delivery_Gen_Info
//                 SET staffInvolvedStatus = @staffInvolvedStatus
//                 WHERE Do_Id = @Do_Id;
//             `);

//         // 2. Insert staff entries
//         if (involvedStaffs.length > 0) {
//             const staffRequest = new sql.Request(transaction);
//             await staffRequest
//                 .input('Do_Id', sql.BigInt, Do_Id)
//                 .input('involvedStaffs', sql.NVarChar, JSON.stringify(involvedStaffs))
//                 .query(`
//                     INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
//                     SELECT
//                         @Do_Id,
//                         JSON_VALUE(value, '$.Emp_Type_Id') AS Emp_Type_Id,
//                         JSON_VALUE(value, '$.Emp_Id') AS Emp_Id
//                     FROM OPENJSON(@involvedStaffs);
//                 `);
//         }

//         // 3. Insert image into tbl_LrReport
//         if (fileName) {
//             const idRequest = new sql.Request(transaction);
//             const idResult = await idRequest.query(`
//                 SELECT ISNULL(MAX(Id), 0) + 1 AS NewId
//                 FROM tbl_LrReport WITH (UPDLOCK, HOLDLOCK)
//             `);
//             const newLrId = idResult.recordset[0].NewId;

//             const imageRequest = new sql.Request(transaction);
//             await imageRequest
//                 .input('Id', sql.BigInt, newLrId)
//                 .input('Do_Id', sql.NVarChar, Do_Id.toString())
//                 .input('Do_Inv_No', sql.NVarChar, Do_Inv_No || '')
//                 .input('ImageUrl', sql.NVarChar, filePath || fileName)
//                 .input('Uploaded_By', sql.BigInt, Uploaded_By || null)
//                 .query(`
//                     INSERT INTO tbl_LrReport (Id, Do_Id, Do_Inv_No, ImageUrl, Uploaded_By)
//                     VALUES (@Id, @Do_Id, @Do_Inv_No, @ImageUrl, @Uploaded_By);
//                 `);
//         }

//         await transaction.commit();
//         success(res, 'Changes saved successfully');

//     } catch (e) {
//         if (transaction._aborted === false) {
//             await transaction.rollback();
//         }
//         servError(e, res);
//     }
// };