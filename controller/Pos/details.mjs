import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber,isEqualNumber } from '../../helper_functions.mjs';
import {getProducts, getNextId } from '../../middleware/miniAPIs.mjs';
import SPCall from '../../middleware/SPcall.mjs';






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
    


    const getUnit=async(req,res)=>{
      

        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id:2
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
  


    const getProduct=async(req,res)=>{
      

        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id:3
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



    const getRetailers=async(req,res)=>{
      

        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id:4
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


    const rateMaster=async(req,res)=>{
      

        try {
            const result = await SPCall({
                SPName: 'Online_Pos_API', spParamerters: {
                    Api_Id:5
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
    
    
    
            const brokers=async(req,res)=>{
            try {
                const result = await SPCall({
                    SPName: 'Online_Pos_API', spParamerters: {
                        Api_Id:7
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
    catch(e) {
      
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
    catch(e) {
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
    catch(e) {
        console.error('Error fetching transporters:', e);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: e.message
        });
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
        getTransporterOpt

    }
}

export default posBranchController();