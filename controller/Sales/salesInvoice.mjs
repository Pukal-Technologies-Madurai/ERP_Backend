import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../helper_functions.mjs';
import { invalidInput, servError, dataFound, noData, sentData, success } from '../../res.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import PDFDocument from 'pdfkit';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import fsSync from 'fs';
import { clearScreenDown } from 'readline';
const SalesInvoice = () => {

    const getSalesInvoiceMobileFilter1 = async (req, res) => {
    try {
        const { 
            Retailer_Id, 
            Cancel_status = 0, 
            Created_by, 
            VoucherType, 
            Branch_Id, 
            User_Id,
            filter1, 
            filter2,
            filter3,
            filter4
        } = req.query;

        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const parseFilterValues = (filterParam) => {
            if (!filterParam) return null;
            return filterParam.split(',').map(val => val.trim()).filter(val => val);
        };

        const filter1Values = parseFilterValues(filter1);
        const filter2Values = parseFilterValues(filter2);
        // const filter3Values = parseFilterValues(filter3);
        //  const filter4Values = parseFilterValues(filter4);

     
        const mobileFilters = await new sql.Request().query(`
            SELECT 
                mrd.Type AS FilterType,
                mrd.Column_Name AS ColumnName,
                mrd.Table_Id AS TableId,
                tm.Table_Name AS TableName,
                mrd.FilterLevel,
                STUFF((
                    SELECT DISTINCT ',' + CAST(mrd2.List_Type AS VARCHAR(10))
                    FROM tbl_Mobile_Report_Details mrd2
                    WHERE mrd2.Type = mrd.Type 
                    AND mrd2.Table_Id = mrd.Table_Id 
                    AND mrd2.Column_Name = mrd.Column_Name
                    AND mrd2.Mob_Rpt_Id = mrd.Mob_Rpt_Id
                    FOR XML PATH('')
                ), 1, 1, '') AS ListTypes
            FROM tbl_Mobile_Report_Details mrd 
            INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
            LEFT JOIN tbl_Mobile_Rpt_Table_Master tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = 'Sales Invoice' AND FilterLevel =1
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name,mrd.FilterLevel
            ORDER BY mrd.Type
        `);

        const checkTableHasRetId = async (tableName) => {
            try {
                const columnCheck = await new sql.Request().query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = '${tableName}' 
                    AND COLUMN_NAME = 'Ret_Id'
                `);
                return columnCheck.recordset.length > 0;
            } catch (error) {
                console.error(`Error checking Ret_Id for ${tableName}:`, error);
                return false;
            }
        };

        const tableRetIdMap = {};
        for (const filter of mobileFilters.recordset) {
            if (filter.TableName && !tableRetIdMap[filter.TableName]) {
                tableRetIdMap[filter.TableName] = await checkTableHasRetId(filter.TableName);
            }
        }

       const buildFilterCondition = (filterConfig, filterValues, filterParamName) => {
    if (!filterConfig || !filterConfig.TableName || !filterConfig.ColumnName || !filterValues || filterValues.length === 0) {
        return null;
    }

    const tableName = filterConfig.TableName;
    const columnName = filterConfig.ColumnName;
    const hasRetId = tableRetIdMap[tableName] || false;
    
 
    const specialTables = {
        'tbl_Ledger_LOL': {
            joinCondition: `AND ${tableName}.Ret_Id = sdgi.Retailer_Id`,
            fromClause: tableName,
            additionalJoins: ''
        },
        'tbl_Stock_LOS': {
            joinCondition: hasRetId ? `AND los.Ret_Id = sdgi.Retailer_Id` : '',
            fromClause: `${tableName} los INNER JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Item_Id = los.Pro_Id`,
            whereClause: `WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id`
        }
    };

    const isSingleValue = filterValues.length === 1;
    const placeholders = isSingleValue 
        ? `@${filterParamName}` 
        : filterValues.map((_, index) => `@${filterParamName}${index}`).join(',');

    const condition = isSingleValue 
        ? `${columnName} = ${placeholders}`
        : `${columnName} IN (${placeholders})`;


    if (specialTables[tableName]) {
        const specialConfig = specialTables[tableName];
        return `EXISTS (
            SELECT 1 FROM ${specialConfig.fromClause}
            ${specialConfig.whereClause || ''}
            ${specialConfig.whereClause ? 'AND' : 'WHERE'} ${condition}
            ${specialConfig.joinCondition}
        )`;
    }
    
  
    const retIdCondition = hasRetId ? `AND ${tableName}.Ret_Id = sdgi.Retailer_Id` : '';
    
    return `EXISTS (
        SELECT 1 FROM ${tableName} 
        WHERE ${tableName}.${condition}
        ${retIdCondition}
    )`;
};

       
        const getCurrespondingAccount = await new sql.Request().query(`
            SELECT Acc_Id 
            FROM tbl_Default_AC_Master 
            WHERE Type = 'DEFAULT' AND Acc_Id IS NOT NULL;
        `);
        const excludeList = getCurrespondingAccount.recordset.map(exp => exp.Acc_Id).join(',');

        let branchCondition = '';

        if (User_Id) {
            const getBranches = await new sql.Request()
                .input('User_Id', User_Id)
                .query(`SELECT Branch_Id FROM tbl_userbranchrights WHERE User_Id = @User_Id`);
            
            const allowedBranches = getBranches.recordset.map(b => b.Branch_Id);

            if (Branch_Id) {
                const selectedBranches = Branch_Id.split(',').map(Number).filter(n => !isNaN(n));
                const finalBranches = selectedBranches.filter(b => allowedBranches.length ? allowedBranches.includes(b) : true);

                if (finalBranches.length) {
                    branchCondition = ` AND Branch_Id IN (${finalBranches.join(',')}) `;
                } else {
                    return res.json({ data: [], message: "No data", success: true, others: {} });
                }
            } else if (allowedBranches.length) {
                branchCondition = ` AND Branch_Id IN (${allowedBranches.join(',')}) `;
            }
        }

        let mobileFilterConditions = [];
        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate);

        if (Retailer_Id) request.input('retailer', Retailer_Id);
        if (Cancel_status) request.input('cancel', Cancel_status);
        if (Created_by) request.input('creater', Created_by);
        if (VoucherType) request.input('VoucherType', VoucherType);

        const filterConditions = [
            { values: filter1Values, paramName: 'filter1', index: 0 },
            { values: filter2Values, paramName: 'filter2', index: 1 },
            // { values: filter3Values, paramName: 'filter3', index: 2 },
            // { values: filter4Values, paramName: 'filter3', index: 3 }
        ];

        for (let i = 0; i < filterConditions.length; i++) {
            const { values, paramName, index } = filterConditions[i];
            
            if (values && values.length > 0 && mobileFilters.recordset.length > index) {
                const filterConfig = mobileFilters.recordset[index];
                const condition = buildFilterCondition(filterConfig, values, paramName);
                
                if (condition) {
                    mobileFilterConditions.push(condition);
                    
                    if (values.length === 1) {
                        request.input(paramName, values[0]);
                    } else {
                        values.forEach((value, idx) => {
                            request.input(`${paramName}${idx}`, value);
                        });
                    }
                }
            }
        }

        const mobileFilterCondition = mobileFilterConditions.length > 0 
            ? ` AND ${mobileFilterConditions.join(' AND ')} `
            : '';

       
        const sqlQuery = `
            DECLARE @FilteredInvoice TABLE (Do_Id INT PRIMARY KEY);

            INSERT INTO @FilteredInvoice (Do_Id)
            SELECT DISTINCT sdgi.Do_Id
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            WHERE 
                sdgi.Do_Date BETWEEN @Fromdate AND @Todate
                ${Retailer_Id ? ' AND sdgi.Retailer_Id = @retailer ' : ''}
                ${Cancel_status ? ' AND sdgi.Cancel_status = @cancel ' : ''}
                ${Created_by ? ' AND sdgi.Created_by = @creater ' : ''}
                ${VoucherType ? ' AND sdgi.Voucher_Type = @VoucherType ' : ''}
                ${branchCondition}
                ${mobileFilterCondition};

            
            SELECT 
                sdgi.Do_Id, sdgi.Do_Inv_No,  sdgi.Voucher_Type as Voucher_Type_Id, sdgi.Do_No, sdgi.Do_Year,
                sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
                sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, 
                sdgi.Total_Expences, sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
                sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on, sdgi.Stock_Item_Ledger_Name,
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                  COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet,
				COALESCE(v.Voucher_Type, 'unknown') AS Voucher_Type
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
            LEFT JOIN tbl_Users cb ON cb.UserId = sdgi.Created_by
            LEFT JOIN tbl_Voucher_Type v ON v.Vocher_Type_Id = sdgi.Voucher_Type
            WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ORDER BY sdgi.Do_Date DESC, sdgi.Do_Id DESC;

          
            SELECT 
                oi.*, pm.Product_Id,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info oi
            LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ORDER BY oi.Delivery_Order_Id, oi.Item_Id;

           
            SELECT 
                exp.*, em.Account_name AS Expence_Name, 
                CASE WHEN exp.Expence_Value_DR > 0 THEN -exp.Expence_Value_DR ELSE exp.Expence_Value_CR END AS Expence_Value
            FROM tbl_Sales_Delivery_Expence_Info exp
            LEFT JOIN tbl_Account_Master em ON em.Acc_Id = exp.Expense_Id
            WHERE exp.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ${excludeList ? ` AND exp.Expense_Id NOT IN (${excludeList})` : ''}
            ORDER BY exp.Do_Id, exp.Expense_Id;

            
            IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tbl_Sales_Delivery_Staff_Info')
            BEGIN
                SELECT 
                    stf.*, 
                    COALESCE(e.Cost_Center_Name, '') AS Emp_Name, 
                    COALESCE(cc.Cost_Category, '') AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info stf
                LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY stf.Do_Id, stf.Emp_Id;
            END
            ELSE
            BEGIN
                -- Return empty result set if table doesn't exist
                SELECT NULL AS Do_Id, NULL AS Emp_Id, NULL AS Emp_Type_Id, '' AS Emp_Name, '' AS Involved_Emp_Type
                WHERE 1 = 0;
            END


SELECT  
    llos.*
FROM tbl_Stock_LOS llos
WHERE llos.Pro_Id IN (
    SELECT DISTINCT sdsi.Item_Id
    FROM tbl_Sales_Delivery_Stock_Info sdsi
    WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)  
)
ORDER BY llos.Pro_Id;
            
            SELECT DISTINCT
                llol.*
            FROM tbl_Ledger_LOL llol
            WHERE llol.Ret_Id IN (
                SELECT DISTINCT Retailer_Id 
                FROM tbl_Sales_Delivery_Gen_Info sdgi 
                WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            )
            ORDER BY llol.Ret_Id, llol.Auto_Id;
        `;


     const result = await request.query(sqlQuery);
 
const SalesGeneralInfo = toArray(result.recordsets[0]);
const Products_List = toArray(result.recordsets[1]);
const Expence_Array = toArray(result.recordsets[2]);
const Staffs_Array = toArray(result.recordsets[3]);
const StockInfo = toArray(result.recordsets[4]);  
const LedgerInfo = toArray(result.recordsets[5]);  

if (SalesGeneralInfo.length > 0) {
    const ledgerMap = {};
    const stockMap = {}; 
    
   
    LedgerInfo.forEach(ledger => {
        if (!ledgerMap[ledger.Ret_Id]) {
            ledgerMap[ledger.Ret_Id] = ledger;
        }
    });
    

    StockInfo.forEach(stock => {
        if (!stockMap[stock.Pro_Id]) { 
            stockMap[stock.Pro_Id] = stock;
        }
    });
    
    const resData = SalesGeneralInfo.map(row => {
        const ledgerInfo = ledgerMap[row.Retailer_Id] || {};
        
        
        const productsWithStock = Products_List
            .filter(fil => isEqualNumber(fil.Delivery_Order_Id, row.Do_Id))
            .map(product => {
                const productStock = stockMap[product.Product_Id] || stockMap[product.Item_Id] || {};
                return {
                    ...product,
                    ... productStock  
                };
            });
        
        return {
            ...row,
            ...ledgerInfo,
            Products_List: productsWithStock,  
            Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id)),
            Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id))
        };
    });

    dataFound(res, resData);
} else {
    noData(res);
}

    } catch (e) {
        console.error('API Error:', e);
        servError(e, res);
    }
};

  const getSalesInvoiceMobileFilter2 = async (req, res) => {
    try {
        const { 
            Retailer_Id, 
            Cancel_status = 0, 
            Created_by, 
            VoucherType, 
            Branch_Id, 
            User_Id,
            filter1, 
            filter2,
            filter3,
            filter4
        } = req.query;

        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const parseFilterValues = (filterParam) => {
            if (!filterParam) return null;
            return filterParam.split(',').map(val => val.trim()).filter(val => val);
        };

        const filter1Values = parseFilterValues(filter1);
        const filter2Values = parseFilterValues(filter2);
        const filter3Values = parseFilterValues(filter3);
         const filter4Values = parseFilterValues(filter4);

     
        const mobileFilters = await new sql.Request().query(`
            SELECT 
                mrd.Type AS FilterType,
                mrd.Column_Name AS ColumnName,
                mrd.Table_Id AS TableId,
                tm.Table_Name AS TableName,
                mrd.FilterLevel,
                STUFF((
                    SELECT DISTINCT ',' + CAST(mrd2.List_Type AS VARCHAR(10))
                    FROM tbl_Mobile_Report_Details mrd2
                    WHERE mrd2.Type = mrd.Type 
                    AND mrd2.Table_Id = mrd.Table_Id 
                    AND mrd2.Column_Name = mrd.Column_Name
                    AND mrd2.Mob_Rpt_Id = mrd.Mob_Rpt_Id
                    FOR XML PATH('')
                ), 1, 1, '') AS ListTypes
            FROM tbl_Mobile_Report_Details mrd 
            INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
            LEFT JOIN [tbl_Mobile_Rpt_Table_Master] tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = 'Sales Invoice' AND FilterLevel =2
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name,mrd.FilterLevel
            ORDER BY mrd.Type
        `);

        const checkTableHasRetId = async (tableName) => {
            try {
                const columnCheck = await new sql.Request().query(`
                    SELECT COLUMN_NAME 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = '${tableName}' 
                    AND COLUMN_NAME = 'Ret_Id'
                `);
                return columnCheck.recordset.length > 0;
            } catch (error) {
                console.error(`Error checking Ret_Id for ${tableName}:`, error);
                return false;
            }
        };

        const tableRetIdMap = {};
        for (const filter of mobileFilters.recordset) {
            if (filter.TableName && !tableRetIdMap[filter.TableName]) {
                tableRetIdMap[filter.TableName] = await checkTableHasRetId(filter.TableName);
            }
        }

       const buildFilterCondition = (filterConfig, filterValues, filterParamName) => {
    if (!filterConfig || !filterConfig.TableName || !filterConfig.ColumnName || !filterValues || filterValues.length === 0) {
        return null;
    }

    const tableName = filterConfig.TableName;
    const columnName = filterConfig.ColumnName;
    const hasRetId = tableRetIdMap[tableName] || false;
    
 
    const specialTables = {
        'tbl_Ledger_LOL': {
            joinCondition: `AND ${tableName}.Ret_Id = sdgi.Retailer_Id`,
            fromClause: tableName,
            additionalJoins: ''
        },
        'tbl_Stock_LOS': {
            joinCondition: hasRetId ? `AND los.Ret_Id = sdgi.Retailer_Id` : '',
            fromClause: `${tableName} los INNER JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Item_Id = los.Pro_Id`,
            whereClause: `WHERE sdsi.Delivery_Order_Id = sdgi.Do_Id`
        }
    };

    const isSingleValue = filterValues.length === 1;
    const placeholders = isSingleValue 
        ? `@${filterParamName}` 
        : filterValues.map((_, index) => `@${filterParamName}${index}`).join(',');

    const condition = isSingleValue 
        ? `${columnName} = ${placeholders}`
        : `${columnName} IN (${placeholders})`;


    if (specialTables[tableName]) {
        const specialConfig = specialTables[tableName];
        return `EXISTS (
            SELECT 1 FROM ${specialConfig.fromClause}
            ${specialConfig.whereClause || ''}
            ${specialConfig.whereClause ? 'AND' : 'WHERE'} ${condition}
            ${specialConfig.joinCondition}
        )`;
    }
    
  
    const retIdCondition = hasRetId ? `AND ${tableName}.Ret_Id = sdgi.Retailer_Id` : '';
    
    return `EXISTS (
        SELECT 1 FROM ${tableName} 
        WHERE ${tableName}.${condition}
        ${retIdCondition}
    )`;
};

       
        const getCurrespondingAccount = await new sql.Request().query(`
            SELECT Acc_Id 
            FROM tbl_Default_AC_Master 
            WHERE Type = 'DEFAULT' AND Acc_Id IS NOT NULL;
        `);
        const excludeList = getCurrespondingAccount.recordset.map(exp => exp.Acc_Id).join(',');

        let branchCondition = '';

        if (User_Id) {
            const getBranches = await new sql.Request()
                .input('User_Id', User_Id)
                .query(`SELECT Branch_Id FROM tbl_userbranchrights WHERE User_Id = @User_Id`);
            
            const allowedBranches = getBranches.recordset.map(b => b.Branch_Id);

            if (Branch_Id) {
                const selectedBranches = Branch_Id.split(',').map(Number).filter(n => !isNaN(n));
                const finalBranches = selectedBranches.filter(b => allowedBranches.length ? allowedBranches.includes(b) : true);

                if (finalBranches.length) {
                    branchCondition = ` AND Branch_Id IN (${finalBranches.join(',')}) `;
                } else {
                    return res.json({ data: [], message: "No data", success: true, others: {} });
                }
            } else if (allowedBranches.length) {
                branchCondition = ` AND Branch_Id IN (${allowedBranches.join(',')}) `;
            }
        }

        let mobileFilterConditions = [];
        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate);

        if (Retailer_Id) request.input('retailer', Retailer_Id);
        if (Cancel_status) request.input('cancel', Cancel_status);
        if (Created_by) request.input('creater', Created_by);
        if (VoucherType) request.input('VoucherType', VoucherType);

        const filterConditions = [
            { values: filter1Values, paramName: 'filter1', index: 0 },
            { values: filter2Values, paramName: 'filter2', index: 1 },
            { values: filter3Values, paramName: 'filter3', index: 2 },
            { values: filter4Values, paramName: 'filter3', index: 3 }
        ];

        for (let i = 0; i < filterConditions.length; i++) {
            const { values, paramName, index } = filterConditions[i];
            
            if (values && values.length > 0 && mobileFilters.recordset.length > index) {
                const filterConfig = mobileFilters.recordset[index];
                const condition = buildFilterCondition(filterConfig, values, paramName);
                
                if (condition) {
                    mobileFilterConditions.push(condition);
                    
                    if (values.length === 1) {
                        request.input(paramName, values[0]);
                    } else {
                        values.forEach((value, idx) => {
                            request.input(`${paramName}${idx}`, value);
                        });
                    }
                }
            }
        }

        const mobileFilterCondition = mobileFilterConditions.length > 0 
            ? ` AND ${mobileFilterConditions.join(' AND ')} `
            : '';

       
          const sqlQuery = `
            DECLARE @FilteredInvoice TABLE (Do_Id INT PRIMARY KEY);

            INSERT INTO @FilteredInvoice (Do_Id)
            SELECT DISTINCT sdgi.Do_Id
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            WHERE 
                sdgi.Do_Date BETWEEN @Fromdate AND @Todate
                ${Retailer_Id ? ' AND sdgi.Retailer_Id = @retailer ' : ''}
                ${Cancel_status ? ' AND sdgi.Cancel_status = @cancel ' : ''}
                ${Created_by ? ' AND sdgi.Created_by = @creater ' : ''}
                ${VoucherType ? ' AND sdgi.Voucher_Type = @VoucherType ' : ''}
                ${branchCondition}
                ${mobileFilterCondition};

            
            SELECT 
                sdgi.Do_Id, sdgi.Do_Inv_No, sdgi.Voucher_Type, sdgi.Do_No, sdgi.Do_Year,
                sdgi.Do_Date, sdgi.Branch_Id, sdgi.Retailer_Id, sdgi.Narration, sdgi.So_No, sdgi.Cancel_status,
                sdgi.GST_Inclusive, sdgi.IS_IGST, sdgi.CSGT_Total, sdgi.SGST_Total, sdgi.IGST_Total, 
                sdgi.Total_Expences, sdgi.Round_off, sdgi.Total_Before_Tax, sdgi.Total_Tax, sdgi.Total_Invoice_value,
                sdgi.Trans_Type, sdgi.Alter_Id, sdgi.Created_by, sdgi.Created_on, sdgi.Stock_Item_Ledger_Name,
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Delivery_Gen_Info sdgi
            LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
            LEFT JOIN tbl_Users cb ON cb.UserId = sdgi.Created_by
            LEFT JOIN tbl_Voucher_Type v ON v.Vocher_Type_Id = sdgi.Voucher_Type
            WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ORDER BY sdgi.Do_Date DESC, sdgi.Do_Id DESC;

          
            SELECT 
                oi.*, pm.Product_Id,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Name, 'not available') AS Item_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info oi
            LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ORDER BY oi.Delivery_Order_Id, oi.Item_Id;

           
            SELECT 
                exp.*, em.Account_name AS Expence_Name, 
                CASE WHEN exp.Expence_Value_DR > 0 THEN -exp.Expence_Value_DR ELSE exp.Expence_Value_CR END AS Expence_Value
            FROM tbl_Sales_Delivery_Expence_Info exp
            LEFT JOIN tbl_Account_Master em ON em.Acc_Id = exp.Expense_Id
            WHERE exp.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            ${excludeList ? ` AND exp.Expense_Id NOT IN (${excludeList})` : ''}
            ORDER BY exp.Do_Id, exp.Expense_Id;

            
            IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'tbl_Sales_Delivery_Staff_Info')
            BEGIN
                SELECT 
                    stf.*, 
                    COALESCE(e.Cost_Center_Name, '') AS Emp_Name, 
                    COALESCE(cc.Cost_Category, '') AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info stf
                LEFT JOIN tbl_ERP_Cost_Center e ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY stf.Do_Id, stf.Emp_Id;
            END
            ELSE
            BEGIN
                -- Return empty result set if table doesn't exist
                SELECT NULL AS Do_Id, NULL AS Emp_Id, NULL AS Emp_Type_Id, '' AS Emp_Name, '' AS Involved_Emp_Type
                WHERE 1 = 0;
            END


SELECT  
    llos.*
FROM tbl_Stock_LOS llos
WHERE llos.Pro_Id IN (
    SELECT DISTINCT sdsi.Item_Id
    FROM tbl_Sales_Delivery_Stock_Info sdsi
    WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)  
)
ORDER BY llos.Pro_Id;
            
            SELECT DISTINCT
                llol.*
            FROM tbl_Ledger_LOL llol
            WHERE llol.Ret_Id IN (
                SELECT DISTINCT Retailer_Id 
                FROM tbl_Sales_Delivery_Gen_Info sdgi 
                WHERE sdgi.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            )
            ORDER BY llol.Ret_Id, llol.Auto_Id;
        `;
     const result = await request.query(sqlQuery);
 
const SalesGeneralInfo = toArray(result.recordsets[0]);
const Products_List = toArray(result.recordsets[1]);
const Expence_Array = toArray(result.recordsets[2]);
const Staffs_Array = toArray(result.recordsets[3]);
const StockInfo = toArray(result.recordsets[4]);  
const LedgerInfo = toArray(result.recordsets[5]);  

if (SalesGeneralInfo.length > 0) {
    const ledgerMap = {};
    const stockMap = {}; 
    
   
    LedgerInfo.forEach(ledger => {
        if (!ledgerMap[ledger.Ret_Id]) {
            ledgerMap[ledger.Ret_Id] = ledger;
        }
    });
    

    StockInfo.forEach(stock => {
        if (!stockMap[stock.Pro_Id]) { 
            stockMap[stock.Pro_Id] = stock;
        }
    });
    
    const resData = SalesGeneralInfo.map(row => {
        const ledgerInfo = ledgerMap[row.Retailer_Id] || {};
        
        
        const productsWithStock = Products_List
            .filter(fil => isEqualNumber(fil.Delivery_Order_Id, row.Do_Id))
            .map(product => {
                const productStock = stockMap[product.Product_Id] || stockMap[product.Item_Id] || {};
                return {
                    ...product,
                    ... productStock    
                };
            });
        
        return {
            ...row,
            ...ledgerInfo,
            Products_List: productsWithStock,  
            Expence_Array: Expence_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id)),
            Staffs_Array: Staffs_Array.filter(fil => isEqualNumber(fil.Do_Id, row.Do_Id))
        };
    });

    dataFound(res, resData);
} else {
    noData(res);
}

    } catch (e) {
        console.error('API Error:', e);
        servError(e, res);
    }
};

const getMobileReportDropdowns = async (req, res) => {
    try {
        const { reportName } = req.query;

        if (!reportName) {
            return invalidInput(res, 'Report Name is Required')
        }

        // First, get the mobile report configuration
        const mobileReportQuery = `
            SELECT 
                mrd.Type AS filterType,
                mrd.Table_Id AS tableId,
                mrd.Column_Name AS columnName,
                mrd.FilterLevel AS FilterLevel,
                STUFF((
                    SELECT DISTINCT ',' + CAST(mrd2.List_Type AS VARCHAR(10))
                    FROM tbl_Mobile_Report_Details mrd2
                    WHERE mrd2.Type = mrd.Type 
                    AND mrd2.Table_Id = mrd.Table_Id 
                    AND mrd2.Column_Name = mrd.Column_Name
                    AND mrd2.Mob_Rpt_Id = mrd.Mob_Rpt_Id
                    FOR XML PATH('')
                ), 1, 1, '') AS listTypes,
                tm.Table_Name AS tableName,
                tm.AliasName AS aliasName
            FROM tbl_Mobile_Report_Details mrd
            INNER JOIN tbl_Mobile_Report_Type mrt ON mrt.Mob_Rpt_Id = mrd.Mob_Rpt_Id
            LEFT JOIN [tbl_Mobile_Rpt_Table_Master] tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = @reportName
            GROUP BY mrd.Type, mrd.FilterLevel, mrd.Table_Id, mrd.Column_Name, 
                     mrd.Mob_Rpt_Id, tm.Table_Name, tm.AliasName
            ORDER BY mrd.Type
        `;

        const mobileReportResult = await new sql.Request()
            .input('reportName', reportName)
            .query(mobileReportQuery);

        if (mobileReportResult.recordset.length === 0) {
            return res.json({
                success: true,
                data: [],
                message: "No dropdown configuration found for this report"
            });
        }

        // Get group filters with Level_Id
        const groupFilterQuery = `
            SELECT DISTINCT
                gtm.Table_Id,
                gtm.Column_Name AS groupFilterColumn,
                tm.Table_Name,
                tm.AliasName,
                gtm.Level_Id  -- Include Level_Id to determine which group filter slot
            FROM tbl_Group_Template gtm
            LEFT JOIN tbl_Mobile_Rpt_Table_Master tm ON tm.Table_Id = gtm.Table_Id
            WHERE gtm.Mob_Rpt_Id IN (
                SELECT Mob_Rpt_Id 
                FROM tbl_Mobile_Report_Type 
                WHERE Report_Name = @reportName
            )
            ORDER BY gtm.Level_Id  -- Order by Level_Id to maintain sequence
        `;

        const groupFilterResult = await new sql.Request()
            .input('reportName', reportName)
            .query(groupFilterQuery);

        // Regular filter promises
        const regularFilterPromises = mobileReportResult.recordset.map(async (config) => {
            try {
                if (config.tableName && config.columnName) {
                    
                    const columnCheckQuery = `
                        SELECT COUNT(*) as columnExists
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${config.tableName}' 
                        AND COLUMN_NAME = '${config.columnName}'
                    `;
                    
                    const columnCheck = await new sql.Request().query(columnCheckQuery);
                    
                    if (columnCheck.recordset[0].columnExists === 0) {
                        return {
                            filterType: config.filterType,
                            tableId: config.tableId,
                            columnName: config.columnName,
                            tableName: config.tableName,
                            aliasName: config.aliasName,
                            listTypes: config.listTypes,
                            FilterLevel: config.FilterLevel,
                            isGroupFilter: false,
                            options: [],
                            error: `Column '${config.columnName}' not found in table '${config.tableName}'`
                        };
                    }

                    const tableInfoQuery = `
                        SELECT COLUMN_NAME, DATA_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${config.tableName}'
                        ORDER BY ORDINAL_POSITION
                    `;
                    
                    const tableInfo = await new sql.Request().query(tableInfoQuery);
                    
                    let valueColumn = null;
                    
                    const possibleIdColumns = tableInfo.recordset.filter(col => 
                        col.COLUMN_NAME.toLowerCase() === 'id' ||
                        col.COLUMN_NAME.toLowerCase().includes('_id') ||
                        col.COLUMN_NAME.toLowerCase().includes('id_') ||
                        col.COLUMN_NAME.toLowerCase().endsWith('id') ||
                        col.COLUMN_NAME.toLowerCase() === config.tableName.replace('tbl_', '').toLowerCase() + 'id' ||
                        col.COLUMN_NAME.toLowerCase() === config.tableName.replace('tbl_', '').toLowerCase() + '_id'
                    );

                    if (possibleIdColumns.length > 0) {
                        valueColumn = possibleIdColumns[0].COLUMN_NAME;
                    } else {
                        const otherColumns = tableInfo.recordset.filter(col => 
                            col.COLUMN_NAME !== config.columnName
                        );
                        if (otherColumns.length > 0) {
                            valueColumn = otherColumns[0].COLUMN_NAME;
                        } else {
                            valueColumn = config.columnName;
                        }
                    }

                    const dataCheckQuery = `
                        SELECT 
                            COUNT(*) as totalRecords,
                            COUNT(${config.columnName}) as nonNullCount,
                            COUNT(CASE WHEN ${config.columnName} = '' THEN 1 END) as emptyCount,
                            COUNT(CASE WHEN ${config.columnName} IS NULL THEN 1 END) as nullCount
                        FROM ${config.tableName}
                    `;

                    const dataCheck = await new sql.Request().query(dataCheckQuery);

                    let dropdownQuery;
                    let result;
                    
                    if (dataCheck.recordset[0].nonNullCount === 0) {
                        const alternativeColumnQuery = `
                            SELECT COLUMN_NAME 
                            FROM INFORMATION_SCHEMA.COLUMNS 
                            WHERE TABLE_NAME = '${config.tableName}'
                            AND (COLUMN_NAME LIKE '%name%' OR COLUMN_NAME LIKE '%desc%' OR COLUMN_NAME LIKE '%title%')
                            AND COLUMN_NAME != '${config.columnName}'
                        `;
                        
                        const altColumns = await new sql.Request().query(alternativeColumnQuery);

                        if (altColumns.recordset.length > 0) {
                            const altColumn = altColumns.recordset[0].COLUMN_NAME;
                            
                            dropdownQuery = `
                                SELECT DISTINCT
                                    ${valueColumn} AS value,
                                    ${altColumn} AS label
                                FROM ${config.tableName}
                                WHERE ${altColumn} IS NOT NULL 
                                AND ${altColumn} != ''
                                ORDER BY ${altColumn}
                            `;
                        } else {
                            dropdownQuery = `
                                SELECT DISTINCT
                                    ${valueColumn} AS value,
                                    ${valueColumn} AS label
                                FROM ${config.tableName}
                                WHERE ${valueColumn} IS NOT NULL
                                ORDER BY ${valueColumn}
                            `;
                        }
                    } else {
                        dropdownQuery = `
                            SELECT DISTINCT
                                ${valueColumn} AS value,
                                ${config.columnName} AS label
                            FROM ${config.tableName}
                            WHERE ${config.columnName} IS NOT NULL 
                            AND ${config.columnName} != ''
                            ORDER BY ${config.columnName}
                        `;
                    }

                    result = await new sql.Request().query(dropdownQuery);

                    const seenLabels = new Set();
                    const uniqueOptions = result.recordset.filter(item => {
                        if (seenLabels.has(item.label)) {
                            return false;
                        }
                        seenLabels.add(item.label);
                        return true;
                    });

                    return {
                        filterType: config.filterType,
                        tableId: config.tableId,
                        columnName: config.columnName,
                        tableName: config.tableName,
                        aliasName: config.aliasName,
                        valueColumn: valueColumn,
                        listTypes: config.listTypes,
                        FilterLevel: config.FilterLevel,
                        isGroupFilter: false,
                        options: uniqueOptions,
                        dataSummary: dataCheck.recordset[0]
                    };

                } else {
                    return {
                        filterType: config.filterType,
                        tableId: config.tableId,
                        columnName: config.columnName,
                        tableName: config.tableName,
                        aliasName: config.aliasName,
                        listTypes: config.listTypes,
                        FilterLevel: config.FilterLevel,
                        isGroupFilter: false,
                        options: [], 
                        error: "Invalid configuration - missing tableName or columnName"
                    };
                }

            } catch (error) {
                console.error(`Error fetching dropdown for filter ${config.filterType}:`, error);
                return {
                    filterType: config.filterType,
                    tableId: config.tableId,
                    columnName: config.columnName,
                    tableName: config.tableName,
                    aliasName: config.aliasName,
                    FilterLevel: config.FilterLevel,
                    isGroupFilter: false,
                    listTypes: config.listTypes,
                    options: [],
                    error: error.message
                };
            }
        });

       
        const groupFilterPromises = groupFilterResult.recordset.map(async (groupConfig) => {
            try {
                const actualTableName = groupConfig.Table_Name;
                const actualColumnName = groupConfig.groupFilterColumn;
                const levelId = groupConfig.Level_Id || 1; 
                
              
                let groupFilterType = "GROUP_FILTER"; 
                if (levelId == 1) {
                    groupFilterType = "GROUP_FILTER";
                } else if (levelId == 2) {
                    groupFilterType = "GROUP_FILTER1";
                } else if (levelId == 3) {
                    groupFilterType = "GROUP_FILTER2";
                }
                
                if (actualTableName && actualColumnName) {
                    
                    const columnCheckQuery = `
                        SELECT COUNT(*) as columnExists
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${actualTableName}' 
                        AND COLUMN_NAME = '${actualColumnName}'
                    `;
                    
                    const columnCheck = await new sql.Request().query(columnCheckQuery);
                    
                    if (columnCheck.recordset[0].columnExists === 0) {
                        return {
                            filterType: groupFilterType,
                            tableId: groupConfig.Table_Id,
                            columnName: actualColumnName,
                            tableName: actualTableName,
                            aliasName: groupConfig.AliasName,
                            listTypes: "1",
                            FilterLevel: 3,
                            Level_Id: levelId,
                            isGroupFilter: true,
                            options: [],
                            error: `Group filter column '${actualColumnName}' not found in table '${actualTableName}'`
                        };
                    }

                    const tableInfoQuery = `
                        SELECT COLUMN_NAME, DATA_TYPE
                        FROM INFORMATION_SCHEMA.COLUMNS 
                        WHERE TABLE_NAME = '${actualTableName}'
                        ORDER BY ORDINAL_POSITION
                    `;
                    
                    const tableInfo = await new sql.Request().query(tableInfoQuery);
                    
                    let valueColumn = null;
                    
                    const possibleIdColumns = tableInfo.recordset.filter(col => 
                        col.COLUMN_NAME.toLowerCase() === 'id' ||
                        col.COLUMN_NAME.toLowerCase().includes('_id') ||
                        col.COLUMN_NAME.toLowerCase().includes('id_') ||
                        col.COLUMN_NAME.toLowerCase().endsWith('id') ||
                        col.COLUMN_NAME.toLowerCase() === actualTableName.replace('tbl_', '').toLowerCase() + 'id' ||
                        col.COLUMN_NAME.toLowerCase() === actualTableName.replace('tbl_', '').toLowerCase() + '_id'
                    );

                    if (possibleIdColumns.length > 0) {
                        valueColumn = possibleIdColumns[0].COLUMN_NAME;
                    } else {
                        valueColumn = actualColumnName;
                    }

                    const dataCheckQuery = `
                        SELECT 
                            COUNT(*) as totalRecords,
                            COUNT(${actualColumnName}) as nonNullCount,
                            COUNT(CASE WHEN ${actualColumnName} = '' THEN 1 END) as emptyCount,
                            COUNT(CASE WHEN ${actualColumnName} IS NULL THEN 1 END) as nullCount
                        FROM ${actualTableName}
                    `;

                    const dataCheck = await new sql.Request().query(dataCheckQuery);

                    let dropdownQuery = `
                        SELECT DISTINCT
                            ${valueColumn} AS value,
                            ${actualColumnName} AS label
                        FROM ${actualTableName}
                        WHERE ${actualColumnName} IS NOT NULL 
                        AND ${actualColumnName} != ''
                        ORDER BY ${actualColumnName}
                    `;

                    const result = await new sql.Request().query(dropdownQuery);

                    const seenLabels = new Set();
                    const uniqueOptions = result.recordset.filter(item => {
                        if (seenLabels.has(item.label)) {
                            return false;
                        }
                        seenLabels.add(item.label);
                        return true;
                    });

                    return {
                        filterType: groupFilterType,
                        tableId: groupConfig.Table_Id,
                        columnName: actualColumnName,
                        tableName: actualTableName,
                        aliasName: groupConfig.AliasName,
                        valueColumn: valueColumn,
                        listTypes: "1",
                        FilterLevel: 3,
                        Level_Id: levelId,
                        isGroupFilter: true,
                        options: uniqueOptions,
                        dataSummary: dataCheck.recordset[0]
                    };

                } else {
                    return {
                        filterType: groupFilterType,
                        tableId: groupConfig.Table_Id,
                        columnName: groupConfig.groupFilterColumn,
                        tableName: groupConfig.Table_Name,
                        aliasName: groupConfig.AliasName,
                        listTypes: "1",
                        FilterLevel: 3,
                        Level_Id: levelId,
                        isGroupFilter: true,
                        options: [], 
                        error: "Invalid group filter configuration"
                    };
                }

            } catch (error) {
                console.error(`Error fetching group filter dropdown:`, error);
                
                // Determine filter type based on Level_Id even in error case
                let groupFilterType = "GROUP_FILTER";
                const levelId = groupConfig.Level_Id || 1;
                if (levelId === 1) groupFilterType = "GROUP_FILTER";
                else if (levelId === 2) groupFilterType = "GROUP_FILTER1";
                else if (levelId === 3) groupFilterType = "GROUP_FILTER2";
                
                return {
                    filterType: groupFilterType,
                    tableId: groupConfig.Table_Id,
                    columnName: groupConfig.groupFilterColumn,
                    tableName: groupConfig.Table_Name,
                    aliasName: groupConfig.AliasName,
                    FilterLevel: 3,
                    Level_Id: levelId,
                    isGroupFilter: true,
                    listTypes: "1",
                    options: [],
                    error: error.message
                };
            }
        });

        // Execute all promises
        const [regularResults, groupResults] = await Promise.all([
            Promise.all(regularFilterPromises),
            Promise.all(groupFilterPromises)
        ]);

        // Combine results
        const allResults = [...regularResults, ...groupResults];

        // Sort results to maintain order: regular filters first (by Type), then group filters (by Level_Id)
        const sortedResults = allResults.sort((a, b) => {
            // Regular filters come first
            if (!a.isGroupFilter && b.isGroupFilter) return -1;
            if (a.isGroupFilter && !b.isGroupFilter) return 1;
            
            // Both regular filters - sort by filterType
            if (!a.isGroupFilter && !b.isGroupFilter) {
                return (a.filterType || 0) - (b.filterType || 0);
            }
            
            // Both group filters - sort by Level_Id
            if (a.isGroupFilter && b.isGroupFilter) {
                return (a.Level_Id || 1) - (b.Level_Id || 1);
            }
            
            return 0;
        });

        const formattedResponse = sortedResults.map(item => ({
            filterType: item.filterType,
            tableId: item.tableId,
            columnName: item.columnName,
            tableName: item.tableName,
            aliasName: item.aliasName,
            valueColumn: item.valueColumn,
            FilterLevel: item.FilterLevel,
            Level_Id: item.Level_Id,
            isGroupFilter: item.isGroupFilter,
            listTypes: item.listTypes,
            options: item.options,
            error: item.error,
            dataSummary: item.dataSummary
        }));
        
        dataFound(res, formattedResponse);

    } catch (error) {
        console.error('Error in getMobileReportDropdowns:', error);
        servError(error, res);
    }
};

    const salesInvoiceReport = async (req, res) => {
        try {
            const Fromdate = req.query.Fromdate
                ? ISOString(req.query.Fromdate)
                : ISOString();
            const Todate = req.query.Todate
                ? ISOString(req.query.Todate)
                : ISOString();

            const salesQuery = `
      SELECT DISTINCT
          fnd.Product_Id,
          fnd.Product_Name,
          fnd.bill_qty AS Sales_Quantity,
          stl.Stock_Item,
          stl.Stock_Group,
          stl.S_Sub_Group_1,
          stl.Grade_Item_Group,
          stl.Item_Name_Modified,
          fnd.BranchId,
          fnd.BranchName,
          fnd.GoDown_Id,
          fnd.Godown_Name
      FROM Avg_Live_Sales_Fn_3(@Fromdate, @Todate) fnd
      LEFT JOIN tbl_Stock_Los stl 
            ON stl.Pro_Id = fnd.Product_Id
      ORDER BY fnd.BranchName, fnd.Godown_Name, fnd.Product_Name;
    `;

            const salesRequest = new sql.Request()
                .input("Fromdate", sql.DateTime, Fromdate)
                .input("Todate", sql.DateTime, Todate);

            const salesResult = await salesRequest.query(salesQuery);


            const groupedData = salesResult.recordset.reduce((branchAcc, item) => {
                const branchKey = item.BranchId || 0;
                const godownKey = item.GoDown_Id || 0;

                if (!branchAcc[branchKey]) {
                    branchAcc[branchKey] = {
                        BranchId: item.BranchId,
                        BranchName: item.BranchName,
                        Godowns: {},
                    };
                }

                if (!branchAcc[branchKey].Godowns[godownKey]) {
                    branchAcc[branchKey].Godowns[godownKey] = {
                        GoDown_Id: item.GoDown_Id,
                        Godown_Name: item.Godown_Name,
                        Products: [],
                    };
                }

                branchAcc[branchKey].Godowns[godownKey].Products.push({
                    Product_Id: item.Product_Id,
                    Product_Name: item.Product_Name,
                    Stock_Item: item.Stock_Item,
                    Item_Name_Modified: item.Item_Name_Modified,
                    Stock_Group: item.Stock_Group,
                    S_Sub_Group_1: item.S_Sub_Group_1,
                    Grade_Item_Group: item.Grade_Item_Group,
                    Sales_Quantity: item.Sales_Quantity,
                });

                return branchAcc;
            }, {});


            const resultArray = Object.values(groupedData).map(branch => ({
                ...branch,
                Godowns: Object.values(branch.Godowns),
            }));

            sentData(res, resultArray);
        } catch (e) {
            console.error("Error in sales report:", e);
            servError(e, res);
        }
    };

    const createSalesTransaction = async (req, res) => {
        const {
            transactionType,
            Retailer_Id,
            Sales_Person_Id = 0,
            Branch_Id,
            Narration = null,
            Created_by,
            ProductList = [],
            Product_Array = [],
            GST_Inclusive = 1,
            IS_IGST = 0,
            Voucher_Type,
            staff_Involved_List = [],
            Staffs_Array = [],
            Expence_Array = [],
            Pre_Id,
            So_No,
            So_Id,
            Cancel_status = 1,
            Stock_Item_Ledger_Name = '',
            Round_off = 0,
            Do_Date
        } = req.body;

        if (
            !checkIsNumber(Retailer_Id) ||
            !checkIsNumber(Created_by) ||
            !checkIsNumber(Voucher_Type) ||
            !checkIsNumber(Branch_Id)
        ) {
            return invalidInput(res, 'Retailer_Id, Created_by, VoucherType,Branch_Id are required');
        }

        if ((transactionType === 'order' || transactionType === 'both') && !checkIsNumber(Sales_Person_Id)) {
            return invalidInput(res, 'Sales_Person_Id is required for order creation');
        }

        if (transactionType === 'invoice' && !checkIsNumber(So_Id)) {
            return invalidInput(res, 'So_No is required for invoice creation');
        }

        const transaction = new sql.Transaction();
        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const taxType = isNotTaxableBill ? 'zerotax' : isInclusive ? 'remove' : 'add';

        try {
            const productsData = (await getProducts()).dataArray || [];
            const Alter_Id = Math.floor(Math.random() * 999999);

            const transactionDate = ISOString(req?.body?.Do_Date) || ISOString();


            const yearData = await new sql.Request()
                .input('TransactionDate', transactionDate)
                .query(`
                SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE Fin_Start_Date <= @TransactionDate 
                  AND Fin_End_Date >= @TransactionDate
            `);

            if (yearData.recordset.length === 0) throw new Error('Year_Id not found');
            const { Year_Id, Year_Desc } = yearData.recordset[0];


            const voucherData = await new sql.Request()
                .input('Voucher_Type', Voucher_Type)
                .query(`SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Voucher_Type`);

            const VoucherCode = voucherData.recordset[0]?.Voucher_Code;
            if (!VoucherCode) throw new Error('Failed to fetch Voucher Code');

            await transaction.begin();

            let soId = null, doId = null, soInvNo = null, doInvNo = null;

            if (transactionType === 'order' || transactionType === 'both') {

                const So_Id_Get = await getNextId({ table: 'tbl_Sales_Order_Gen_Info', column: 'So_Id' });
                if (!So_Id_Get.status || !checkIsNumber(So_Id_Get.MaxId)) throw new Error('Failed to get So_Id');
                soId = So_Id_Get.MaxId;

                const So_Branch_Inv_Id = Number((await new sql.Request()
                    .input('So_Year', Year_Id)
                    .input('Voucher_Type', Voucher_Type)
                    .query(`
                    SELECT COALESCE(MAX(So_Branch_Inv_Id), 0) AS So_Branch_Inv_Id
                    FROM tbl_Sales_Order_Gen_Info
                    WHERE So_Year = @So_Year
                      AND VoucherType = @Voucher_Type
                `)
                )?.recordset[0]?.So_Branch_Inv_Id) + 1;

                if (!checkIsNumber(So_Branch_Inv_Id)) throw new Error('Failed to get Order Id');


                soInvNo = `${VoucherCode}/${createPadString(So_Branch_Inv_Id, 6)}/${Year_Desc}`;

                const orderTotals = ProductList.reduce((acc, item) => {

                    const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                    const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                    const Amount = Multiplication(billQty, itemRate);
                    const discount = toNumber(item?.Disc_Val) || 0;

                    if (isNotTaxableBill) {
                        acc.TotalValue = Addition(acc.TotalValue, Addition(Amount, -discount));
                        acc.TotalTax = Addition(acc.TotalTax, 0);
                        acc.TotalInvoice = Addition(acc.TotalInvoice, Addition(Amount, -discount));
                        return acc;
                    }

                    const product = findProductDetails(productsData, item.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1)
                        ? (product?.Igst_P ?? product?.Gst_P ?? 0)
                        : (product?.Gst_P ?? 0);

                    const taxPerc = (product && product.Gst_P != null)
                        ? gstPercentage
                        : (toNumber(item?.Tax_Rate) || toNumber(item?.Tax_Per) || 0);

                    const totalAfterDiscount = Addition(Amount, -discount);
                    const taxInfo = calculateGSTDetails(totalAfterDiscount, taxPerc, isInclusive ? 'remove' : 'add');

                    acc.TotalValue = Addition(acc.TotalValue, taxInfo.without_tax ?? 0);
                    acc.TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount ?? 0);
                    acc.TotalInvoice = Addition(acc.TotalInvoice, taxInfo.with_tax ?? 0);

                    return acc;
                }, { TotalValue: 0, TotalTax: 0, TotalInvoice: 0 });

                const Total_Invoice_value1 = RoundNumber(orderTotals.TotalInvoice);

                const Round_Off1 = RoundNumber(Math.round(Total_Invoice_value1) - Total_Invoice_value1);



                const soRequest = new sql.Request(transaction)
                    .input('So_Id', soId)
                    .input('So_Inv_No', soInvNo)
                    .input('So_Year', Year_Id)
                    .input('Pre_Id', toNumber(Pre_Id) || null)
                    .input('So_Branch_Inv_Id', So_Branch_Inv_Id)
                    .input('So_Date', transactionDate)
                    .input('Retailer_Id', Retailer_Id)
                    .input('Sales_Person_Id', Sales_Person_Id)
                    .input('Branch_Id', Branch_Id)
                    .input('VoucherType', Voucher_Type)
                    .input('GST_Inclusive', GST_Inclusive)
                    .input('CSGT_Total', isIGST ? 0 : (orderTotals.TotalTax / 2))
                    .input('SGST_Total', isIGST ? 0 : (orderTotals.TotalTax / 2))
                    .input('IGST_Total', isIGST ? orderTotals.TotalTax : 0)
                    .input('IS_IGST', isIGST ? 1 : 0)
                    .input('Round_off', Round_Off1)
                    .input('Total_Invoice_value', Math.round(Total_Invoice_value1))
                    .input('Total_Before_Tax', orderTotals.TotalValue)
                    .input('Total_Tax', orderTotals.TotalTax)
                    .input('Narration', Narration)
                    .input('Cancel_status', 0)
                    .input('Created_by', Created_by)
                    .input('Altered_by', Created_by)
                    .input('Alter_Id', Alter_Id)
                    .input('Created_on', new Date())
                    .input('Alterd_on', new Date())
                    .input('Trans_Type', 'INSERT');

                const soInsertQuery = `
                INSERT INTO tbl_Sales_Order_Gen_Info (
                    So_Id, So_Inv_No, So_Year, Pre_Id, So_Branch_Inv_Id, So_Date, 
                    Retailer_Id, Sales_Person_Id, Branch_Id, VoucherType, CSGT_Total, 
                    SGST_Total, IGST_Total, GST_Inclusive, IS_IGST, Round_off, 
                    Total_Invoice_value, Total_Before_Tax, Total_Tax, Narration, Cancel_status, 
                    Created_by, Altered_by, Alter_Id, Created_on, Alterd_on, Trans_Type
                ) VALUES (
                    @So_Id, @So_Inv_No, @So_Year, @Pre_Id, @So_Branch_Inv_Id, @So_Date, 
                    @Retailer_Id, @Sales_Person_Id, @Branch_Id, @VoucherType, @CSGT_Total, 
                    @SGST_Total, @IGST_Total, @GST_Inclusive, @IS_IGST, @Round_off, 
                    @Total_Invoice_value, @Total_Before_Tax, @Total_Tax, @Narration, @Cancel_status, 
                    @Created_by, @Altered_by, @Alter_Id, @Created_on, @Alterd_on, @Trans_Type
                );
            `;
                const soRes = await soRequest.query(soInsertQuery);
                if (soRes.rowsAffected[0] === 0) throw new Error('Failed to create order, Try again.');

                for (let i = 0; i < ProductList.length; i++) {
                    const product = ProductList[i];
                    const productDetails = findProductDetails(productsData, product.Item_Id);

                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? (productDetails?.Igst_P ?? product?.Tax_Per ?? 0) : (productDetails?.Gst_P ?? product?.Tax_Per ?? 0);
                    const Taxble = gstPercentage > 0 ? 1 : 0;
                    const Bill_Qty = Number(product.Bill_Qty ?? product.Qty ?? 0);
                    const Item_Rate = RoundNumber(product.Item_Rate ?? product.Rate ?? 0);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);
                    const discount = toNumber(product?.Disc_Val) || 0;
                    const netAmount = Addition(Amount, -discount);

                    const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                    const gstInfo = calculateGSTDetails(netAmount, gstPercentage, taxType);

                    const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                    const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                    const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                    const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                    const soStockReq = new sql.Request(transaction)
                        .input('So_Date', transactionDate)
                        .input('Sales_Order_Id', soId)
                        .input('S_No', i + 1)
                        .input('Item_Id', product.Item_Id)
                        .input('Pre_Id', toNumber(Pre_Id) || null)
                        .input('Bill_Qty', Bill_Qty)
                        .input('Item_Rate', Item_Rate)
                        .input('Amount', Amount)
                        .input('Free_Qty', 0)
                        .input('Total_Qty', Bill_Qty)
                        .input('Taxble', Taxble)
                        .input('Taxable_Rate', itemRateGst.base_amount)
                        .input('HSN_Code', productDetails?.HSN_Code ?? '')
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
                        .input('Created_on', new Date());

                    const soStockQuery = `
                    INSERT INTO tbl_Sales_Order_Stock_Info (
                        So_Date, Sales_Order_Id, S_No, Item_Id, Pre_Id, Bill_Qty, Item_Rate, Amount, Free_Qty, Total_Qty, 
                        Taxble, Taxable_Rate, HSN_Code, Unit_Id, Unit_Name, Taxable_Amount, Tax_Rate, 
                        Cgst, Cgst_Amo, Sgst, Sgst_Amo, Igst, Igst_Amo, Final_Amo, Created_on
                    ) VALUES (
                        @So_Date, @Sales_Order_Id, @S_No, @Item_Id, @Pre_Id, @Bill_Qty, @Item_Rate, @Amount, @Free_Qty, @Total_Qty, 
                        @Taxble, @Taxable_Rate, @HSN_Code, @Unit_Id, @Unit_Name, @Taxable_Amount, @Tax_Rate, 
                        @Cgst, @Cgst_Amo, @Sgst, @Sgst_Amo, @Igst, @Igst_Amo, @Final_Amo, @Created_on
                    );
                `;
                    const soStockRes = await soStockReq.query(soStockQuery);
                    if (soStockRes.rowsAffected[0] === 0) throw new Error('Failed to create order stock row, Try again.');
                }

                for (const staff of toArray(staff_Involved_List)) {
                    const staffReq = new sql.Request(transaction)
                        .input('So_Id', sql.Int, soId)
                        .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id || staff?.Emp_Id || 0)
                        .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id || null);

                    await staffReq.query(`
                    INSERT INTO tbl_Sales_Order_Staff_Info (So_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                    VALUES (@So_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);
                `);
                }
            }

            if (transactionType === 'invoice' || transactionType === 'both') {

                const getDo_Id = await getNextId({ table: 'tbl_Sales_Delivery_Gen_Info', column: 'Do_Id' });
                if (!getDo_Id.status || !checkIsNumber(getDo_Id.MaxId)) throw new Error('Failed to get Do_Id');
                doId = getDo_Id.MaxId;


                const Do_No = Number((await new sql.Request()
                    .input('Do_Year', Year_Id)
                    .input('Voucher_Type', Voucher_Type)
                    .query(`
                    SELECT COALESCE(MAX(Do_No), 0) AS Do_No
                    FROM tbl_Sales_Delivery_Gen_Info
                    WHERE Do_Year = @Do_Year
                      AND Voucher_Type = @Voucher_Type
                `)
                ).recordset[0]?.Do_No) + 1;

                if (!checkIsNumber(Do_No)) throw new Error('Failed to get Order Id');

                doInvNo = `${VoucherCode}/${createPadString(Do_No, 6)}/${Year_Desc}`;


                const invoiceTotals = (() => {
                    const productTax = Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                        const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                        const Amount = Multiplication(billQty, itemRate);
                        const discount = toNumber(item?.Disc_Val) || 0;
                        const net = Addition(Amount, -discount);

                        if (isNotTaxableBill) {
                            acc.TotalValue = Addition(acc.TotalValue, net);
                            return acc;
                        }

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? (product?.Igst_P ?? product?.Gst_P ?? item?.Tax_Per ?? 0) : (product?.Gst_P ?? item?.Tax_Per ?? 0);
                        const taxInfo = calculateGSTDetails(net, gstPercentage, isInclusive ? 'remove' : 'add');

                        acc.TotalValue = Addition(acc.TotalValue, taxInfo.without_tax);
                        acc.TotalTax = Addition(acc.TotalTax, taxInfo.tax_amount);
                        acc.TotalInvoice = Addition(acc.TotalInvoice, taxInfo.with_tax);
                        return acc;
                    }, { TotalValue: 0, TotalTax: 0, TotalInvoice: 0 });


                    const invoiceExpencesTaxTotal = toArray(Expence_Array).reduce((acc, exp) => {
                        return Addition(acc, IS_IGST ? (exp?.Igst_Amo || 0) : Addition(exp?.Cgst_Amo || 0, exp?.Sgst_Amo || 0));
                    }, 0);

                    return {
                        TotalValue: productTax.TotalValue,
                        TotalTax: Addition(productTax.TotalTax, invoiceExpencesTaxTotal),
                        TotalInvoice: productTax.TotalInvoice
                    };
                })();

                const TotalExpences = toNumber(RoundNumber(
                    toArray(Expence_Array).reduce((acc, exp) => Addition(acc, exp?.Expence_Value || exp?.Amount || 0), 0)
                ));

                const Total_Invoice_value = RoundNumber(
                    Addition(TotalExpences, Product_Array.reduce((acc, item) => {
                        const itemRate = RoundNumber(item?.Item_Rate ?? item?.Rate ?? 0);
                        const billQty = RoundNumber(item?.Bill_Qty ?? item?.Qty ?? 0);
                        const Amount = Multiplication(billQty, itemRate);
                        const discount = toNumber(item?.Disc_Val) || 0;
                        const net = Addition(Amount, -discount);

                        if (isNotTaxableBill) return Addition(acc, net);

                        const product = findProductDetails(productsData, item.Item_Id);
                        const gstPercentage = isEqualNumber(IS_IGST, 1) ? (product?.Igst_P ?? product?.Gst_P ?? item?.Tax_Per ?? 0) : (product?.Gst_P ?? item?.Tax_Per ?? 0);

                        if (isInclusive) {
                            return Addition(acc, calculateGSTDetails(net, gstPercentage, 'remove').with_tax);
                        } else {
                            return Addition(acc, calculateGSTDetails(net, gstPercentage, 'add').with_tax);
                        }
                    }, 0))
                );

                const CGST = isIGST ? 0 : invoiceTotals.TotalTax / 2;
                const SGST = isIGST ? 0 : invoiceTotals.TotalTax / 2;
                const IGST = isIGST ? invoiceTotals.TotalTax : 0;

                const soNoForInvoice = (transactionType === 'both' && checkIsNumber(soId)) ? soId : (checkIsNumber(So_Id) ? toNumber(So_Id) : null);
                const doRequest = new sql.Request(transaction)
                    .input('Do_Id', doId)
                    .input('Do_Inv_No', doInvNo)
                    .input('Voucher_Type', Voucher_Type)
                    .input('Do_No', Do_No)
                    .input('Do_Year', Year_Id)
                    .input('Do_Date', transactionDate)
                    .input('Branch_Id', sql.Int, Branch_Id)
                    .input('Retailer_Id', Retailer_Id)
                    .input('Delivery_Person_Id', 0)
                    .input('Narration', Narration)
                    .input('So_No', soNoForInvoice)
                    .input('Cancel_status', toNumber(Cancel_status))
                    .input('GST_Inclusive', sql.Int, GST_Inclusive)
                    .input('IS_IGST', isIGST ? 1 : 0)
                    .input('CSGT_Total', CGST)
                    .input('SGST_Total', SGST)
                    .input('IGST_Total', IGST)
                    .input('Round_off', Round_off || RoundNumber(Math.round(Total_Invoice_value) - Total_Invoice_value))
                    .input('Total_Expences', TotalExpences)
                    .input('Total_Before_Tax', invoiceTotals.TotalValue)
                    .input('Total_Tax', invoiceTotals.TotalTax)
                    .input('Total_Invoice_value', Math.round(Total_Invoice_value))
                    .input('Stock_Item_Ledger_Name', Stock_Item_Ledger_Name)
                    .input('Trans_Type', 'INSERT')
                    .input('Alter_Id', sql.BigInt, Alter_Id)
                    .input('Created_by', sql.BigInt, Created_by)
                    .input('Created_on', sql.DateTime, new Date());

                const doInsertQuery = `
                INSERT INTO tbl_Sales_Delivery_Gen_Info (
                    Do_Id, Do_Inv_No, Voucher_Type, Do_No, Do_Year, 
                    Do_Date, Branch_Id, Retailer_Id, Delivery_Person_Id, Narration, So_No, Cancel_status,
                    GST_Inclusive, IS_IGST, CSGT_Total, SGST_Total, IGST_Total, Total_Expences, Round_off, 
                    Total_Before_Tax, Total_Tax, Total_Invoice_value, Stock_Item_Ledger_Name,
                    Trans_Type, Alter_Id, Created_by, Created_on
                ) VALUES (
                    @Do_Id, @Do_Inv_No, @Voucher_Type, @Do_No, @Do_Year,
                    @Do_Date, @Branch_Id, @Retailer_Id, @Delivery_Person_Id, @Narration, @So_No, @Cancel_status,
                    @GST_Inclusive, @IS_IGST, @CSGT_Total, @SGST_Total, @IGST_Total, @Total_Expences, @Round_off, 
                    @Total_Before_Tax, @Total_Tax, @Total_Invoice_value, @Stock_Item_Ledger_Name,
                    @Trans_Type, @Alter_Id, @Created_by, @Created_on
                );
            `;
                const doResult = await doRequest.query(doInsertQuery);
                if (doResult.rowsAffected[0] === 0) throw new Error('Failed to create general info in sales invoice');


                const isSO = checkIsNumber(So_No) || transactionType === 'both';

                for (const [index, product] of Product_Array.entries()) {
                    const productDetails = findProductDetails(productsData, product.Item_Id);

                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? (productDetails?.Igst_P ?? product?.Tax_Per ?? 0) : (productDetails?.Gst_P ?? product?.Tax_Per ?? 0);
                    const Taxble = gstPercentage > 0 ? 1 : 0;
                    const Bill_Qty = Number(product.Bill_Qty ?? product.Qty ?? 0);
                    const Item_Rate = RoundNumber(product.Item_Rate ?? product.Rate ?? 0);
                    const Amount = Multiplication(Bill_Qty, Item_Rate);
                    const netDiscount = toNumber(product?.Disc_Val) || 0;

                    const itemRateGst = calculateGSTDetails(Item_Rate, gstPercentage, taxType);
                    const gstInfo = calculateGSTDetails(Addition(Amount, -netDiscount), gstPercentage, taxType);

                    const cgstPer = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_per : 0;
                    const igstPer = (!isNotTaxableBill && isIGST) ? gstInfo.igst_per : 0;
                    const Cgst_Amo = (!isNotTaxableBill && !isIGST) ? gstInfo.cgst_amount : 0;
                    const Igst_Amo = (!isNotTaxableBill && isIGST) ? gstInfo.igst_amount : 0;

                    const request2 = new sql.Request(transaction)
                        .input('Do_Date', transactionDate)
                        .input('DeliveryOrder', doId)
                        .input('S_No', index + 1)
                        .input('Item_Id', product.Item_Id)
                        .input('Bill_Qty', Bill_Qty)

                        .input('Act_Qty', Bill_Qty)
                        .input('Alt_Act_Qty', isSO ? toNumber(product?.Alt_Act_Qty) : toNumber(product?.Act_Qty) || Bill_Qty)
                        .input('Item_Rate', toNumber(Item_Rate))
                        .input('GoDown_Id', checkIsNumber(product?.GoDown_Id) ? Number(product?.GoDown_Id) : null)
                        .input('Amount', toNumber(Amount))
                        .input('Free_Qty', 0)
                        .input('Total_Qty', Bill_Qty)
                        .input('Taxble', Taxble)
                        .input('Taxable_Rate', itemRateGst.base_amount)
                        .input('HSN_Code', productDetails?.HSN_Code ?? '')
                        .input('Unit_Id', product.Unit_Id ?? '')
                        .input('Act_unit_Id', isSO ? product.Act_unit_Id : product.Unit_Id)
                        .input('Alt_Act_Unit_Id', isSO ? product.Alt_Act_Unit_Id : product.Unit_Id)
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
                        );
                    `);

                    const result2 = await request2;
                    if (result2.rowsAffected[0] === 0) throw new Error('Failed to create order, Try again.');
                }
                if (Array.isArray(Expence_Array) && Expence_Array.length > 0) {
                    for (let expInd = 0; expInd < Expence_Array.length; expInd++) {
                        const exp = Expence_Array[expInd];
                        const Expence_Value_DR = toNumber(exp?.Expence_Value || exp?.Amount) >= 0 ? toNumber(exp?.Expence_Value || exp?.Amount) : 0;
                        const Expence_Value_CR = toNumber(exp?.Expence_Value || exp?.Amount) < 0 ? Math.abs(toNumber(exp?.Expence_Value || exp?.Amount)) : 0;

                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Sno', expInd + 1)
                            .input('Expense_Id', toNumber(exp?.Expense_Id))
                            .input('Expence_Value_DR', Expence_Value_DR)
                            .input('Expence_Value_CR', Expence_Value_CR)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert Expence row in sales invoice creation');
                        }
                    }
                }

                const taxTypes = [
                    { expName: 'CGST', Value: CGST },
                    { expName: 'SGST', Value: SGST },
                    { expName: 'IGST', Value: IGST },
                    { expName: 'ROUNDOFF', Value: Round_off || (Math.round(Total_Invoice_value) - Total_Invoice_value) }
                ].filter(fil => toNumber(fil.Value) !== 0);

                let snoOffset = toNumber(Expence_Array?.length) || 0;

                if (taxTypes.length > 0) {
                    const getExpName = new sql.Request();
                    taxTypes.forEach((t, i) => getExpName.input(`exp${i}`, t.expName));
                    const inClause = taxTypes.map((_, i) => `@exp${i}`).join(', ');

                    const getCurrespondingAccount = getExpName.query(`
                    SELECT Acc_Id, AC_Reason 
                    FROM tbl_Default_AC_Master 
                    WHERE AC_Reason IN (${inClause}) 
                    AND Acc_Id IS NOT NULL;
                `);

                    const expData = (await getCurrespondingAccount).recordset;

                    const missing = taxTypes.filter(exp =>
                        !expData.some(row => stringCompare(row.AC_Reason, exp.expName))
                    );

                    if (missing.length > 0) {
                        throw new Error(`Expense id not mapped: ${missing.map(m => m.expName).join(', ')}`);
                    }

                    for (let i = 0; i < taxTypes.length; i++) {
                        const { expName, Value } = taxTypes[i];
                        const numValue = Number(Value);
                        const Expense_Id = expData.find(exp => stringCompare(exp.AC_Reason, expName)).Acc_Id;

                        const Expence_Value_DR = numValue >= 0 ? numValue : 0;
                        const Expence_Value_CR = numValue < 0 ? Math.abs(numValue) : 0;

                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Sno', snoOffset + i + 1)
                            .input('Expense_Id', Expense_Id)
                            .input('Expence_Value_DR', Expence_Value_DR)
                            .input('Expence_Value_CR', Expence_Value_CR)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Expence_Info (
                                Do_Id, Sno, Expense_Id, Expence_Value_DR, Expence_Value_CR
                            ) VALUES (
                                @Do_Id, @Sno, @Expense_Id, @Expence_Value_DR, @Expence_Value_CR
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert tax expense row');
                        }
                    }
                }

                if (Array.isArray(staff_Involved_List) && staff_Involved_List.length > 0) {
                    for (const staff of staff_Involved_List) {
                        const request = new sql.Request(transaction)
                            .input('Do_Id', doId)
                            .input('Involved_Emp_Id', sql.Int, staff?.Involved_Emp_Id || staff?.Emp_Id || 0)
                            .input('Cost_Center_Type_Id', sql.Int, staff?.Cost_Center_Type_Id || null)
                            .query(`
                            INSERT INTO tbl_Sales_Delivery_Staff_Info (
                                Do_Id, Emp_Id, Emp_Type_Id
                            ) VALUES (
                                @Do_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                            )`
                            );

                        const result = await request;
                        if (result.rowsAffected[0] === 0) {
                            throw new Error('Failed to insert Staff row in sales invoice creation');
                        }
                    }
                }

                if (checkIsNumber(Pre_Id)) {
                    const updatePresalesOrder = new sql.Request(transaction)
                        .input('Pre_Id', toNumber(Pre_Id) || null)
                        .query(`
                        UPDATE tbl_Pre_Sales_Order_Gen_Info
                        SET isConverted = 2, Cancel_status = 'Progress'
                        WHERE Pre_Id = @Pre_Id
                    `);

                    const updateResult = await updatePresalesOrder;
                    if (updateResult.rowsAffected[0] === 0) {
                        throw new Error('Failed to update Pre-Sales Order');
                    }
                }
            }
            await transaction.commit();

            let message = '';
            let data = {};
            if (transactionType === 'order') {
                message = 'Order Created!';
                data = { So_Id: soId, So_Inv_No: soInvNo };
            } else if (transactionType === 'invoice') {
                message = 'Invoice Created!';
                data = { Do_Id: doId, Do_Inv_No: doInvNo };
            } else {
                message = 'Order and Invoice Created!';
                data = { So_Id: soId, So_Inv_No: soInvNo, Do_Id: doId, Do_Inv_No: doInvNo };
            }

            return success(res, message, data);
        } catch (e) {

            try {
                if (transaction._aborted === false) await transaction.rollback();
            } catch (rbErr) {
                console.error('Rollback failed:', rbErr);
            }
            console.error('createSalesTransaction error:', e);
            return servError(e, res);
        }
    };

    const getSaleOrderWithDeliveries = async (req, res) => {
        try {
            const { So_Id } = req.query;

            if (!So_Id) {
                return res.status(400).json({ success: false, message: "So_Id is required" });
            }

            const pool = await sql.Request()

                .input("SoIdParam", sql.Int, So_Id)
                .query(`
        -- 1. Sales Order Details
        SELECT 
            so.*, 
            rm.Retailer_Name, 
            u.Name AS CreatedByName
        FROM tbl_Sales_Order_Gen_Info so
        LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = so.Retailer_Id
        LEFT JOIN tbl_Users u ON u.UserId = so.Created_by
        WHERE so.So_Id = @SoIdParam;

        -- 2. Sales Order Products
        SELECT 
            si.*, 
            pm.Product_Name
        FROM tbl_Sales_Order_Stock_Info si
        LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = si.Item_Id
        WHERE si.Sales_Order_Id = @SoIdParam;

      
        SELECT 
            dgi.*, 
            st.Status AS DeliveryStatusName
        FROM tbl_Sales_Delivery_Gen_Info dgi
        LEFT JOIN tbl_Status st ON st.Status_Id = dgi.Delivery_Status
        WHERE dgi.So_No = @SoIdParam;

        -- 4. Delivery Products (if Act_Qty is NULL, use Bill_Qty)
        SELECT 
            dsi.*, 
            pm.Product_Name,
            COALESCE(dsi.Act_Qty, dsi.Bill_Qty) AS Act_Qty_Updated
        FROM tbl_Sales_Delivery_Stock_Info dsi
        LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = dsi.Item_Id
        WHERE dsi.Delivery_Order_Id IN (
            SELECT Do_Id 
            FROM tbl_Sales_Delivery_Gen_Info 
            WHERE So_No = @SoIdParam
        );
      `);

            const [orderInfo, orderProducts, deliveryOrders, deliveryProducts] = result.recordsets;

            if (!orderInfo.length) {
                return res.status(404).json({ success: false, message: "Sales order not found" });
            }

            const response = {
                ...orderInfo[0],
                Products_List: orderProducts || [],
                Deliveries: (deliveryOrders || []).map(doRow => ({
                    ...doRow,
                    Products: (deliveryProducts || []).filter(p => p.Delivery_Order_Id === doRow.Do_Id)
                }))
            };

            dataFound(res, response);

        } catch (err) {
            console.error(err);
            servError(err, res);
        }
    };

