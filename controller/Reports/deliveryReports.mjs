import sql from "mssql";
import { sentData, servError, noData, invalidInput, success, dataFound } from "../../res.mjs";
import { checkIsNumber, ISOString, toArray, isEqualNumber, toNumber } from "../../helper_functions.mjs";

const getNonConvertedSales = async (req, res) => {
    try {
        const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType, Branch_Id } = req.query;

        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('retailer', Retailer_Id)
            .input('cancel', Cancel_status)
            .input('creater', Created_by)
            .input('salesPerson', Sales_Person_Id)
            .input('VoucherType', VoucherType)
            .input('Branch_Id', Branch_Id);

        const result = await request.query(`
          
            DECLARE @FilteredOrders TABLE (So_Id INT);
            INSERT INTO @FilteredOrders (So_Id)
            SELECT so.So_Id
            FROM tbl_Sales_Order_Gen_Info AS so
            WHERE 
                CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer ' : ''}
                ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel ' : ''}
                ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater ' : ''}
                ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson ' : ''}
                ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''}
                ${checkIsNumber(Branch_Id) ? ' AND so.Branch_Id = @Branch_Id ' : ''};
      
            
            SELECT 
                so.*, 
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            
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
            WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders);

           
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            
            SELECT 
                dgi.*,
                rm.Retailer_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);

           
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
            WHERE oi.Delivery_Order_Id IN (
                SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
                WHERE So_No IN (SELECT So_Id FROM @FilteredOrders)
            );`
        );

        const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = result.recordsets.map(toArray);

        if (OrderData.length > 0) {
            const pendingOrders = OrderData.filter(order => {
                const orderProducts = ProductDetails.filter(p =>
                    isEqualNumber(p.Sales_Order_Id, order.So_Id)
                );
                const deliveryList = DeliveryData.filter(d =>
                    isEqualNumber(d.So_No, order.So_Id)
                );

                const totalOrderedQty = orderProducts.reduce(
                    (sum, p) => sum + toNumber(p.Bill_Qty),
                    0
                );
                const totalDeliveredQty = deliveryList.reduce((sum, d) => {
                    const deliveredItems = DeliveryItems.filter(p =>
                        isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                    );
                    return sum + deliveredItems.reduce((s, p) => s + toNumber(p.Bill_Qty), 0);
                }, 0);

                return totalDeliveredQty < totalOrderedQty;
            });

            if (pendingOrders.length > 0) {
                const resData = pendingOrders.map(order => {
                    const orderProducts = ProductDetails.filter(p =>
                        isEqualNumber(p.Sales_Order_Id, order.So_Id)
                    );
                    const deliveryList = DeliveryData.filter(d =>
                        isEqualNumber(d.So_No, order.So_Id)
                    );

                    const totalOrderedQty = orderProducts.reduce(
                        (sum, p) => sum + toNumber(p.Bill_Qty),
                        0
                    );
                    const totalDeliveredQty = deliveryList.reduce((sum, d) => {
                        const deliveredItems = DeliveryItems.filter(p =>
                            isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                        );
                        return sum + deliveredItems.reduce((s, p) => s + toNumber(p.Bill_Qty), 0);
                    }, 0);

                    const pendingQty = totalOrderedQty - totalDeliveredQty;
                    const deliveryPercentage = totalOrderedQty > 0 ? (totalDeliveredQty / totalOrderedQty) * 100 : 0;

                    const mappedDeliveries = deliveryList.map(d => {
                        const invoiceProducts = DeliveryItems.filter(p =>
                            isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                        ).map(prod => ({
                            ...prod

                        }));

                        return {
                            ...d,
                            InvoicedProducts: invoiceProducts,
                        };
                    });

                    return {
                        ...order,
                        OrderStatus: "pending",
                        TotalOrderedQty: totalOrderedQty,
                        TotalDeliveredQty: totalDeliveredQty,
                        PendingQty: pendingQty,
                        DeliveryPercentage: Math.round(deliveryPercentage),
                        Products_List: orderProducts.map(p => ({
                            ...p
                        })),
                        Staff_Involved_List: StaffInvolved.filter(s =>
                            isEqualNumber(s.So_Id, order.So_Id)
                        ),
                        ConvertedInvoice: mappedDeliveries,
                    };
                });

                dataFound(res, resData);
            } else {
                noData(res, "No pending orders found");
            }
        } else {
            noData(res);
        }

    } catch (e) {
        servError(e, res);
    }
};


