import sql from 'mssql';
import { checkIsNumber, Division, isEqualNumber, ISOString, Multiplication, Subraction, toArray, toNumber } from '../../../helper_functions.mjs';
import { servError, sentData, success, invalidInput, failed } from '../../../res.mjs';
import { validateBody } from '../../../middleware/zodValidator.mjs';
import { multipleSalesInvoiceStaffUpdateSchema } from './validationSchema.mjs';

export const getSalesInvoiceForAssignCostCenter = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const status = req.query.staffStatus ? req.query.staffStatus : 0;

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
                            OALESCE(sdsi.Bill_Qty, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
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
        const { Do_Id, involvedStaffs, staffInvolvedStatus = 0 } = req.body;

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

        const { CostCategory, Do_Id, involvedStaffs, staffInvolvedStatus = 0, deliveryStatus = 5 } = req.body;
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
        console.log(e);
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
                ORDER BY sdsi.Delivery_Order_Id;
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


// export const deliverySlipPrintOut = async (req, res) => {
//     try {
//         const { Do_Id } = req.query;

//         if (!checkIsNumber(Do_Id)) return invalidInput(res, 'Do_Id is required');

//         const salesDetails = await getSalesInvoiceDetails(Do_Id);

//         if (!salesDetails.success) return failed(res);

//         sentData(res, salesDetails);
//     } catch (e) {
//         servError(e, res);
//     }
// }

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