// const getSalesOrderInvoice = async (req, res) => {
//     try {

//              await uploadFile(req, res, 5, 'WhatsappPdf');

//         const fileName = req?.file?.filename;
//         const filePath = req?.file?.path;

//         if (!fileName) {
//             return invalidInput(res, 'Product Photo is required');
//         }

//         const { Do_Inv_No } = req.query;

//         const request = new sql.Request()
//             .input('Do_Inv_No', sql.NVarChar, Do_Inv_No); 
            

//         const result = await request.query(`
//             DECLARE @FilteredOrders TABLE (Do_Id INT);
            
//             -- Get Delivery Orders based on Do_Inv_No
//             INSERT INTO @FilteredOrders (Do_Id)
//             SELECT dgi.Do_Id
//             FROM tbl_Sales_Delivery_Gen_Info AS dgi
//             WHERE 1 = 1
//                 ${Do_Inv_No ? " AND dgi.Do_Inv_No = @Do_Inv_No " : ""}
            
//             -- Get Sales Order General Info based on filtered delivery orders
//             SELECT 
//                 so.*,
//                 lol.*,
//                 COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
//                 COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
//                 COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
//                 COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
//                 COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
//             FROM tbl_Sales_Order_Gen_Info AS so
//             LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
//             LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
//             LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
//             LEFT JOIN tbl_Ledger_LOL lol ON lol.Ret_Id = so.Retailer_Id
//             LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
//             LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
//             WHERE so.So_Id IN (
//                 SELECT DISTINCT So_No 
//                 FROM tbl_Sales_Delivery_Gen_Info 
//                 WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
//             );