const getNonConvertedSalesMobile = async (req, res) => {
    try {
        const { 
            Retailer_Id, 
            Cancel_status = 0, 
            Created_by, 
            VoucherType, 
            Branch_Id, 
            User_Id,
            Sales_Person_Id,  
            filter1, 
            filter2,
            filter3,
            filter4
        } = req.query;

      
        const Fromdate = req.query.Fromdate ? new Date(req.query.Fromdate).toISOString() : new Date().toISOString();
        const Todate = req.query.Todate ? new Date(req.query.Todate).toISOString() : new Date().toISOString();

        const parseFilterValues = (filterParam) => {
            if (!filterParam) return null;
            return filterParam.split(',').map(val => val.trim()).filter(val => val);
        };

        const filter1Values = parseFilterValues(filter1);
        const filter2Values = parseFilterValues(filter2);
        // const filter3Values = parseFilterValues(filter3);
        // const filter4Values = parseFilterValues(filter4);

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
            LEFT JOIN tbl_Table_Master tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = 'SalesReturn' AND FilterLevel = 1
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name, mrd.FilterLevel
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
                    joinCondition: `AND ${tableName}.Ret_Id = so.Retailer_Id`,  // Fixed: Changed sdgi to so
                    fromClause: tableName,
                    additionalJoins: ''
                },
                'tbl_Stock_LOS': {
                    joinCondition: hasRetId ? `AND los.Ret_Id = so.Retailer_Id` : '',  // Fixed: Changed sdgi to so
                    fromClause: `${tableName} los INNER JOIN tbl_Sales_Order_Stock_Info sosi ON sosi.Item_Id = los.Pro_Id`,  // Fixed: Changed to Sales Order
                    whereClause: `WHERE sosi.Sales_Order_Id = so.So_Id`
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
            
            const retIdCondition = hasRetId ? `AND ${tableName}.Ret_Id = so.Retailer_Id` : '';
            
            return `EXISTS (
                SELECT 1 FROM ${tableName} 
                WHERE ${tableName}.${columnName} ${isSingleValue ? '=' : 'IN'} (${placeholders})
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
                    branchCondition = ` AND so.Branch_Id IN (${finalBranches.join(',')}) `;
                } else {
                    return res.json({ data: [], message: "No data", success: true, others: {} });
                }
            } else if (allowedBranches.length) {
                branchCondition = ` AND so.Branch_Id IN (${allowedBranches.join(',')}) `;
            }
        }

        let mobileFilterConditions = [];
        const request = new sql.Request()
            .input('Fromdate', sql.DateTime, Fromdate)
            .input('Todate', sql.DateTime, Todate);

        // Helper function for number checking
        const checkIsNumber = (value) => {
            return value && !isNaN(value) && value !== '';
        };

        if (checkIsNumber(Retailer_Id)) request.input('retailer', Retailer_Id);
        if (checkIsNumber(Cancel_status)) request.input('cancel', Cancel_status);
        if (checkIsNumber(Created_by)) request.input('creater', Created_by);
        if (checkIsNumber(VoucherType)) request.input('VoucherType', VoucherType);
        if (checkIsNumber(Sales_Person_Id)) request.input('salesPerson', Sales_Person_Id);

        const filterConditions = [
            { values: filter1Values, paramName: 'filter1', index: 0 },
            { values: filter2Values, paramName: 'filter2', index: 1 },
            // { values: filter3Values, paramName: 'filter3', index: 2 },
            // { values: filter4Values, paramName: 'filter4', index: 3 }
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

        // Fixed SQL Query - Proper temp table usage and correct joins
        const sqlQuery = `
            DECLARE @FilteredOrders TABLE (So_Id INT);
            
            INSERT INTO @FilteredOrders (So_Id)
            SELECT so.So_Id
            FROM tbl_Sales_Order_Gen_Info AS so
            WHERE 
                CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer' : ''}
                ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel' : ''}
                ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater' : ''}
                ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson' : ''}
                ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType' : ''}
                ${branchCondition}
                ${mobileFilterCondition};

            -- Main order data
            SELECT 
                so.*, 
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Product details
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
            WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Staff involved (Fixed: Changed index from 3 to 2)
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Delivery data (Fixed: Added @FilteredInvoice declaration)
            DECLARE @FilteredInvoice TABLE (Do_Id INT);
            
            INSERT INTO @FilteredInvoice (Do_Id)
            SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
            WHERE So_No IN (SELECT So_Id FROM @FilteredOrders);

            SELECT 
                dgi.*,
                rm.Retailer_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);

            -- Delivery items
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
            WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice);

            -- Stock LOS data
            SELECT  
                llos.*
            FROM tbl_Stock_LOS llos
            WHERE llos.Pro_Id IN (
                SELECT DISTINCT sdsi.Item_Id
                FROM tbl_Sales_Delivery_Stock_Info sdsi
                WHERE sdsi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)  
            )
            ORDER BY llos.Pro_Id;
            
            -- Ledger LOL data
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
 
        // Helper functions (assuming they exist)
        const toArray = (recordset) => recordset || [];
        const isEqualNumber = (a, b) => parseInt(a) === parseInt(b);
        
        const SalesGeneralInfo = toArray(result.recordsets[0]);
        const Products_List = toArray(result.recordsets[1]);
        const Staffs_Array = toArray(result.recordsets[2]);  // Fixed: Changed from 3 to 2
        const DeliveryInfo = toArray(result.recordsets[3]);  // Delivery data
        const DeliveryItems = toArray(result.recordsets[4]); // Delivery items
        const StockInfo = toArray(result.recordsets[5]);  
        const LedgerInfo = toArray(result.recordsets[6]);  

        if (SalesGeneralInfo.length > 0) {
            const ledgerMap = {};
            const stockMap = {}; 
            
            // Map ledger info by retailer ID
            LedgerInfo.forEach(ledger => {
                if (!ledgerMap[ledger.Ret_Id]) {
                    ledgerMap[ledger.Ret_Id] = ledger;
                }
            });
            
            // Map stock info by product ID
            StockInfo.forEach(stock => {
                if (!stockMap[stock.Pro_Id]) { 
                    stockMap[stock.Pro_Id] = stock;
                }
            });
            
            const resData = SalesGeneralInfo.map(order => {
                const ledgerInfo = ledgerMap[order.Retailer_Id] || {};
                
                // Find products for this order
                const productsWithStock = Products_List
                    .filter(product => isEqualNumber(product.Sales_Order_Id, order.So_Id))
                    .map(product => {
                        const productStock = stockMap[product.Item_Id] || {};
                        return {
                            ...product,
                            ...productStock  
                        };
                    });
                
                // Find delivery info for this order
                const orderDelivery = DeliveryInfo.find(delivery => 
                    isEqualNumber(delivery.So_No, order.So_Id)
                );
                
                return {
                    ...order,
                    ...ledgerInfo,
                    Products_List: productsWithStock,
                    Delivery_Info: orderDelivery || {},
                    Delivery_Items: DeliveryItems.filter(item => 
                        orderDelivery && isEqualNumber(item.Delivery_Order_Id, orderDelivery.Do_Id)
                    ),
                    Staffs_Array: Staffs_Array.filter(staff => 
                        isEqualNumber(staff.So_Id, order.So_Id)
                    )
                };
            });

            // Assuming dataFound function exists
            dataFound(res, resData);
        } else {
            // Assuming noData function exists
            noData(res);
        }

    } catch (e) {
        console.error('API Error:', e);
        // Assuming servError function exists
        servError(e, res);
    }
};

