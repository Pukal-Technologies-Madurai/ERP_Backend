import sql from 'mssql';
import { servError, sentData, noData, dataFound } from '../../res.mjs'
import { Addition, Division, groupData, isEqualNumber, ISOString, Multiplication, toArray } from '../../helper_functions.mjs';


const getStorageStockItemWise = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0)
            .execute('Stock_Summarry_Search');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.Bal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id)
        )];

        const getProductLosData = new sql.Request()
            .input(
                'filterItems',
                sql.NVarChar('max'),
                uniqueItemIdArray.map(item => item).join(', ')
            ).query(`
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                )
                SELECT 
                	p.Product_Id, 
                	p.Product_Name, 
                	p.ERP_Id,
                	p.Product_Rate,
                    COALESCE(los.Stock_Item, '-') AS Stock_Item,
                	COALESCE(los.Group_ST, '-') AS Group_ST,
                	COALESCE(los.Bag, '-') AS Bag,
                	COALESCE(los.Stock_Group, '-') AS Stock_Group,
                	COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                	COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                	COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified
                FROM tbl_Product_Master AS p
                JOIN tbl_Stock_LOS AS los
                ON los.Stock_Tally_Id = p.ERP_Id
                WHERE (
                        @filterItems IS NULL 
                        OR LTRIM(RTRIM(@filterItems)) = '' 
                        OR P.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                );`
            );

        const productLosResult = (await getProductLosData).recordset;

        const mergeLosData = filteredData.map(row => {
            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = ''
            } = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            ) || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified
            }
        });

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const getStorageStockGodownWise = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Godown_Id', 0)
            .input('Item_Id', 0)
            .execute('Stock_Summarry_Search_Godown_New');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0) &&
                isEqualNumber(row?.Act_Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id)
        )];

        const getProductLosData = new sql.Request()
            .input(
                'filterItems',
                sql.NVarChar('max'),
                uniqueItemIdArray.map(item => item).join(', ')
            ).query(`
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                )
                SELECT 
                	p.Product_Id, 
                	p.Product_Name, 
                	p.ERP_Id,
                	p.Product_Rate,
                    COALESCE(los.Stock_Item, '-') AS Stock_Item,
                	COALESCE(los.Group_ST, '-') AS Group_ST,
                	COALESCE(los.Bag, '-') AS Bag,
                	COALESCE(los.Stock_Group, '-') AS Stock_Group,
                	COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                	COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                	COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified,
                    COALESCE(stvlu.CL_Rate, 0) AS CL_Rate
                FROM tbl_Product_Master AS p
                JOIN tbl_Stock_LOS AS los
                ON los.Stock_Tally_Id = p.ERP_Id
                LEFT JOIN tbl_Daily_Stock_Value AS stvlu
                ON stvlu.Group_Name = los.Item_Name_Modified AND stvlu.Trans_Date = '${Todate}'
                WHERE (
                    @filterItems IS NULL 
                    OR LTRIM(RTRIM(@filterItems)) = '' 
                    OR P.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                );`
            );

        const productLosResult = (await getProductLosData).recordset;

        const mergeLosData = filteredData.map(row => {
            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = '', CL_Rate = 0
            } = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            ) || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified, CL_Rate, CL_Value: Multiplication(row?.Bal_Qty, CL_Rate)
            }
        });

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const itemGroupWiseClosingDetails = async (req, res) => {
    try {

        const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();
        const getMaxOfItemClosingDate = isEqualNumber(req?.query?.getMaxOfItemClosingDate, 1);

        const request = new sql.Request()
            .input('reqDate', reqDate)
            .query(`
                SELECT
                    latest.*,
                	COALESCE(los.Brand, 'not found') AS Brand, 
                    COALESCE(los.Group_ST, 'not found') AS Group_ST, 
                    COALESCE(los.Stock_Group, 'not found') AS Stock_Group, 
                    COALESCE(los.S_Sub_Group_1, 'not found') AS S_Sub_Group_1, 
                    COALESCE(los.Grade_Item_Group, 'not found') AS Grade_Item_Group
                FROM (
                    SELECT DISTINCT Item_Group_Id
                    FROM tbl_Daily_Stock_Value
                ) ig
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM tbl_Daily_Stock_Value pcs
                    WHERE 
                        pcs.Item_Group_Id = ig.Item_Group_Id
                        ${getMaxOfItemClosingDate ? `
                        AND pcs.Trans_Date <= @reqDate ` : ''}
                    ORDER BY pcs.Trans_Date DESC
                ) AS latest 
                LEFT JOIN ( 
					SELECT 
						DISTINCT Item_Group_Id,
						Brand,Group_ST,
						Stock_Group,
						S_Sub_Group_1,
						Grade_Item_Group 
					FROM tbl_Stock_LOS 
					WHERE  
						Item_Group_Id IS NOT NULL 
						and Item_Group_Id <> 0
				) AS los
                ON los.Item_Group_Id = ig.Item_Group_Id`
            );

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const StockGroupWiseClosingDetails = async (req, res) => {
    try {

        const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();

        const request = new sql.Request()
            .input('reqDate', reqDate)
            .query(`
                SELECT
                    latest.Item_Group_Id,
                	latest.Group_Name,
                	latest.Trans_Date,
                	COALESCE(los.Brand, 'not found') AS Brand, 
                    COALESCE(los.Group_ST, 'not found') AS Group_ST, 
                    COALESCE(los.Stock_Group, 'not found') AS Stock_Group, 
                    COALESCE(los.S_Sub_Group_1, 'not found') AS S_Sub_Group_1, 
                    COALESCE(los.Grade_Item_Group, 'not found') AS Grade_Item_Group,
                	COALESCE(latest.Bal_Qty, 0) AS Bal_Qty,
                	COALESCE(latest.CL_Rate, 0) AS CL_Rate,
                	COALESCE(latest.CL_Value, 0) AS Stock_Value
                FROM (
                    SELECT DISTINCT Item_Group_Id
                    FROM tbl_Daily_Stock_Value
                ) ig
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM tbl_Daily_Stock_Value pcs
                    WHERE 
                        pcs.Item_Group_Id = ig.Item_Group_Id
                		AND pcs.Trans_Date <= @reqDate
                    ORDER BY pcs.Trans_Date DESC
                ) AS latest 
                LEFT JOIN ( 
                	SELECT 
                		DISTINCT Item_Group_Id,
                		Brand,Group_ST,
                		Stock_Group,
                		S_Sub_Group_1,
                		Grade_Item_Group 
                	FROM tbl_Stock_LOS 
                	WHERE  
                		Item_Group_Id IS NOT NULL 
                		and Item_Group_Id <> 0
                ) AS los
                ON los.Item_Group_Id = ig.Item_Group_Id
                WHERE (
                    latest.Bal_Qty > 0 OR
                    latest.CL_Rate > 0 OR
                	latest.CL_Value > 0
                )`
            );

        const result = (await request).recordset;

        if (result.length > 0) {
            const grouped = groupData(result, 'Stock_Group');

            const calcBalQty = (colmn, arr = []) => toArray(arr).reduce(
                (acc, obj) => Addition(acc, obj[colmn]), 0
            );

            const calculateMean = (colmn, arr = []) => {
                const total = calcBalQty(colmn, arr);
                return Division(total, arr.length)
            }

            const aggregate = grouped.map(({ groupedData, ...rest }) => {
                const arr = toArray(groupedData);

                return {
                    ...rest,
                    product_details: arr,
                    Bal_Qty: calcBalQty('Bal_Qty', arr),
                    CL_Rate: calculateMean('CL_Rate', arr),
                    Stock_Value: calcBalQty('Stock_Value', arr),
                }
            })

            dataFound(res, aggregate);
        } else {
            noData(res)
        }

    } catch (e) {
        servError(e, res);
    }
}



const getStorageStockItemWiseMobile = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
        const filters = req.query.filters ? JSON.parse(req.query.filters) : [];

        const request = new sql.Request()
            .input('Fromdate', sql.DateTime, Fromdate)
            .input('Todate', sql.DateTime, Todate)
            .input('Stock_Group_Id', sql.Int, 0)
            .input('Item_Id', sql.Int, 0)
            .execute('Stock_Summarry_Search');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.Bal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id).filter(id => id != null)
        )];

        // Build filter conditions for LOS data
        const { whereClause, filterParams } = buildFilterConditions(filters, 'los');

        const getProductLosData = new sql.Request();

        // Only add filterItems if there are unique items
        if (uniqueItemIdArray.length > 0) {
            getProductLosData.input('filterItems', sql.NVarChar(sql.MAX), uniqueItemIdArray.join(','));
        } else {
            getProductLosData.input('filterItems', sql.NVarChar(sql.MAX), '');
        }

        // Add filter parameters to the request
        Object.keys(filterParams).forEach(key => {
            getProductLosData.input(key, filterParams[key]);
        });

        const query = `
            WITH FilteredProducts AS (
                SELECT 
                    TRY_CAST(value AS INT) AS Product_Id
                FROM STRING_SPLIT(@filterItems, ',')
                WHERE TRY_CAST(value AS INT) IS NOT NULL
            )
            SELECT 
                p.Product_Id, 
                p.Product_Name, 
                p.ERP_Id,
                p.Product_Rate,
                COALESCE(los.Stock_Item, '-') AS Stock_Item,
                COALESCE(los.Group_ST, '-') AS Group_ST,
                COALESCE(los.Bag, '-') AS Bag,
                COALESCE(los.Stock_Group, '-') AS Stock_Group,
                COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified
            FROM tbl_Product_Master AS p
            JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
            WHERE (
                @filterItems IS NULL 
                OR LTRIM(RTRIM(@filterItems)) = '' 
                OR p.Product_Id IN (SELECT Product_Id FROM FilteredProducts)
            )
            ${whereClause}`;

        const productLosResult = (await getProductLosData.query(query)).recordset;

        const mergeLosData = filteredData.map(row => {
            const matchingProduct = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            );

            if (!matchingProduct && filters.length > 0) {
                return null; // Exclude rows that don't match filters
            }

            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = ''
            } = matchingProduct || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified
            };
        }).filter(row => row !== null); // Remove null rows

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const getStorageStockGodownWiseMobile = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
        const filters = req.query.filters ? JSON.parse(req.query.filters) : [];

        const request = new sql.Request()
            .input('Fromdate', sql.DateTime, Fromdate)
            .input('Todate', sql.DateTime, Todate)
            .input('Godown_Id', sql.Int, 0)
            .input('Item_Id', sql.Int, 0)
            .execute('Stock_Summarry_Search_Godown_New');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0) &&
                isEqualNumber(row?.Act_Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id).filter(id => id != null)
        )];

        const { whereClause, filterParams } = buildFilterConditions(filters, 'los');

        const getProductLosData = new sql.Request();

        // Only add filterItems if there are unique items
        if (uniqueItemIdArray.length > 0) {
            getProductLosData.input('filterItems', sql.NVarChar(sql.MAX), uniqueItemIdArray.join(','));
        } else {
            getProductLosData.input('filterItems', sql.NVarChar(sql.MAX), '');
        }

        Object.keys(filterParams).forEach(key => {
            getProductLosData.input(key, filterParams[key]);
        });

        const query = `
            WITH FilteredProducts AS (
                SELECT 
                    TRY_CAST(value AS INT) AS Product_Id
                FROM STRING_SPLIT(@filterItems, ',')
                WHERE TRY_CAST(value AS INT) IS NOT NULL
            )
            SELECT 
                p.Product_Id, 
                p.Product_Name, 
                p.ERP_Id,
                p.Product_Rate,
                COALESCE(los.Stock_Item, '-') AS Stock_Item,
                COALESCE(los.Group_ST, '-') AS Group_ST,
                COALESCE(los.Bag, '-') AS Bag,
                COALESCE(los.Stock_Group, '-') AS Stock_Group,
                COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified,
                COALESCE(stvlu.CL_Rate, 0) AS CL_Rate
            FROM tbl_Product_Master AS p
            JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
            LEFT JOIN tbl_Daily_Stock_Value AS stvlu ON stvlu.Group_Name = los.Item_Name_Modified AND stvlu.Trans_Date = @Todate
            WHERE (
                @filterItems IS NULL 
                OR LTRIM(RTRIM(@filterItems)) = '' 
                OR p.Product_Id IN (SELECT Product_Id FROM FilteredProducts)
            )
            ${whereClause}`;

        // Add Todate parameter for the LEFT JOIN condition
        getProductLosData.input('Todate', sql.DateTime, Todate);

        const productLosResult = (await getProductLosData.query(query)).recordset;

        const mergeLosData = filteredData.map(row => {
            const matchingProduct = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            );

            if (!matchingProduct && filters.length > 0) {
                return null;
            }

            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = '', CL_Rate = 0
            } = matchingProduct || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified, CL_Rate, 
                CL_Value: Multiplication(row?.Bal_Qty, CL_Rate)
            };
        }).filter(row => row !== null);

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const itemGroupWiseClosingDetailsMobile = async (req, res) => {
    try {
        const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();
        const getMaxOfItemClosingDate = isEqualNumber(req?.query?.getMaxOfItemClosingDate, 1);
        const filters = req.query.filters ? JSON.parse(req.query.filters) : [];

        const { whereClause, filterParams } = buildFilterConditions(filters, 'los');

        const request = new sql.Request()
            .input('reqDate', sql.DateTime, reqDate);

        Object.keys(filterParams).forEach(key => {
            request.input(key, filterParams[key]);
        });

        const query = `
            SELECT
                latest.*,
                COALESCE(los.Brand, 'not found') AS Brand, 
                COALESCE(los.Group_ST, 'not found') AS Group_ST, 
                COALESCE(los.Stock_Group, 'not found') AS Stock_Group, 
                COALESCE(los.S_Sub_Group_1, 'not found') AS S_Sub_Group_1, 
                COALESCE(los.Grade_Item_Group, 'not found') AS Grade_Item_Group
            FROM (
                SELECT DISTINCT Item_Group_Id
                FROM tbl_Daily_Stock_Value
            ) ig
            OUTER APPLY (
                SELECT TOP 1 *
                FROM tbl_Daily_Stock_Value pcs
                WHERE 
                    pcs.Item_Group_Id = ig.Item_Group_Id
                    ${getMaxOfItemClosingDate ? `AND pcs.Trans_Date <= @reqDate` : ''}
                ORDER BY pcs.Trans_Date DESC
            ) AS latest 
            LEFT JOIN ( 
                SELECT 
                    DISTINCT Item_Group_Id,
                    Brand, Group_ST,
                    Stock_Group,
                    S_Sub_Group_1,
                    Grade_Item_Group 
                FROM tbl_Stock_LOS 
                WHERE  
                    Item_Group_Id IS NOT NULL 
                    AND Item_Group_Id <> 0
                    ${whereClause}
            ) AS los
            ON los.Item_Group_Id = ig.Item_Group_Id`;

        const result = await request.query(query);
        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const buildFilterConditions = (filters, tableAlias = '') => {
    const conditions = [];
    const filterParams = {};

    if (filters && Array.isArray(filters)) {
        filters.forEach((filter, index) => {
            if (filter.columnName && filter.values && filter.values.length > 0) {
                const paramName = `filter${index}`;
                const column = tableAlias ? `${tableAlias}.${filter.columnName}` : filter.columnName;
                
                if (filter.values.length === 1) {
                    conditions.push(`${column} = @${paramName}`);
                    filterParams[paramName] = filter.values[0];
                } else {
                    const placeholders = filter.values.map((_, i) => `@${paramName}_${i}`).join(', ');
                    conditions.push(`${column} IN (${placeholders})`);
                    
                    filter.values.forEach((value, i) => {
                        filterParams[`${paramName}_${i}`] = value;
                    });
                }
            }
        });
    }

    return {
        whereClause: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
        filterParams
    };
};

export default {
    getStorageStockItemWise,
    getStorageStockGodownWise,
    itemGroupWiseClosingDetails,
    StockGroupWiseClosingDetails,
    getStorageStockItemWiseMobile,
    getStorageStockGodownWiseMobile,
    itemGroupWiseClosingDetailsMobile,
    // getStockMobileReportDropdowns
}