//             -- Get Sales Order Stock Info
//             SELECT 
//                 si.*,
//                 COALESCE(pm.Product_Name, 'not available') AS Product_Name,
//                 COALESCE(pm.Short_Name, 'not available') AS Product_Short_Name,
//                 COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
//                 COALESCE(u.Units, 'not available') AS UOM,
//                 COALESCE(b.Brand_Name, 'not available') AS BrandGet
//             FROM tbl_Sales_Order_Stock_Info AS si
//             LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
//             LEFT JOIN tbl_UOM AS u ON u.Unit_Id = si.Unit_Id
//             LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
//             WHERE si.Sales_Order_Id IN (
//                 SELECT DISTINCT So_No 
//                 FROM tbl_Sales_Delivery_Gen_Info 
//                 WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
//             );

//             -- Get Staff Involved
//             SELECT 
//                 sosi.So_Id, 
//                 sosi.Involved_Emp_Id,
//                 sosi.Cost_Center_Type_Id,
//                 c.Cost_Center_Name AS EmpName,
//                 cc.Cost_Category AS EmpType
//             FROM tbl_Sales_Order_Staff_Info AS sosi
//             LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
//             LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
//             WHERE sosi.So_Id IN (
//                 SELECT DISTINCT So_No 
//                 FROM tbl_Sales_Delivery_Gen_Info 
//                 WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
//             );