const getNonConvertedSalesMobileItemwise = async (req, res) => {
    try {
        const { 
            Retailer_Id, 
            Cancel_status = 0, 
            Created_by, 
            VoucherType, 
            Branch_Id, 
            User_Id,
            Sales_Person_Id,  
            filter1 = '', 
            filter2 = '',
            filter3 = '',
            filter4 = ''
        } = req.query;

        const filter1Array = filter1 ? (Array.isArray(filter1) ? filter1 : filter1.split(',').filter(Boolean)) : [];
        const filter2Array = filter2 ? (Array.isArray(filter2) ? filter2 : filter2.split(',').filter(Boolean)) : [];
        const filter3Array = filter3 ? (Array.isArray(filter3) ? filter3 : filter3.split(',').filter(Boolean)) : [];
        const filter4Array = filter4 ? (Array.isArray(filter4) ? filter4 : filter4.split(',').filter(Boolean)) : [];

     
        const Fromdate = req.query.Fromdate 
            ? new Date(req.query.Fromdate).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0];
        
        const Todate = req.query.Todate 
            ? new Date(req.query.Todate).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0];

     
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
            LEFT JOIN tbl_Table_Master tm ON tm.Table_Id = mrd.Table_Id
            WHERE mrt.Report_Name = 'SalesReturn_Item' AND FilterLevel = 1
            GROUP BY mrd.Type, mrd.Table_Id, mrd.Column_Name, mrd.Mob_Rpt_Id, tm.Table_Name, mrd.FilterLevel
            ORDER BY mrd.Type
        `);

    
        const request = new sql.Request();
        
      
        request.input('Fromdate', sql.Date, Fromdate);
        request.input('Todate', sql.Date, Todate);
        
   
        if (Retailer_Id && checkIsNumber(Retailer_Id)) {
            request.input('retailer', sql.Int, Retailer_Id);
        }
        
        if (Cancel_status && checkIsNumber(Cancel_status)) {
            request.input('cancel', sql.Int, Cancel_status);
        }
        
        if (Created_by && checkIsNumber(Created_by)) {
            request.input('creater', sql.Int, Created_by);
        }
        
        if (Sales_Person_Id && checkIsNumber(Sales_Person_Id)) {
            request.input('salesPerson', sql.Int, Sales_Person_Id);
        }
        
        if (VoucherType && checkIsNumber(VoucherType)) {
            request.input('VoucherType', sql.Int, VoucherType);
        }
        
      
        let productFilterConditions = [];
        let stockFilterConditions = [];
        
      
        if (filter1Array.length > 0 && mobileFilters.recordset.length >= 1) {
            const filterInfo = mobileFilters.recordset[0];
            const columnName = filterInfo.ColumnName;
            const tableName = filterInfo.TableName || 'llos'; 
            
             
       
            const placeholders = filter1Array.map((_, i) => `@filter1_${i}`).join(',');
            
            if (tableName.includes('Product') || tableName.includes('pm')) {
                
                productFilterConditions.push(`pm.${columnName} IN (${placeholders})`);
            } else if (tableName.includes('Stock') || tableName.includes('llos')) {
         
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            } else {
               
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            }
            
      
            filter1Array.forEach((value, index) => {
                request.input(`filter1_${index}`, sql.NVarChar, value.trim());
            });
        }
        
     
        if (filter2Array.length > 0 && mobileFilters.recordset.length >= 2) {
            const filterInfo = mobileFilters.recordset[1];
            const columnName = filterInfo.ColumnName;
            const tableName = filterInfo.TableName || 'llos';
            
           
            const placeholders = filter2Array.map((_, i) => `@filter2_${i}`).join(',');
            
            if (tableName.includes('Product') || tableName.includes('pm')) {
                productFilterConditions.push(`pm.${columnName} IN (${placeholders})`);
            } else if (tableName.includes('Stock') || tableName.includes('llos')) {
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            } else {
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            }
            
            filter2Array.forEach((value, index) => {
                request.input(`filter2_${index}`, sql.NVarChar, value.trim());
            });
        }
        
      
        if (filter3Array.length > 0 && mobileFilters.recordset.length >= 3) {
            const filterInfo = mobileFilters.recordset[2];
            const columnName = filterInfo.ColumnName;
            const tableName = filterInfo.TableName || 'llos';
            
            
            const placeholders = filter3Array.map((_, i) => `@filter3_${i}`).join(',');
            
            if (tableName.includes('Product') || tableName.includes('pm')) {
                productFilterConditions.push(`pm.${columnName} IN (${placeholders})`);
            } else if (tableName.includes('Stock') || tableName.includes('llos')) {
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            } else {
                stockFilterConditions.push(`llos.${columnName} IN (${placeholders})`);
            }
            
            filter3Array.forEach((value, index) => {
                request.input(`filter3_${index}`, sql.NVarChar, value.trim());
            });
        }
        
      
        const productFilterCondition = productFilterConditions.length > 0 
            ? ` AND ${productFilterConditions.join(' AND ')}`
            : '';
            
        const stockFilterCondition = stockFilterConditions.length > 0 
            ? ` AND ${stockFilterConditions.join(' AND ')}`
            : '';
        
      
        let branchCondition = '';
        if (Branch_Id && checkIsNumber(Branch_Id)) {
            branchCondition = ' AND so.Branch_Id = @branch';
            request.input('branch', sql.Int, Branch_Id);
        }

        
        const retailerCondition = Retailer_Id && checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer' : '';
        const cancelCondition = Cancel_status && checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel' : '';
        const createdByCondition = Created_by && checkIsNumber(Created_by) ? ' AND so.Created_by = @creater' : '';
        const salesPersonCondition = Sales_Person_Id && checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson' : '';
        const voucherTypeCondition = VoucherType && checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType' : '';

    
        const sqlQuery = `
            -- Step 1: Filter products based on brand/other criteria
            DECLARE @FilteredProducts TABLE (Product_Id INT);
            
            INSERT INTO @FilteredProducts (Product_Id)
            SELECT DISTINCT pm.Product_Id
            FROM tbl_Product_Master pm
            LEFT JOIN tbl_Stock_LOS llos ON llos.Pro_Id = pm.Product_Id
            WHERE 1=1 
            ${productFilterCondition}
            ${stockFilterCondition};
            
            -- Step 2: Get sales orders that contain these filtered products
            DECLARE @FilteredOrders TABLE (So_Id INT);
            
            INSERT INTO @FilteredOrders (So_Id)
            SELECT DISTINCT so.So_Id
            FROM tbl_Sales_Order_Gen_Info AS so
            INNER JOIN tbl_Sales_Order_Stock_Info AS si ON si.Sales_Order_Id = so.So_Id
            WHERE 
                CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                ${retailerCondition}
                ${cancelCondition}
                ${createdByCondition}
                ${salesPersonCondition}
                ${voucherTypeCondition}
                ${branchCondition}
                AND si.Item_Id IN (SELECT Product_Id FROM @FilteredProducts);

            -- Main order data
            SELECT 
                so.*, 
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Product details (only filtered products)
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
            WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders)
            AND si.Item_Id IN (SELECT Product_Id FROM @FilteredProducts);

            -- Staff involved
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            -- Delivery data
            DECLARE @FilteredInvoice TABLE (Do_Id INT);
            
            INSERT INTO @FilteredInvoice (Do_Id)
            SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
            WHERE So_No IN (SELECT So_Id FROM @FilteredOrders);

            SELECT 
                dgi.*,
                rm.Retailer_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);

            -- Delivery items (only filtered products)
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
            WHERE oi.Delivery_Order_Id IN (SELECT Do_Id FROM @FilteredInvoice)
            AND oi.Item_Id IN (SELECT Product_Id FROM @FilteredProducts);

            -- Stock LOS data (only for filtered products)
            SELECT  
                llos.*
            FROM tbl_Stock_LOS llos
            WHERE llos.Pro_Id IN (SELECT Product_Id FROM @FilteredProducts)
            ORDER BY llos.Pro_Id;
            
            -- Ledger LOL data
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
 
        
        const toArray = (recordset) => recordset || [];
        const isEqualNumber = (a, b) => {
            if (a == null || b == null) return false;
            return parseInt(a) === parseInt(b);
        };
        
        const SalesGeneralInfo = toArray(result.recordsets[0]);
        const Products_List = toArray(result.recordsets[1]);
        const Staffs_Array = toArray(result.recordsets[2]);
        const DeliveryInfo = toArray(result.recordsets[3]);
        const DeliveryItems = toArray(result.recordsets[4]);
        const StockInfo = toArray(result.recordsets[5]);  
        const LedgerInfo = toArray(result.recordsets[6]);  

     
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
            
            const resData = SalesGeneralInfo.map(order => {
                const ledgerInfo = ledgerMap[order.Retailer_Id] || {};
                
           
                const productsWithStock = Products_List
                    .filter(product => isEqualNumber(product.Sales_Order_Id, order.So_Id))
                    .map(product => {
                        const productStock = stockMap[product.Item_Id] || {};
                        return {
                            ...product,
                            ...productStock  
                        };
                    });
                
              
                const orderDelivery = DeliveryInfo.find(delivery => 
                    isEqualNumber(delivery.So_No, order.So_Id)
                );
                
                return {
                    ...order,
                    ...ledgerInfo,
                    Products_List: productsWithStock,
                    Delivery_Info: orderDelivery || {},
                    Delivery_Items: DeliveryItems.filter(item => 
                        orderDelivery && isEqualNumber(item.Delivery_Order_Id, orderDelivery.Do_Id)
                    ),
                    Staffs_Array: Staffs_Array.filter(staff => 
                        isEqualNumber(staff.So_Id, order.So_Id)
                    )
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



const closingReport = async (req, res) => {
    try {
        const { PassingDate } = req.query;
        if (!PassingDate) {
            return invalidInput(res, "PassingDate is required");
        }

        const spRequest = new sql.Request();
        spRequest.input("fromdate", sql.Date, PassingDate);
        spRequest.input("todate", sql.Date, PassingDate);

        const stockResult = await spRequest.query(`
      EXEC [dbo].[Stock_Summarry_Search_Godown_New]
        @fromdate = @fromdate,
        @todate = @todate,
        @Godown_Id = '',
        @Item_Id = '';
    `);

        const balanceMap = new Map();
        for (const row of stockResult.recordset || []) {
            const key = `${row.Product_Id}-${row.Godown_Id}`;
            balanceMap.set(key, row.Bal_Qty ?? row.Act_Bal_Qty ?? 0);
        }

        const mainRequest = new sql.Request();
        mainRequest.input("fromdate", sql.Date, PassingDate);
        mainRequest.input("todate", sql.Date, PassingDate);

        const mainQuery = `
     ;WITH GodownInfo AS (
        SELECT Godown_Id, Godown_Name FROM tbl_Godown_Master
    ),
    LastWeek AS (
        SELECT sdsi.Item_Id, sdsi.Godown_Id,
            AVG(CAST(sdsi.Total_Qty AS DECIMAL(18,2))) AS Avg_Week_Qty
        FROM tbl_Sales_Delivery_Stock_Info sdsi
        WHERE sdsi.Do_Date >= DATEADD(DAY, -7, @todate)
            AND sdsi.Do_Date < @todate
        GROUP BY sdsi.Item_Id, sdsi.Godown_Id
    ),
    Yesterday AS (
        SELECT sdsi.Item_Id, sdsi.Godown_Id,
            SUM(sdsi.Total_Qty) AS Yesterday_Qty
        FROM tbl_Sales_Delivery_Stock_Info sdsi
        WHERE sdsi.Do_Date = DATEADD(DAY, -1, @todate)
        GROUP BY sdsi.Item_Id, sdsi.Godown_Id
    ),
    ProductInfo AS (
        SELECT DISTINCT
            pm.Product_Id,
            pm.Pos_Brand_Id,
            bm.POS_Brand_Name,
            pm.Product_Name,
            pm.Product_Description,
            pm.Product_Rate,
            pm.Max_Rate,
            CASE
                WHEN pm.Product_Name LIKE '%1kg%' THEN '1kg'
                WHEN pm.Product_Name LIKE '%25kg%' THEN '25kg'
                WHEN pm.Product_Name LIKE '%26kg%' THEN '26kg'
                WHEN pm.Product_Name LIKE '%30kg%' THEN '30kg'
                WHEN pm.Product_Name LIKE '%46kg%' THEN '46kg'
                WHEN pm.Product_Name LIKE '%50kg%' THEN '50kg'
                WHEN pm.Product_Name LIKE '%60kg%' THEN '60kg'
                ELSE 'Other'
            END AS Product_Pack,
            LEFT(pm.Product_Name, CHARINDEX(' ', pm.Product_Name + ' ', CHARINDEX('-', pm.Product_Name) + 1) - 1) AS Base_Product
        FROM tbl_Stock_Los sl
        INNER JOIN tbl_Product_Master pm ON sl.Stock_Tally_Id = pm.ERP_ID
        LEFT JOIN tbl_POS_Brand bm ON bm.POS_Brand_Id = pm.Pos_Brand_Id
    ),
    SalesAgg AS (
        SELECT
            pi.Product_Id,
            pi.Pos_Brand_Id,
            pi.POS_Brand_Name,
            gi.Godown_Id,
            gi.Godown_Name,
            pi.Base_Product,
            pi.Product_Description,
            pi.Product_Rate,
            pi.Max_Rate,
            pi.Product_Pack,
            ISNULL(LW.Avg_Week_Qty, 0) AS Avg_Week_Qty,
            ISNULL(Yest.Yesterday_Qty, 0) AS Yesterday_Qty
        FROM ProductInfo pi
        CROSS JOIN GodownInfo gi
        LEFT JOIN LastWeek LW ON LW.Item_Id = pi.Product_Id AND LW.Godown_Id = gi.Godown_Id
        LEFT JOIN Yesterday Yest ON Yest.Item_Id = pi.Product_Id AND Yest.Godown_Id = gi.Godown_Id
    )
    SELECT * FROM SalesAgg WHERE Pos_Brand_Id IS NOT NULL ORDER BY POS_Brand_Name;
    `;

        const mainResult = await mainRequest.query(mainQuery);

        const brandsMap = new Map();

        for (const row of (mainResult.recordset || [])) {
            const key = `${row.Product_Id}-${row.Godown_Id}`;
            const balQty = balanceMap.get(key) || 0;


            if (balQty === 0 && row.Avg_Week_Qty === 0 && row.Yesterday_Qty === 0) {
                continue;
            }

            if (!brandsMap.has(row.Pos_Brand_Id)) {
                brandsMap.set(row.Pos_Brand_Id, {
                    brandId: row.Pos_Brand_Id,
                    brandName: row.POS_Brand_Name,
                    godowns: new Map(),
                });
            }

            const brand = brandsMap.get(row.Pos_Brand_Id);

            if (!brand.godowns.has(row.Godown_Id)) {
                brand.godowns.set(row.Godown_Id, {
                    godownId: row.Godown_Id,
                    godownName: row.Godown_Name,
                    products: new Map(),
                    totalBalanceQty: 0,
                    totalWeeklyQty: 0,
                    totalYesterdayQty: 0,
                });
            }

            const godown = brand.godowns.get(row.Godown_Id);

            const productKey = row.Base_Product || row.Product_Id;

            if (!godown.products.has(productKey)) {
                godown.products.set(productKey, {
                    baseProduct: row.Base_Product,
                    productDescription: row.Product_Description,
                    productRate: row.Product_Rate,
                    maxRate: row.Max_Rate,
                    packs: [],
                });
            }

            const product = godown.products.get(productKey);

            let pack = product.packs.find(p => p.packType === row.Product_Pack);
            if (pack) {
                pack.weeklyAverage += row.Avg_Week_Qty;
                pack.yesterdayQty += row.Yesterday_Qty;
                pack.balanceQty += balQty;
            } else {
                product.packs.push({
                    packType: row.Product_Pack,
                    weeklyAverage: row.Avg_Week_Qty,
                    yesterdayQty: row.Yesterday_Qty,
                    balanceQty: balQty,
                });
            }

            godown.totalBalanceQty += balQty;
            godown.totalWeeklyQty += row.Avg_Week_Qty;
            godown.totalYesterdayQty += row.Yesterday_Qty;
        }


        const processedData = [];
        for (const brand of brandsMap.values()) {
            const godowns = [];

            for (const godown of brand.godowns.values()) {

                for (const product of godown.products.values()) {
                    product.packs = product.packs.filter(pack =>
                        pack.balanceQty > 0 || pack.weeklyAverage > 0 || pack.yesterdayQty > 0
                    );
                }


                const productsArray = Array.from(godown.products.values()).filter(
                    product => product.packs.length > 0
                );


                if (productsArray.length > 0 && (
                    godown.totalBalanceQty > 0 ||
                    godown.totalWeeklyQty > 0 ||
                    godown.totalYesterdayQty > 0
                )) {
                    godowns.push({
                        godownId: godown.godownId,
                        godownName: godown.godownName,
                        totalBalanceQty: godown.totalBalanceQty,
                        totalWeeklyQty: godown.totalWeeklyQty,
                        totalYesterdayQty: godown.totalYesterdayQty,
                        products: productsArray,
                    });
                }
            }


            if (godowns.length > 0) {
                processedData.push({
                    brandId: brand.brandId,
                    brandName: brand.brandName,
                    godowns,
                });
            }
        }

        if (processedData.length > 0) {
            sentData(res, processedData);
        } else {
            sentData(res, []);
        }
    } catch (error) {
        servError(error, res);
    }
};



const SyncPosPending = async (req, res) => {
    const dataArray = Array.isArray(req.body) ? req.body : [];

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or empty data array" });
    }

    const transaction = new sql.Transaction();
    let transactionBegun = false;

    try {
        await transaction.begin();
        transactionBegun = true;

        for (const data of dataArray) {
            const retailerResult = await new sql.Request(transaction)
                .input("Acc_Id", data.Acc_Id)
                .query(`
          SELECT Retailer_Id 
          FROM tbl_Retailers_Master 
          WHERE AC_Id = @Acc_Id
        `);

            if (!retailerResult.recordset.length) {
                console.warn(`No Retailer found for Acc_Id: ${data.Acc_Id}`);
                continue;
            }

            const retailerId = retailerResult.recordSet[0].Retailer_Id;

            await new sql.Request(transaction)
                .input("Above_30Days", data.Above_30_Days_Pending_Amt || 0)
                .input("Total_Outstanding", data.Overall_Outstanding_Amt || 0)
                .input("Retailer_Id", retailerId)
                .query(`
          UPDATE tbl_ERP_POS_Master
          SET 
            Above_30Days = @Above_30Days,
            Total_Outstanding = @Total_Outstanding
          WHERE Retailer_Id = @Retailer_Id
        `);
        }

        await transaction.commit();
        success(res, `Data synced successfully updated)`);

    } catch (err) {
        if (transactionBegun) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error('Rollback failed:', rollbackErr);
            }
        }
        servError(err, res, "Data sync error");
    }
};

