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
    
  
    
 
 

    
      return {
     
        getPosBrand,
        getUnit,
        getProduct,
        getRetailers,
        rateMaster,
        transporters,
        brokers


    }
}

export default posBranchController();