//             -- Get Delivery General Info (filtered by Do_Inv_No)
//             SELECT 
//                 dgi.*,
//                 lol.Ledger_Name AS Retailer_Name,
//                 bm.BranchName AS Branch_Name,
//                 st.Status AS DeliveryStatusName,
//                 COALESCE((
//                     SELECT SUM(collected_amount)
//                     FROM tbl_Sales_Receipt_Details_Info
//                     WHERE bill_id = dgi.Do_Id
//                 ), 0) AS receiptsTotalAmount
//             FROM tbl_Sales_Delivery_Gen_Info AS dgi
//             LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
//             LEFT JOIN tbl_Ledger_Lol as lol ON lol.Ret_Id=rm.Retailer_Id
//             LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
//             LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
//             WHERE dgi.Do_Id IN (SELECT Do_Id FROM @FilteredOrders);

//             -- Get Delivery Stock Items (filtered by Do_Inv_No)
//             SELECT 
//                 oi.*,
//                 COALESCE(pm.Product_Name, 'not available') AS Product_Name,
//                 COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
//                 COALESCE(u.Units, 'not available') AS UOM,
//                 COALESCE(b.Brand_Name, 'not available') AS BrandGet
//             FROM tbl_Sales_Delivery_Stock_Info AS oi
//             LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
//             LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
//             LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
//             WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredOrders);`
//         );