const ReturnDelivery = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
        const Branch_Id = req.query.Branch_Id;
        const Retailer_Id = req.query.Retailer_Id

        let query = `
           SELECT 
    sr.*,
    sdgi.*,
    p.Product_Name,
	bm.BranchName,
    gm.Godown_Name,
    b.Brand_Id,
	b.Brand_Name,
   	rm.Retailer_Name
FROM tbl_Sales_Return_Stock_Info sr
LEFT JOIN tbl_Product_Master p ON p.Product_Id = sr.Item_Id
LEFT JOIN tbl_Godown_Master gm ON gm.Godown_Id = sr.GoDown_Id
LEFT JOIN tbl_Brand_Master b ON b.Brand_Id=p.Brand
LEFT JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdgi.Do_Id = sr.Delivery_Order_Id
LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id= sdgi.Retailer_Id
LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
WHERE CAST(sr.Ret_Date AS DATE) BETWEEN @fromDate AND @toDate
        `;

        const request = await new sql.Request()
            .input('fromDate', Fromdate)
            .input('toDate', Todate);

        if (Branch_Id) {
            query += ` AND sdgi.Branch_Id = @Branch_Id `;
            request.input('Branch_Id', Branch_Id);
        }
        if (Retailer_Id) {
            query += ` AND sdgi.Retailer_Id = @Retailer_Id `;
            request.input('Retailer_Id', Retailer_Id);
        }
        const result = await request.query(query);

        if (result.recordsets.length <= 0 || result.recordsets[0].length <= 0) {
            return noData(res, 'Record not found');
        }

        dataFound(res, result.recordsets[0]);
    } catch (error) {
        servError(error, res);
    }
}


export default {
    getNonConvertedSales,
    getNonConvertedSalesMobile,
    getNonConvertedSalesMobileItemwise,
    closingReport,
    SyncPosPending,
    ReturnDelivery
};
