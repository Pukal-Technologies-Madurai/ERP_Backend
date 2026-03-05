import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success,sentData } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';
import { getProducts, getNextId } from '../../middleware/miniAPIs.mjs';
import SPCall from '../../middleware/SPcall.mjs';

import getImage from '../../middleware/getImageIfExist.mjs';




const posBranchController = () => {



    const getPosBrand = async (req, res) => {
        try {

            const result = await SPCall({
                SPName: 'Online_Pos_API',
                spParamerters: { Api_Id: 1 },
                spTransaction: req.db
            });

            if (result?.recordset?.length > 0) {
                const sales = JSON.parse(result.recordset[0]?.Pos_Brand || "[]");
                dataFound(res, sales);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };



    const getUnit = async (req, res) => {


        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id: 2
                }, spTransaction: req.db
            });



            if (result.recordset.length > 0) {
                const sales = JSON.parse(result.recordset[0]?.Pos_Unit)
                dataFound(res, sales)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }


    }



    const getProduct = async (req, res) => {


        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id: 3
                }, spTransaction: req.db
            });



            if (result.recordset.length > 0) {
                const Product = JSON.parse(result.recordset[0]?.Pos_Product)
                dataFound(res, Product)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }


    }



    const getRetailers = async (req, res) => {


        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id: 4
                }, spTransaction: req.db
            });



            if (result.recordset.length > 0) {
                const Retailer = JSON.parse(result.recordset[0]?.Pos_Retailer)
                dataFound(res, Retailer)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }


    }


    const rateMaster = async (req, res) => {


        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id: 5
                }, spTransaction: req.db
            });



            if (result.recordset.length > 0) {
                const sales = JSON.parse(result.recordset[0]?.Pos_Rate)
                dataFound(res, sales)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }


    }
    const transporters = async (req, res) => {
        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API',
                spParamerters: {
                    Api_Id: 6
                },
                spTransaction: req.db
            });
            if (result.recordset.length > 0) {
                const trans = JSON.parse(result.recordset[0]?.JsonResult)
                dataFound(res, trans)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    };



    const brokers = async (req, res) => {
        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id: 7
                }, spTransaction: req.db
            });
            if (result.recordset.length > 0) {
                const brok = JSON.parse(result.recordset[0]?.JsonResult)
                dataFound(res, brok)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }


    const getRetailersOpt = async (req, res) => {


        try {
            const request = new sql.Request();

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 12;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            let whereClause = 'WHERE 1=1';
            if (search) {
                whereClause += ` AND (r.Retailer_Name LIKE '%' + @search + '%' OR 
                                  r.Contact_Person LIKE '%' + @search + '%' OR
                                  r.Mobile_No LIKE '%' + @search + '%')`;
                request.input('search', sql.NVarChar, search);
            }

            const countQuery = `
            SELECT COUNT(*) as total 
            FROM dbo.tbl_Retailers_Master r
            ${whereClause}
        `;

            const countResult = await request.query(countQuery);
            const totalRecords = countResult.recordset[0].total;
            const totalPages = Math.ceil(totalRecords / limit);

            const query = `
            SELECT 
                r.Retailer_Id AS Customer_Id,
                r.Retailer_Name AS Short_Name,
                r.Contact_Person AS Billl_Name,
                r.Mobile_No,
                r.Reatailer_Address AS Address,
                r.Reatailer_City AS City,
                ISNULL(pos.Broker, '') AS Broker,
                ISNULL(pos.Transporter, '') AS Transporter,
                ISNULL(pos.Broker_Id, 0) AS Broker_Id,
                ISNULL(pos.Transporter_Id, 0) AS Transporter_Id,
                ISNULL(pos.Total_Outstanding, 0) AS Total_Outstanding,
                ISNULL(pos.Above_30Days, 0) AS Above_30Days,
                ISNULL(pos.QPay, 0) AS QPay,
                ISNULL(pos.Frequency_Days, 0) AS Frequency_Days,
                ISNULL(pos.LastBilling_Amount, 0) AS LastBilling_Amount,
                ISNULL(pos.Month_Avg_Ton, 0) AS Month_Avg_Ton,
                ISNULL(pos.Month_Avg_Amo, 0) AS Month_Avg_Amo,
                '' AS Land_Line,
                '' AS Lorry_Shed
            FROM dbo.tbl_Retailers_Master r
            LEFT JOIN dbo.tbl_ERP_POS_Master pos ON r.Retailer_Id = pos.Retailer_Id
            ${whereClause}
            ORDER BY r.Retailer_Id
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

            request.input('offset', sql.Int, offset);
            request.input('limit', sql.Int, limit);

            const result = await request.query(query);

            if (!result.recordset || result.recordset.length === 0) {

                return res.status(200).json({
                    success: true,
                    data: [],
                    pagination: {
                        currentPage: page,
                        perPage: limit,
                        totalRecords: totalRecords,
                        totalPages: totalPages,
                        hasNextPage: page < totalPages,
                        hasPreviousPage: page > 1
                    }
                });
            }

            const response = {
                success: true,
                data: result.recordset,
                pagination: {
                    currentPage: page,
                    perPage: limit,
                    totalRecords: totalRecords,
                    totalPages: totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };


            res.status(200).json(response);
        }
        catch (e) {

            res.status(500).json({
                success: false,
                message: 'Server error',
                error: e.message
            });
        }
    };

    const getBrokersOpt = async (req, res) => {
        try {
            const request = new sql.Request();

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            // Build base query
            let baseQuery = `
            SELECT 
                Cost_Center_Id AS Broker_Id,
                Cost_Center_Name AS Broker_Name
            FROM tbl_ERP_Cost_Center
            WHERE User_Type = 3
        `;

            let countQuery = `
            SELECT COUNT(*) as total 
            FROM tbl_ERP_Cost_Center
            WHERE User_Type = 3
        `;

            // Add search filter if provided
            if (search) {
                const searchFilter = ` AND (Cost_Center_Name LIKE '%' + @search + '%' OR 
                                        Cost_Center_Id LIKE '%' + @search + '%')`;
                baseQuery += searchFilter;
                countQuery += searchFilter;
                request.input('search', sql.NVarChar, search);
            }

            // Get total count
            const countResult = await request.query(countQuery);
            const totalRecords = countResult.recordset[0].total;
            const totalPages = Math.ceil(totalRecords / limit);

            // Add pagination to main query
            baseQuery += `
            ORDER BY Cost_Center_Id
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

            request.input('offset', sql.Int, offset);
            request.input('limit', sql.Int, limit);

            const result = await request.query(baseQuery);

            const response = {
                success: true,
                data: {
                    Brokers: result.recordset
                },
                pagination: {
                    currentPage: page,
                    perPage: limit,
                    totalRecords: totalRecords,
                    totalPages: totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };

            res.status(200).json(response);
        }
        catch (e) {
            console.error('Error fetching brokers:', e);
            res.status(500).json({
                success: false,
                message: 'Server error',
                error: e.message
            });
        }
    };

    const getTransporterOpt = async (req, res) => {
        try {
            const request = new sql.Request();

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            // Build base query
            let baseQuery = `
           SELECT 
        Cost_Center_Id AS Transporter_Id, 
        Cost_Center_Name AS Transporter_Name
    FROM tbl_ERP_Cost_Center
    WHERE User_Type = 2 

            
        `;

            let countQuery = `
            SELECT COUNT(*) as total 
            FROM tbl_ERP_Cost_Center
            WHERE User_Type = 2
        `;

            // Add search filter if provided
            if (search) {
                const searchFilter = ` AND (Cost_Center_Name LIKE '%' + @search + '%' OR 
                                        Cost_Center_Id LIKE '%' + @search + '%')`;
                baseQuery += searchFilter;
                countQuery += searchFilter;
                request.input('search', sql.NVarChar, search);
            }

            // Get total count
            const countResult = await request.query(countQuery);
            const totalRecords = countResult.recordset[0].total;
            const totalPages = Math.ceil(totalRecords / limit);

            // Add pagination to main query
            baseQuery += `
            ORDER BY Cost_Center_Id
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `;

            request.input('offset', sql.Int, offset);
            request.input('limit', sql.Int, limit);

            const result = await request.query(baseQuery);

            const response = {
                success: true,
                data: {
                    Transporters: result.recordset
                },
                pagination: {
                    currentPage: page,
                    perPage: limit,
                    totalRecords: totalRecords,
                    totalPages: totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };

            res.status(200).json(response);
        }
        catch (e) {
            console.error('Error fetching transporters:', e);
            res.status(500).json({
                success: false,
                message: 'Server error',
                error: e.message
            });
        }
    };




    const getStockGroup=async (req,res)=>{
        // const { Emp_Id, reqDate } = req.query;
         
            //   if (!checkIsNumber(Emp_Id)) {
            //       return invalidInput(res, 'Emp_Id is required');
            //   }
      
              try {
                  const request = new sql.Request()
                      .query(`
                        SELECT DISTINCT Stock_Group 
                            FROM tbl_Stock_LOS 
                            WHERE Stock_Group IS NOT NULL 
                            ORDER BY Stock_Group
                             `);
      
                  const result = await request;
      
                  if (result.recordset.length > 0) {
                      return dataFound(res, result.recordset)
                  } else {
                      return noData(res)
                  }
              } catch (e) {
                  return servError(e, res);
              }
    }



    const getPOSGroupsByStock = async (req, res) => {
    const { stockGroup } = req.query;
    
    if (!stockGroup) {
        return invalidInput(res, 'Stock_Group is required');
    }
    
    try {
        const request = new sql.Request()
            .input('Stock_Group', sql.VarChar, stockGroup)
            .query(`
                SELECT DISTINCT 
                    POS_Group,
                    COUNT(*) as ItemCount,
                    MIN(Auto_Id) as FirstItemId,
                    MAX(Auto_Id) as LastItemId
                FROM tbl_Stock_LOS 
                WHERE Stock_Group = @Stock_Group 
                    AND POS_Group IS NOT NULL
                GROUP BY POS_Group
                ORDER BY POS_Group
            `);

        const result = await request;

        if (result.recordset.length > 0) {
            // Format the response
            const formattedData = result.recordset.map(item => ({
                posGroup: item.POS_Group,
                itemCount: item.ItemCount,
                firstItemId: item.FirstItemId,
                lastItemId: item.LastItemId
            }));
            
            return res.status(200).json({
                success: true,
                message: 'POS Groups found',
                data: formattedData,
                totalGroups: formattedData.length,
                stockGroup: stockGroup
            });
        } else {
            return res.status(200).json({
                success: true,
                message: 'No POS Groups found for this Stock Group',
                data: [],
                totalGroups: 0,
                stockGroup: stockGroup
            });
        }
    } catch (e) {
        return servError(e, res);
    }
};

const getPosGroupDetails=async(req,res)=>{
  
    const { posGroup } = req.query;
    
    if (!posGroup) {
        return res.status(400).json({
            success: false,
            message: 'POS_Group is required'
        });
    }
    
    try {
        const request = new sql.Request()
            .input('POS_Group', sql.NVarChar, posGroup)
            .query(`
                SELECT * FROM tbl_Stock_LOS 
                WHERE POS_Group = @POS_Group
                ORDER BY Auto_Id
            `);
        
        const result = await request;
        
        res.json({
            success: true,
            message: result.recordset.length > 0 ? 'Items found' : 'No items found',
            data: result.recordset
        });
        
    } catch (error) {
        console.error('Error fetching items:', error);
        res.status(500).json({
            success: false,
            message: 'Database error',
            error: error.message
        });
    }
}


    const getAllProductsPos = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        p.*,
                        stl.Stock_Tally_Id,
                        stl.Alter_Tally_Id,
                        stl.Stock_Item,
                        stl.Group_ST,
                        stl.Bag,
                        stl.Stock_Group,
                        stl.S_Sub_Group_1,
                        stl.Grade_Item_Group,
                        stl.Item_Name_Modified,
                        stl.POS_Group,
                        stl.POS_Item_Name,
                        
                        COALESCE(b.Brand_Name, 'NOT FOUND') AS Brand_Name,
                        COALESCE(pg.Pro_Group, 'NOT FOUND') AS Pro_Group,
                        COALESCE(u.Units, 'NOT FOUND') AS Units,
                        COALESCE(pck.Pack, 'NOT FOUND') AS PackGet,
                        COALESCE(p.Product_Rate, 0) AS Item_Rate
                    FROM 
                        tbl_Product_Master AS p
                        LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = p.Brand
                        LEFT JOIN tbl_Product_Group AS pg ON pg.Pro_Group_Id = p.Product_Group
                        LEFT JOIN tbl_Brokerage AS br ON br.Product_Id=p.Product_Id
                        LEFT JOIN tbl_UOM AS u ON u.Unit_Id = p.UOM_Id
                        LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id = p.Pack_Id
                        LEFT JOIN tbl_Stock_LOS AS stl ON stl.Pro_Id=p.product_Id
                    ORDER BY p.Product_Id DESC`
                );

            const productResult = (await request).recordset;

            const withImage = productResult.map(product => ({
                ...product,
                productImageUrl: getImage('products', product?.Product_Image_Name),
            }));

            sentData(res, withImage);

        } catch (e) {
            servError(e, res);
        }
    };

const getProductsWithStock = async (req, res) => {
    try {
        const query = `
            SELECT 
                Product_Id,
                Product_Name,
                Short_Name as Print_Name,
                Pos_Brand_Id as IGroup_Id,
                0 as Brand,
                [UOM_Id] as Unit,
                coalesce([Product_Rate], 0) as Price,
                [IsActive] as Is_Active
            FROM tbl_Product_Master 
        `;
        
         const result = await sql.query(query);
      
                  if (result.recordset.length > 0) {
                      return dataFound(res, result.recordset)
                  } else {
                      return noData(res)
                  }
              } catch (e) {
                  return servError(e, res);
              } 
};

    return {

        getPosBrand,
        getUnit,
        getProduct,
        getRetailers,
        rateMaster,
        transporters,
        brokers,
        getRetailersOpt,
        getBrokersOpt,
        getTransporterOpt,
        getStockGroup,
        getPOSGroupsByStock,
        getPosGroupDetails,
        getAllProductsPos,
        getProductsWithStock
        
    }
}

export default posBranchController();