//         const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = result.recordsets.map(toArray);

//         if (DeliveryData.length > 0) {
//             const resData = DeliveryData.map(delivery => {
//                 // Find related sales order
//                 const relatedOrder = OrderData.find(order => 
//                     isEqualNumber(order.So_Id, delivery.So_No)
//                 ) || {};
                
//                 // Find order products for this sales order
//                 const orderProducts = ProductDetails.filter(p =>
//                     isEqualNumber(p.Sales_Order_Id, delivery.So_No)
//                 );
                
//                 // Find staff involved for this sales order
//                 const staffInvolved = StaffInvolved.filter(s =>
//                     isEqualNumber(s.So_Id, delivery.So_No)
//                 );
                
//                 // Get delivery items for this specific delivery
//                 const deliveryItems = DeliveryItems.filter(item =>
//                     isEqualNumber(item.Delivery_Order_Id, delivery.Do_Id)
//                 ).map(item => ({
//                     ...item
//                 }));

//                 // Calculate total ordered quantity from sales order
//                 const totalOrderedQty = orderProducts.reduce(
//                     (sum, p) => sum + toNumber(p.Bill_Qty),
//                     0
//                 );
                
//                 // Calculate total delivered quantity for this sales order across all deliveries
//                 const allDeliveryItemsForOrder = DeliveryItems.filter(item => {
//                     const delivery = DeliveryData.find(d => 
//                         isEqualNumber(d.Do_Id, item.Delivery_Order_Id)
//                     );
//                     return delivery && isEqualNumber(delivery.So_No, delivery.So_No);
//                 });
                
//                 const totalDeliveredQty = allDeliveryItemsForOrder.reduce(
//                     (sum, p) => sum + toNumber(p.Bill_Qty),
//                     0
//                 );

//                 const orderStatus = totalDeliveredQty >= totalOrderedQty ? "completed" : "pending";

//                 return {
//                     ...delivery,
//                     SalesOrderData: {
//                         ...relatedOrder,
//                         Products_List: orderProducts.map(p => ({ ...p })),
//                         Staff_Involved_List: staffInvolved,
//                         OrderStatus: orderStatus,
//                         TotalOrderedQty: totalOrderedQty,
//                         TotalDeliveredQty: totalDeliveredQty
//                     },
//                     DeliveryItems: deliveryItems,
//                     OrderStatus: orderStatus
//                 };
//             });

//             dataFound(res, resData);
//         } else {
//             noData(res);
//         }

//     } catch (e) {
//         servError(e, res);
//     }
// };

const getSalesOrderInvoice = async (req, res) => {
    let uploadedFileName = null;
    let uploadedFilePath = null;

    try {
        // Handle file upload first (if any)
        if (req.file) {
            await uploadFile(req, res, 5, 'WhatsappPdf');
            uploadedFileName = req?.file?.filename;
            uploadedFilePath = req?.file?.path;
        }

        const { Do_Inv_No } = req.query;

        // Validate input
        if (!Do_Inv_No) {
            return invalidInput(res, 'Invoice number is required');
        }

        const request = new sql.Request()
            .input('Do_Inv_No', sql.NVarChar, Do_Inv_No);

        const result = await request.query(`
            DECLARE @FilteredOrders TABLE (Do_Id INT);
            
            -- Get Delivery Orders based on Do_Inv_No
            INSERT INTO @FilteredOrders (Do_Id)
            SELECT dgi.Do_Id
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            WHERE dgi.Do_Inv_No = @Do_Inv_No;
            
            -- Get Sales Order General Info based on filtered delivery orders
            SELECT 
                so.*,
                lol.*,
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Ledger_LOL lol ON lol.Ret_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE so.So_Id IN (
                SELECT DISTINCT So_No 
                FROM tbl_Sales_Delivery_Gen_Info 
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
            );

            -- Get Sales Order Stock Info
            SELECT 
                si.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Short_Name, 'not available') AS Product_Short_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Order_Stock_Info AS si
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = si.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE si.Sales_Order_Id IN (
                SELECT DISTINCT So_No 
                FROM tbl_Sales_Delivery_Gen_Info 
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
            );

            -- Get Staff Involved
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (
                SELECT DISTINCT So_No 
                FROM tbl_Sales_Delivery_Gen_Info 
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredOrders)
            );

            -- Get Delivery General Info (filtered by Do_Inv_No)
            SELECT 
                dgi.*,
                lol.Ledger_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Ledger_Lol as lol ON lol.Ret_Id = rm.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.Do_Id IN (SELECT Do_Id FROM @FilteredOrders);

            -- Get Delivery Stock Items (filtered by Do_Inv_No)
            SELECT 
                oi.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info AS oi
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredOrders);`
        );

        const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = 
            result.recordsets.map(recordset => toArray(recordset));

        if (DeliveryData.length === 0) {
            return noData(res);
        }

        // Process and combine the data
        const processedData = DeliveryData.map(delivery => {
            // Find related sales order
            const relatedOrder = OrderData.find(order => 
                isEqualNumber(order.So_Id, delivery.So_No)
            ) || {};
            
            // Find order products for this sales order
            const orderProducts = ProductDetails.filter(p =>
                isEqualNumber(p.Sales_Order_Id, delivery.So_No)
            );
            
            // Find staff involved for this sales order
            const staffInvolved = StaffInvolved.filter(s =>
                isEqualNumber(s.So_Id, delivery.So_No)
            );
            
            // Get delivery items for this specific delivery
            const deliveryItems = DeliveryItems.filter(item =>
                isEqualNumber(item.Delivery_Order_Id, delivery.Do_Id)
            );

            // Calculate totals
            const totalOrderedQty = orderProducts.reduce(
                (sum, p) => sum + toNumber(p.Bill_Qty),
                0
            );
            
            const totalDeliveredQty = DeliveryItems.filter(item => {
                const itemDelivery = DeliveryData.find(d => 
                    isEqualNumber(d.Do_Id, item.Delivery_Order_Id)
                );
                return itemDelivery && isEqualNumber(itemDelivery.So_No, delivery.So_No);
            }).reduce(
                (sum, item) => sum + toNumber(item.Bill_Qty),
                0
            );

            const orderStatus = totalDeliveredQty >= totalOrderedQty ? "completed" : "pending";

            return {
                ...delivery,
                SalesOrderData: {
                    ...relatedOrder,
                    Products_List: orderProducts,
                    Staff_Involved_List: staffInvolved,
                    OrderStatus: orderStatus,
                    TotalOrderedQty: totalOrderedQty,
                    TotalDeliveredQty: totalDeliveredQty
                },
                DeliveryItems: deliveryItems,
                OrderStatus: orderStatus,
                uploadedFile: uploadedFileName ? {
                    name: uploadedFileName,
                    path: uploadedFilePath
                } : null
            };
        });

        dataFound(res, processedData);

    } catch (error) {
        console.error('Error in getSalesOrderInvoice:', error);
        
        // Clean up uploaded file if error occurred
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath);
        }
        
        servError(error, res);
    }
};


// const getSalesOrderInvoiceDetailsForPdf=async(req,res)=>{
//     try {
//         const { invoiceId } = req.params;
//         const { invoiceData, companyId, forceRegenerate } = req.body;
        
//         // Create uploads directory if it doesn't exist
//         const uploadDir = `uploads/${companyId}/invoices/`;
//         if (!fs.existsSync(uploadDir)) {
//             fs.mkdirSync(uploadDir, { recursive: true });
//         }
        
//         // Check if PDF already exists
//         const pdfFileName = `invoice_${invoiceId}_${Date.now()}.pdf`;
//         const pdfPath = path.join(uploadDir, pdfFileName);
        
//         // Create a new PDF document
//         const doc = new PDFDocument({ margin: 50 });
        
//         // Create write stream
//         const writeStream = fs.createWriteStream(pdfPath);
//         doc.pipe(writeStream);
        
//         // Add content to PDF
//         doc.fontSize(20).text('INVOICE', { align: 'center' });
//         doc.moveDown();
        
//         doc.fontSize(12).text(`Invoice Number: ${invoiceData.Do_Inv_No}`);
//         doc.text(`Date: ${new Date(invoiceData.Do_Date).toLocaleDateString()}`);
//         doc.text(`Customer: ${invoiceData.retailerNameGet || invoiceData.Retailer_Name}`);
//         doc.moveDown();
        
//         // Add invoice items table
//         if (invoiceData.stockDetails && invoiceData.stockDetails.length > 0) {
//             doc.fontSize(14).text('Items:', { underline: true });
//             doc.moveDown(0.5);
            
//             invoiceData.stockDetails.forEach((item, index) => {
//                 doc.text(`${index + 1}. ${item.Item_Name || 'Item'}: ${item.Bill_Qty || 0} x ₹${item.Item_Rate || 0} = ₹${(item.Bill_Qty || 0) * (item.Item_Rate || 0)}`);
//             });
//         }
        
//         doc.moveDown();
//         doc.fontSize(16).text(`Total: ₹${invoiceData.Total_Invoice_value || 0}`, { align: 'right' });
        
//         // Add footer
//         doc.moveDown(2);
//         doc.fontSize(10).text('Thank you for your business!', { align: 'center' });
        
//         // Finalize PDF
//         doc.end();
        
//         writeStream.on('finish', () => {
//             // Generate the URL for the PDF
//             const pdfUrl = `/uploads/${companyId}/invoices/${pdfFileName}`;
//             const fullUrl = `${req.protocol}://${req.get('host')}${pdfUrl}`;
            
//             // Get file stats
//             const stats = fs.statSync(pdfPath);
            
//             res.json({
//                 success: true,
//                 message: 'PDF generated successfully',
//                 data: {
//                     pdfUrl: fullUrl,
//                     fileName: pdfFileName,
//                     size: stats.size,
//                     path: pdfPath
//                 }
//             });
//         });
        
//         writeStream.on('error', (error) => {
//             console.error('PDF generation error:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to generate PDF'
//             });
//         });
        
//     } catch (error) {
//         console.error('PDF generation error:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to generate PDF'
//         });
//     }
// }



const getSalesOrderInvoiceDetailsForPdf = async (req, res) => {
    try {
         const invoiceId = req.params.invoiceId || req.body.invoiceId;
        const { companyId, invoiceData } = req.body;
    
        if (!invoiceId || !companyId || !invoiceData) {
            return invalidInput(res, 'Invoice ID, company ID, and invoice data are required');
        }
        
   
        const uploadDir = path.join(__dirname, '..', 'uploads', String(companyId), 'invoices');
        
        try {
            await fs.mkdir(uploadDir, { recursive: true });
        } catch (dirError) {
            console.error('Error creating directory:', dirError);
            return servError(dirError, res);
        }
        
    
        const sanitizedInvoiceId = invoiceId.replace(/[\/]/g, '_').replace(/[^a-zA-Z0-9-_]/g, '');
        const pdfFileName = `${sanitizedInvoiceId}.pdf`;
        const pdfPath = path.join(uploadDir, pdfFileName);
  
        const existingFiles = await fs.readdir(uploadDir);
        const existingPdf = existingFiles.find(file => 
            file === pdfFileName || file.includes(sanitizedInvoiceId)
        );
        
        if (existingPdf) {
            const existingPath = path.join(uploadDir, existingPdf);
            const stats = await fs.stat(existingPath);
            
            return dataFound(res, {
                pdfUrl: `${req.protocol}://${req.get('host')}/api/sales/downloadPdf/${encodeURIComponent(invoiceId)}`,
                fileName: existingPdf,
                size: stats.size,
                path: existingPath,
                existing: true,
                directUrl: `${req.protocol}://${req.get('host')}/api/sales/invoice/${encodeURIComponent(invoiceId)}.pdf`
            });
        }
        
       
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: `Invoice ${invoiceData.Do_Inv_No}`,
                Author: 'System',
                Subject: 'Invoice Document',
                Keywords: 'invoice, sales, order',
                CreationDate: new Date()
            }
        });
        
    
        const writeStream = fsSync.createWriteStream(pdfPath);
        doc.pipe(writeStream);
        
      
        doc.fontSize(24)
           .font('Helvetica-Bold')
           .text('SALES INVOICE', { align: 'center' });
        
        doc.moveDown();
        doc.lineCap('butt')
           .lineWidth(2)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke();
        
        doc.moveDown();
        
       
        doc.fontSize(10)
           .font('Helvetica')
           .text('SM TRADERS', { align: 'right' })
           .text('Address Line 1', { align: 'right' })
           .text('Address Line 2', { align: 'right' })
           .text('GSTIN:', { align: 'right' });
        
        doc.moveDown(2);
        

        const leftColumnX = 50;
        const rightColumnX = 300;
        let currentY = doc.y;
        

        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text('BILL TO:', leftColumnX, currentY);
        
        doc.font('Helvetica')
           .fontSize(10)
           .text(invoiceData.retailerNameGet || invoiceData.Retailer_Name || 'Customer', leftColumnX, currentY + 20)
            .text(invoiceData.Party_Mailing_Address || '-', leftColumnX, currentY + 35, { width: 230 })
           .text(`GSTIN: ${invoiceData.GST_No || '-'}`, leftColumnX, currentY + 50);
        
      
        doc.font('Helvetica-Bold')
           .text('INVOICE DETAILS:', rightColumnX, currentY);
        
        doc.font('Helvetica')
           .text(`Invoice No: ${invoiceData.Do_Inv_No}`, rightColumnX, currentY + 20)
           .text(`Date: ${new Date(invoiceData.Do_Date || new Date()).toLocaleDateString('en-GB')}`, rightColumnX, currentY + 35)
           .text(`Order No: ${invoiceData.So_No || invoiceData.Do_No || 'N/A'}`, rightColumnX, currentY + 50);
        
        currentY += 80;
        
       
        doc.moveTo(leftColumnX, currentY)
           .lineTo(550, currentY)
           .stroke();
        
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .text('S.No', leftColumnX, currentY + 10)
           .text('Product', leftColumnX + 40, currentY + 10)
           .text('HSN/SAC', leftColumnX + 250, currentY + 10)
           .text('Qty', leftColumnX + 320, currentY + 10)
           .text('Rate', leftColumnX + 370, currentY + 10)
           .text('Amount', leftColumnX + 430, currentY + 10);
        
        currentY += 30;
        

        let grandTotal = 0;
        let subtotal = 0;
        
        if (invoiceData.stockDetails && invoiceData.stockDetails.length > 0) {
            invoiceData.stockDetails.forEach((item, index) => {
                const itemName = item.Item_Name || item.Product_Name || 'Item';
                const qty = Number(item.Bill_Qty) || 0;
                const rate = Number(item.Item_Rate) || 0;
                const amount = qty * rate;
                subtotal += amount;
                
          
                const displayName = itemName.length > 30 ? 
                    itemName.substring(0, 27) + '...' : itemName;
                
                doc.font('Helvetica')
                   .fontSize(9)
                   .text(`${index + 1}`, leftColumnX, currentY)
                   .text(displayName, leftColumnX + 40, currentY)
                   .text(item.HSN_Code || '-', leftColumnX + 250, currentY)
                   .text(qty.toFixed(2), leftColumnX + 320, currentY)
                   .text(rate.toFixed(2), leftColumnX + 370, currentY)
                   .text(amount.toFixed(2), leftColumnX + 430, currentY);
                
                currentY += 20;
                
         
                if (currentY > 700) {
                    doc.addPage();
                    currentY = 50;
                }
            });
        }
        

        doc.moveTo(leftColumnX, currentY)
           .lineTo(550, currentY)
           .stroke();
        
        currentY += 20;
        

        const totalsX = 380;
        
        doc.fontSize(10)
           .font('Helvetica')
           .text('Subtotal:', totalsX, currentY)
           .text(subtotal.toFixed(2), totalsX + 100, currentY);
        
        currentY += 20;
        
        if (invoiceData.CSGT_Total > 0) {
            doc.text(`CGST (${invoiceData.CSGT_Percentage || 9}%):`, totalsX, currentY)
               .text((invoiceData.CSGT_Total || 0).toFixed(2), totalsX + 100, currentY);
            currentY += 20;
            grandTotal += invoiceData.CSGT_Total || 0;
        }
        
        if (invoiceData.SGST_Total > 0) {
            doc.text(`SGST (${invoiceData.SGST_Percentage || 9}%):`, totalsX, currentY)
               .text((invoiceData.SGST_Total || 0).toFixed(2), totalsX + 100, currentY);
            currentY += 20;
            grandTotal += invoiceData.SGST_Total || 0;
        }
        
        if (invoiceData.IGST_Total > 0) {
            doc.text(`IGST (${invoiceData.IGST_Percentage || 18}%):`, totalsX, currentY)
               .text((invoiceData.IGST_Total || 0).toFixed(2), totalsX + 100, currentY);
            currentY += 20;
            grandTotal += invoiceData.IGST_Total || 0;
        }
        
        if (invoiceData.Round_off) {
            doc.text('Round Off:', totalsX, currentY)
               .text((invoiceData.Round_off || 0).toFixed(2), totalsX + 100, currentY);
            currentY += 20;
            grandTotal += invoiceData.Round_off || 0;
        }
        
        grandTotal += subtotal;
        

        doc.moveTo(totalsX - 10, currentY)
           .lineTo(totalsX + 150, currentY)
           .stroke();
        
        currentY += 10;
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('GRAND TOTAL:', totalsX, currentY)
           .text(grandTotal.toFixed(2), totalsX + 100, currentY);
        
        currentY += 30;
        
     
        doc.fontSize(8)
           .font('Helvetica')
           .text('Thank you for your business!', { align: 'center' })
           .text('For any queries, contact: +91 9944888054 | email@example.com', { align: 'center' })
           .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        
        // Add page numbers 
           const pageCount = doc.bufferedPageRange().count;
        // for (let i = 0; i < pageCount; i++) {
        //     doc.switchToPage(i);
        //     doc.fontSize(8)
        //        .text(`Page ${i + 1} of ${pageCount}`, 50, 800, { align: 'center' });
        // }
        
      
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            doc.end();
        });
        

        const stats = await fs.stat(pdfPath);
        
    
return dataFound(res, {
   
    pdfUrl: `${req.protocol}://${req.get('host')}/api/sales/downloadPdf?Do_Inv_No=${encodeURIComponent(pdfFileName.replace('.pdf', ''))}`,
    fileName: pdfFileName,
    size: stats.size,
    generated: true
});
        
    } catch (error) {
        console.error('Error in getSalesOrderInvoiceDetailsForPdf:', error);
        return servError(error, res);
    }
};


const downloadGeneratedPdf = async (req, res) => {
    try {
        const { Do_Inv_No, download } = req.query;

        if (!Do_Inv_No) {
            return invalidInput(res, "Invoice number is required");
        }

        const shouldDownload = download === "true";
        const decodedInvoiceNo = Buffer.from(Do_Inv_No, "base64").toString("utf-8");
        const formattedInvoiceNo = decodedInvoiceNo.replace(/_/g, "/").trim();
        const companyId = process.env.COMPANY;

        const safeFileName = formattedInvoiceNo.replace(/\//g, "_");
        const pdfFileName = `${safeFileName}.pdf`;

        const uploadDir = path.join(__dirname, "..", "uploads", String(companyId), "invoices");
        const filePath = path.join(uploadDir, pdfFileName);

        if (!fsSync.existsSync(uploadDir)) {
            fsSync.mkdirSync(uploadDir, { recursive: true });
        }

        // Fetch delivery order details with all necessary joins
        const deliveryOrderRequest = await new sql.Request()
            .input("Do_Inv_No", sql.NVarChar, formattedInvoiceNo)
            .query(`
                SELECT 
                    sdgi.*,
                    rm.Retailer_Name,
                    rm.Reatailer_Address as Party_Mailing_Address,
                    rm.Reatailer_City,
                    rm.PinCode,
                    rm.Gstno as GST_No,
                    rm.Mobile_No as Retailer_Mobile,
                    cm.Company_Name,
                    cm.Company_Address,
                    cm.Pincode,
                    cm.Gst_Number,
                    cm.VAT_TIN_Number,
                    cm.Telephone_Number,
                    cm.Region,
                    cm.State as Company_State
                FROM tbl_Sales_Delivery_Gen_Info sdgi
                LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = sdgi.Retailer_Id
                CROSS JOIN tbl_Company_Master cm
                WHERE sdgi.Do_Inv_No = @Do_Inv_No 
            `);

        if (deliveryOrderRequest.recordset.length === 0) {
            return noData(res, `Invoice not found: ${formattedInvoiceNo}`);
        }

        const deliveryOrder = deliveryOrderRequest.recordset[0];

      
        const stockRequest = await new sql.Request()
            .input("Delivery_Order_Id", sql.Int, deliveryOrder.Do_Id)
            .query(`
                SELECT 
                    sdsi.*,
                    pm.Product_Name,
                    u.Units
                FROM tbl_Sales_Delivery_Stock_Info sdsi
                LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = sdsi.Item_Id
                LEFT JOIN tbl_UOM u ON u.Unit_Id = sdsi.Unit_Id
                WHERE sdsi.Delivery_Order_Id = @Delivery_Order_Id
            `);

        const stockDetails = stockRequest.recordset || [];

    
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            bufferPages: true
        });

        const possibleTamilFonts = [
            path.join(__dirname, '..', 'fonts', 'NotoSansTamil-Regular.ttf'),
            path.join(__dirname, '..', 'fonts', 'latha.ttf'),
            'C:/Windows/Fonts/latha.ttf',
            'C:/Windows/Fonts/Nirmala.ttf'
        ];

        let tamilFontRegistered = false;
        for (const fontPath of possibleTamilFonts) {
            try {
                if (fsSync.existsSync(fontPath)) {
                    doc.registerFont('Tamil', fontPath);
                    tamilFontRegistered = true;
                    break;
                }
            } catch (error) {
                console.error(`Failed to register font from ${fontPath}:`, error);
            }
        }

        if (!tamilFontRegistered) {
            doc.registerFont('Tamil', 'Helvetica');
        }

        
        if (!shouldDownload) {
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("Content-Disposition", `inline; filename="${pdfFileName}"`);
            doc.pipe(res);
        } else {
            const writeStream = fsSync.createWriteStream(filePath);
            doc.pipe(writeStream);
        }

    
        const NumberFormat = (num) => {
            if (num === undefined || num === null) return '0.00';
            return Number(num).toFixed(2);
        };

        const RoundNumber = (num) => {
            return Math.round(num * 100) / 100;
        };

        const Addition = (a, b) => {
            return (Number(a) || 0) + (Number(b) || 0);
        };

        const Subraction = (a, b) => {
            return (Number(a) || 0) - (Number(b) || 0);
        };

        const Multiplication = (a, b) => {
            return (Number(a) || 0) * (Number(b) || 0);
        };

        const isEqualNumber = (a, b) => {
            return Number(a) === Number(b);
        };

        const isGraterNumber = (a, b) => {
            return Number(a) > Number(b);
        };

        const LocalDate = (date) => {
            if (!date) return '';
            const d = new Date(date);
            return d.toLocaleDateString('en-GB');
        };

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
        };

        const isExclusiveBill = isEqualNumber(deliveryOrder.GST_Inclusive, 0);
        const isInclusive = isEqualNumber(deliveryOrder.GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(deliveryOrder.GST_Inclusive, 2);
        const IS_IGST = isEqualNumber(deliveryOrder.IS_IGST, 1);

        const includedProducts = stockDetails.filter(item => isGraterNumber(item?.Bill_Qty, 0));

        let totalValueBeforeTax = { TotalValue: 0, TotalTax: 0 };

        includedProducts.forEach(item => {
            const itemRate = RoundNumber(item?.Item_Rate);
            const billQty = parseInt(item?.Bill_Qty) || 0;

            if (isNotTaxableBill) {
                totalValueBeforeTax.TotalValue = Addition(totalValueBeforeTax.TotalValue, Multiplication(billQty, itemRate));
                return;
            }

            const gstPercentage = IS_IGST ? (item?.Igst || 0) : Addition(item?.Sgst || 0, item?.Cgst || 0);

            if (isInclusive) {
                const itemTax = taxCalc(1, itemRate, gstPercentage);
                const basePrice = Subraction(itemRate, itemTax);
                totalValueBeforeTax.TotalTax = Addition(totalValueBeforeTax.TotalTax, Multiplication(billQty, itemTax));
                totalValueBeforeTax.TotalValue = Addition(totalValueBeforeTax.TotalValue, Multiplication(billQty, basePrice));
            }
            if (isExclusiveBill) {
                const itemTax = taxCalc(0, itemRate, gstPercentage);
                totalValueBeforeTax.TotalTax = Addition(totalValueBeforeTax.TotalTax, Multiplication(billQty, itemTax));
                totalValueBeforeTax.TotalValue = Addition(totalValueBeforeTax.TotalValue, Multiplication(billQty, itemRate));
            }
        });

        const TaxData = includedProducts.reduce((data, item) => {
            const HSNindex = data.findIndex(obj => obj.hsnCode == item.HSN_Code);

            const {
                Taxable_Amount, Cgst_Amo, Sgst_Amo, Igst_Amo, HSN_Code,
                Cgst, Sgst, Igst,
            } = item;

            if (HSNindex !== -1) {
                const prev = data[HSNindex];
                const newValue = {
                    ...prev,
                    taxableValue: prev.taxableValue + Number(Taxable_Amount || 0),
                    cgst: Addition(prev.cgst, Cgst_Amo),
                    sgst: Addition(prev.sgst, Sgst_Amo),
                    igst: Addition(prev.igst, Igst_Amo),
                    totalTax: prev.totalTax + Number(IS_IGST ? (Igst_Amo || 0) : Addition(Cgst_Amo || 0, Sgst_Amo || 0)),
                };

                data[HSNindex] = newValue;
                return data;
            }

            const newEntry = {
                hsnCode: HSN_Code,
                taxableValue: Number(Taxable_Amount || 0),
                cgst: Number(Cgst_Amo || 0),
                cgstPercentage: Number(Cgst || 0),
                sgst: Number(Sgst_Amo || 0),
                sgstPercentage: Number(Sgst || 0),
                igst: Number(Igst_Amo || 0),
                igstPercentage: Number(Igst || 0),
                totalTax: IS_IGST ? Number(Igst_Amo || 0) : Addition(Cgst_Amo || 0, Sgst_Amo || 0),
            };

            return [...data, newEntry];
        }, []);

        const PAGE_HEIGHT = 842; 
        const PAGE_BOTTOM_MARGIN = 50;
        const FOOTER_SPACE = 80; 
        

        const checkPageBreak = (currentY, additionalSpace = 20) => {
            if (currentY + additionalSpace > PAGE_HEIGHT - PAGE_BOTTOM_MARGIN - FOOTER_SPACE) {
                doc.addPage();
                return 50; 
            }
            return currentY;
        };


        doc.fontSize(16)
           .font('Helvetica-Bold')
           .text('SALES INVOICE', { align: 'center' });

        doc.moveDown(1);

        const leftColumnX = 50;
        const rightColumnX = 250;
        let currentY = doc.y;

      
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .text(deliveryOrder.Company_Name || 'PUKAL FOODS PVT LTD', leftColumnX, currentY);

        doc.font('Helvetica')
           .fontSize(9)
           .text(`Address: ${deliveryOrder.Company_Address || '6A VISWANATHAPURAM MAIN ROAD'}`, leftColumnX, currentY + 15, { width: 250 });

        doc.font('Helvetica')
           .fontSize(9)
           .text(`City: ${deliveryOrder.Region || 'Madurai'} - ${deliveryOrder.Pincode || '625014'}`, leftColumnX, currentY + 25);

        let gstinText = 'GSTIN / UIN: ';
        if (deliveryOrder.Gst_Number || deliveryOrder.VAT_TIN_Number) {
            if (deliveryOrder.Gst_Number) gstinText += deliveryOrder.Gst_Number;
            if (deliveryOrder.Gst_Number && deliveryOrder.VAT_TIN_Number) gstinText += ' || ';
            if (deliveryOrder.VAT_TIN_Number) gstinText += deliveryOrder.VAT_TIN_Number;
        } else {
            gstinText += 'Not Available';
        }
        doc.font('Helvetica')
           .fontSize(9)
           .text(gstinText, leftColumnX, currentY + 45);

        doc.font('Helvetica')
           .fontSize(9)
           .text(`State: ${deliveryOrder.Company_State || 'Tamilnadu'}`, leftColumnX, currentY + 55);

        doc.font('Helvetica')
           .fontSize(9)
           .text('Code:', leftColumnX, currentY + 65);

   
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .text('Buyer (Bill to)', leftColumnX, currentY + 75);

        doc.font('Tamil')
           .fontSize(9)
           .text(deliveryOrder.Retailer_Name || '', leftColumnX, currentY + 95);

        doc.font('Helvetica')
           .fontSize(9)
           .text(`${deliveryOrder.Mobile_No || ''} - ${deliveryOrder.Party_Mailing_Address || ''}`, leftColumnX, currentY + 105, { width: 250 });

        doc.font('Helvetica')
           .fontSize(9)
           .text(`${deliveryOrder.Reatailer_City || ''} - ${deliveryOrder.PinCode || ''}`, leftColumnX, currentY + 115);

        doc.font('Helvetica')
           .fontSize(9)
           .text(`GSTIN / UIN: ${deliveryOrder.GST_No || ''}`, leftColumnX, currentY + 125);

        doc.font('Helvetica')
           .fontSize(9)
           .text(`State Name: ${deliveryOrder.StateGet || 'Tamilnadu'}`, leftColumnX, currentY + 135);

        doc.font('Helvetica')
           .fontSize(9)
           .text('Code:', leftColumnX, currentY + 145);

       
        const extraDetails = [
            { labelOne: 'Invoice No', dataOne: deliveryOrder.Do_Inv_No, labelTwo: 'Dated', dataTwo: LocalDate(deliveryOrder.Do_Date) },
            { labelOne: 'Delivery Note', dataOne: '', labelTwo: 'Mode/Terms of Payment', dataTwo: '' },
            { labelOne: 'Reference No. & Date', dataOne: '', labelTwo: 'Other References', dataTwo: '' },
            { labelOne: 'Buyer\'s Order No', dataOne: '', labelTwo: 'Dated', dataTwo: '' },
            { labelOne: 'Dispatch Doc No', dataOne: '', labelTwo: 'Delivery Note Date', dataTwo: '' },
            { labelOne: 'Dispatched through', dataOne: '', labelTwo: 'Destination', dataTwo: '' },
            { labelOne: 'Bill of Lading/LR-RR No', dataOne: '', labelTwo: 'Motor Vehicle No', dataTwo: '' },
        ];

        let rightY = currentY + 15;
        extraDetails.forEach(detail => {
            doc.font('Helvetica')
               .fontSize(8)
               .text(detail.labelOne, rightColumnX, rightY)
               .text(`: ${detail.dataOne}`, rightColumnX + 80, rightY);
            
            doc.font('Helvetica')
               .fontSize(8)
               .text(detail.labelTwo, rightColumnX + 160, rightY)
               .text(`: ${detail.dataTwo}`, rightColumnX + 250, rightY);
            
            rightY += 15;
        });

        doc.font('Helvetica')
           .fontSize(8)
           .text('Terms of Delivery', rightColumnX, rightY);

        currentY = rightY + 50;
        
      
        currentY = checkPageBreak(currentY, 50);


        doc.moveTo(leftColumnX, currentY)
           .lineTo(550, currentY)
           .stroke();

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .text('Sno', leftColumnX, currentY + 10)
           .text('Product', leftColumnX + 35, currentY + 10)
           .text('HSN/SAC', leftColumnX + 180, currentY + 10)
           .text('Quantity', leftColumnX + 250, currentY + 10)
           .text('Rate', leftColumnX + 300, currentY + 10)
           .text('Rate', leftColumnX + 340, currentY + 10)
           .text('Amount', leftColumnX + 420, currentY + 10);

   
        let rateDesc = '';
        if (isInclusive) rateDesc = '(Incl. of Tax)';
        else if (isNotTaxableBill) rateDesc = '(Tax not applicable)';
        else if (isExclusiveBill) rateDesc = '(Excl. of Tax)';

        doc.fontSize(7)
           .font('Helvetica')
           .text(rateDesc, leftColumnX + 335, currentY + 20);

        currentY += 35;


        if (includedProducts && includedProducts.length > 0) {
            for (let index = 0; index < includedProducts.length; index++) {
                const item = includedProducts[index];
                
         
                currentY = checkPageBreak(currentY, 25);
                
                const qty = Number(item.Bill_Qty) || 0;
                const itemRate = Number(item.Item_Rate) || 0;
                const taxableAmount = Number(item.Taxable_Amount) || 0;
                const productName = item.Product_Name || '-';
                const unit = item.Units || 'Pcs';
                
        
                const gstPercentage = IS_IGST ? (item?.Igst || 0) : Addition(item?.Sgst || 0, item?.Cgst || 0);
                
 
                let rateWithoutTax = itemRate;
                let rateWithTax = itemRate;
                
                if (isInclusive) {
                    const itemTax = taxCalc(1, itemRate, gstPercentage);
                    rateWithoutTax = Subraction(itemRate, itemTax);
                    rateWithTax = itemRate;
                } else if (isExclusiveBill) {
                    const itemTax = taxCalc(0, itemRate, gstPercentage);
                    rateWithoutTax = itemRate;
                    rateWithTax = Addition(itemRate, itemTax);
                }
            
                doc.font('Helvetica')
                   .fontSize(8)
                   .text(`${index + 1}`, leftColumnX, currentY);
                
                doc.font('Tamil')
                   .text(productName, leftColumnX + 35, currentY, { width: 140 });
                
                doc.font('Helvetica')
                   .text(item.HSN_Code || '-', leftColumnX + 180, currentY)  
                   .text(`${NumberFormat(qty)}${unit ? ' (' + unit + ')' : ''}`, leftColumnX + 250, currentY)
                   .text(NumberFormat(rateWithoutTax), leftColumnX + 305, currentY)
                   .text(NumberFormat(rateWithTax), leftColumnX + 345, currentY)
                   .text(NumberFormat(taxableAmount), leftColumnX + 425, currentY);
                
                currentY += 20;
            }
        }

        doc.moveTo(leftColumnX, currentY)
           .lineTo(550, currentY)
           .stroke();

        currentY += 20;

    
        currentY = checkPageBreak(currentY, 200);


        doc.fontSize(9)
           .font('Helvetica')
           .text('Amount Chargeable (in words):', leftColumnX, currentY)
           .text(`INR ${numberToWords(parseInt(deliveryOrder?.Total_Invoice_value || 0))} Only.`, leftColumnX + 150, currentY);

        currentY += 25;

       
        const totalsX = 380;
        const totalsValueX = 480;

        doc.fontSize(9)
           .font('Helvetica');


        doc.text('Total Taxable Amount', totalsX - 150, currentY)
           .text(NumberFormat(totalValueBeforeTax.TotalValue), totalsValueX, currentY, { align: 'right' });

        currentY += 18;


        if (!IS_IGST) {
            doc.text('CGST', totalsX - 150, currentY)
               .text(NumberFormat(deliveryOrder?.CSGT_Total || 0), totalsValueX, currentY, { align: 'right' });
            currentY += 18;

            doc.text('SGST', totalsX - 150, currentY)
               .text(NumberFormat(deliveryOrder?.SGST_Total || 0), totalsValueX, currentY, { align: 'right' });
            currentY += 18;
        } else {
            doc.text('IGST', totalsX - 150, currentY)
               .text(NumberFormat(deliveryOrder?.IGST_Total || 0), totalsValueX, currentY, { align: 'right' });
            currentY += 18;
        }


        doc.text('Round Off', totalsX - 150, currentY)
           .text(NumberFormat(deliveryOrder?.Round_off || 0), totalsValueX, currentY, { align: 'right' });

        currentY += 18;

   
        doc.font('Helvetica-Bold')
           .text('Total', totalsX - 150, currentY)
           .text(NumberFormat(deliveryOrder?.Total_Invoice_value || 0), totalsValueX, currentY, { align: 'right' });

        currentY += 30;

   
        doc.fontSize(9)
           .font('Helvetica-Bold');

    
        doc.text('HSN / SAC', leftColumnX, currentY)
           .text('Taxable Value', leftColumnX + 100, currentY);

        if (IS_IGST) {
            doc.text('IGST Tax', leftColumnX + 200, currentY)
               .text('Total', leftColumnX + 350, currentY);
        } else {
            doc.text('Central Tax', leftColumnX + 200, currentY)
               .text('State Tax', leftColumnX + 300, currentY)
               .text('Total', leftColumnX + 400, currentY);
        }

        currentY += 15;

 
        if (IS_IGST) {
            doc.text('Rate', leftColumnX + 180, currentY)
               .text('Amount', leftColumnX + 230, currentY)
               .text('Tax Amount', leftColumnX + 330, currentY);
        } else {
            doc.text('Rate', leftColumnX + 180, currentY)
               .text('Amount', leftColumnX + 220, currentY)
               .text('Rate', leftColumnX + 270, currentY)
               .text('Amount', leftColumnX + 310, currentY)
               .text('Tax Amount', leftColumnX + 370, currentY);
        }

        currentY += 10;
        doc.moveTo(leftColumnX, currentY)
           .lineTo(550, currentY)
           .stroke();
        currentY += 5;

   
        doc.font('Helvetica')
           .fontSize(8);

        TaxData.forEach((item) => {
       
            currentY = checkPageBreak(currentY, 20);
            
            doc.text(item.hsnCode || 'N/A', leftColumnX, currentY)
               .text(NumberFormat(item.taxableValue), leftColumnX + 100, currentY);

            if (IS_IGST) {
                doc.text(NumberFormat(item.igstPercentage), leftColumnX + 180, currentY)
                   .text(NumberFormat(item.igst), leftColumnX + 230, currentY)
                   .text(NumberFormat(item.totalTax), leftColumnX + 330, currentY);
            } else {
                doc.text(NumberFormat(item.cgstPercentage), leftColumnX + 180, currentY)
                   .text(NumberFormat(item.cgst), leftColumnX + 220, currentY)
                   .text(NumberFormat(item.sgstPercentage), leftColumnX + 270, currentY)
                   .text(NumberFormat(item.sgst), leftColumnX + 310, currentY)
                   .text(NumberFormat(item.totalTax), leftColumnX + 370, currentY);
            }
            
            currentY += 15;
        });

        currentY = checkPageBreak(currentY, 20);
        
        doc.font('Helvetica-Bold');

        const hsnTotalTaxable = TaxData.reduce((sum, item) => sum + (item.taxableValue || 0), 0);
        const hsnTotalCgst = TaxData.reduce((sum, item) => sum + (item.cgst || 0), 0);
        const hsnTotalSgst = TaxData.reduce((sum, item) => sum + (item.sgst || 0), 0);
        const hsnTotalIgst = TaxData.reduce((sum, item) => sum + (item.igst || 0), 0);
        const hsnTotalTax = TaxData.reduce((sum, item) => sum + (item.totalTax || 0), 0);

        doc.text('Total', leftColumnX, currentY)
           .text(NumberFormat(hsnTotalTaxable), leftColumnX + 100, currentY);

        if (IS_IGST) {
            doc.text('', leftColumnX + 180, currentY)
               .text(NumberFormat(hsnTotalIgst), leftColumnX + 230, currentY)
               .text(NumberFormat(hsnTotalTax), leftColumnX + 330, currentY);
        } else {
            doc.text('', leftColumnX + 180, currentY)
               .text(NumberFormat(hsnTotalCgst), leftColumnX + 220, currentY)
               .text('', leftColumnX + 270, currentY)
               .text(NumberFormat(hsnTotalSgst), leftColumnX + 310, currentY)
               .text(NumberFormat(hsnTotalTax), leftColumnX + 370, currentY);
        }

        currentY += 20;

        currentY = checkPageBreak(currentY, 30);
        
        doc.font('Helvetica')
           .fontSize(9)
           .font('Helvetica-Bold')
           .text(`Tax Amount (in words) : INR ${numberToWords(parseInt(hsnTotalTax))} only.`, leftColumnX, currentY);

        currentY += 30;

     
        doc.fontSize(8)
           .text('This is a Computer Generated Invoice', { align: 'center' });

        if (!shouldDownload) {
   
            if (currentY + 80 > PAGE_HEIGHT - PAGE_BOTTOM_MARGIN) {
                doc.addPage();
                currentY = 50;
            }
            
            const buttonY = Math.min(currentY + 20, PAGE_HEIGHT - PAGE_BOTTOM_MARGIN - 40);
            const buttonX = 200;
            const buttonWidth = 200;
            const buttonHeight = 30;

            doc.save();
            doc.roundedRect(buttonX, buttonY, buttonWidth, buttonHeight, 5)
               .fillAndStroke('#007bff', '#0056b3');
            doc.restore();

            doc.fillColor('#ffffff')
               .fontSize(11)
               .font('Helvetica-Bold')
               .text('⬇ DOWNLOAD INVOICE', buttonX + 20, buttonY + 9, {
                   width: buttonWidth - 20,
                   align: 'center'
               });

            doc.fillColor('#000000');
            
            const downloadUrl = `${req.protocol}://${req.get('host')}/api/sales/downloadPdf?Do_Inv_No=${Do_Inv_No}&download=true`;
            doc.link(buttonX, buttonY, buttonWidth, buttonHeight, downloadUrl);

            doc.fontSize(7)
               .font('Helvetica')
               .fillColor('#666666')
               .text('Click the button above to download this invoice', 50, buttonY + 38, {
                   width: 500,
                   align: 'center'
               });

            doc.fillColor('#000000');
        }

        doc.end();

        if (shouldDownload) {
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });

            if (fsSync.existsSync(filePath)) {
                const stats = fsSync.statSync(filePath);
                
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
                res.setHeader('Content-Length', stats.size);
                
                const readStream = fsSync.createReadStream(filePath);
                readStream.pipe(res);
            } else {
                return servError(new Error('File not found'), res);
            }
        }

    } catch (error) {
        console.error('PDF Generation Error:', error);
        if (!res.headersSent) {
            return servError(error, res);
        }
    }
};


function numberToWords(num) {
    if (num === 0) return 'Zero';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                  'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const numToWords = (n) => {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
        if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
        if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
        return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
    };
    
    return numToWords(num);
}

    return {
        getSalesInvoiceMobileFilter1,
        getSalesInvoiceMobileFilter2,
        salesInvoiceReport,
        createSalesTransaction,
        getSaleOrderWithDeliveries,
        getMobileReportDropdowns,
        getSalesOrderInvoice,
        getSalesOrderInvoiceDetailsForPdf,
        downloadGeneratedPdf
    }
}

export default SalesInvoice();