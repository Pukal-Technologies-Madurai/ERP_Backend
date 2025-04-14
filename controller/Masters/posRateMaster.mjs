import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';
import { getProducts,getNextId } from '../../middleware/miniAPIs.mjs';
import fetch from 'node-fetch';



const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};
const posBranchController = () => {

    const getPosRateDropDown = async (req, res) => {

        try {
            const pos = (await new sql.Request()
                .query(`
                    SELECT 
                        POS_Brand_Id, 
                        POS_Brand_Name
                    FROM 
                       tbl_POS_Brand
                  
                        `)
            ).recordset;
            // AND
            // Company_id = @Comp

            if (pos.length > 0) {
                dataFound(res, pos)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }
    const getPosRateMaster = async (req, res) => {
        const { FromDate } = req.query; 
    
        if (!FromDate) {
            return invalidInput(res, 'FromDate is required');
        }
    
        try {
            const request = new sql.Request();
    
            let query = `
                SELECT rm.Id, rm.Rate_Date, rm.Pos_Brand_Id, rm.Item_Id, rm.Rate,rm.Max_Rate, 
                       pb.POS_Brand_Name, pm.Product_Name, pm.Short_Name, 
                       pm.isActive AS Is_Active_Decative
                FROM tbl_Pos_Rate_Master rm
                LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
                LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
                WHERE Rate_Date = @FromDate
                ORDER BY pm.IsActive DESC; 
            `;
    
            request.input('FromDate', sql.Date, FromDate);
    
            const result = await request.query(query);
    
            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (e) {
            return servError(e, res);
        }
    };
    
    const postPosRateMaster = async (req, res) => {
        const { Rate_Date, Pos_Brand_Id, Item_Id, Rate,MaxRate, Is_Active_Decative } = req.body;

        if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Rate || !Is_Active_Decative || !MaxRate) {
            return invalidInput(res, 'Enter Required Fields');
        }

        try {

            const formattedRateDate = new Date(Rate_Date).toISOString();

            const request1 = new sql.Request();
            request1.input('Rate_Date', formattedRateDate);
            request1.input('Pos_Brand_Id', Pos_Brand_Id);
            request1.input('Item_Id', Item_Id);

            const query1 = `SELECT * FROM tbl_Pos_Rate_Master WHERE Rate_Date=@Rate_Date AND Pos_Brand_Id=@Pos_Brand_Id AND Item_Id=@Item_Id`;
            const result1 = await request1.query(query1);


            if (result1.recordset.length > 0) {
                const request2 = new sql.Request();
                request2.input('Rate_Date', formattedRateDate);
                request2.input('Pos_Brand_Id', Pos_Brand_Id);
                request2.input('Item_Id', Item_Id);
                const query2 = `DELETE FROM tbl_Pos_Rate_Master WHERE Rate_Date=@Rate_Date AND Pos_Brand_Id=@Pos_Brand_Id AND Item_Id=@Item_Id`;
                await request2.query(query2);
            }

            const request3 = new sql.Request();
            request3.input('Rate_Date', formattedRateDate);
            request3.input('Item_Id', Item_Id);

            const query3 = `SELECT * FROM tbl_Product_Master WHERE Product_Id=@Item_Id`;
            const result3 = await request3.query(query3);



            const request6 = new sql.Request();
            request6.input('Rate_Date', formattedRateDate);
            request6.input('Item_Id', Item_Id);
            request6.input('Max_Rate',MaxRate)
            request6.input('Rate', Rate);
            request6.input('Is_Active_Decative', Is_Active_Decative);

            const query6 = `
                update tbl_Product_Master SET Product_Rate=@Rate,Max_Rate=@Max_Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id
                
            `;

            await request6.query(query6);

          

            const getMaxId = await getNextId({ table: 'tbl_Pos_Rate_Master', column: 'Id' });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating RateMaster');
            }

            const Id = getMaxId.MaxId;

            const request5 = new sql.Request();
            request5.input('Id', Id);
            request5.input('Rate_Date', formattedRateDate);
            request5.input('Pos_Brand_Id', Pos_Brand_Id);
            request5.input('Item_Id', Item_Id);
            request5.input('Rate', Rate);
            request5.input('Max_Rate', MaxRate);
            request5.input('Is_Active_Decative', Is_Active_Decative);

            const query5 = `
                INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate,Max_Rate, Is_Active_Decative) 
                VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate,@Max_Rate,@Is_Active_Decative)
            `;

            const result5 = await request5.query(query5);

            if (result5.rowsAffected[0] > 0) {
              
                success(res, 'Rate Master created successfully');
            } else {
                failed(res, 'Failed to create POS_Brand');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putPosRateMaster = async (req, res) => {
        const { Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate,MaxRate, Is_Active_Decative } = req.body;

        if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Id | !MaxRate) {
            return invalidInput(res, 'Rate_Date,Pos_Brand,Item is required')
        }

        try {
            const request = new sql.Request();
            request.input('Id', Id);
            request.input('Rate_Date', Rate_Date);
            request.input('Pos_Brand_Id', Pos_Brand_Id);
            request.input('Item_Id', Item_Id);
            request.input('Rate', Rate);
            request.input('Max_Rate', MaxRate);
            request.input('Is_Active_Decative', Is_Active_Decative);
            const result = await request.query(`
                UPDATE tbl_Pos_Rate_Master
                SET Rate = @Rate,
                Max_Rate=@Max_Rate,
                Pos_Brand_Id=@Pos_Brand_Id,
                Rate_Date=@Rate_Date,
                Item_Id=@Item_Id,
                Is_Active_Decative=@Is_Active_Decative
                WHERE Id=@Id
            `);


            const request3 = new sql.Request();
            request3.input('Item_Id', Item_Id);

            const query3 = `SELECT * FROM tbl_Product_Master WHERE Product_Id=@Item_Id`;
            const result3 = await request3.query(query3);

            // if (result3.recordset.length > 0) {
            //     const request4 = new sql.Request();
            //     request4.input('Item_Id', Item_Id);
            //     const query4 = `DELETE FROM tbl_Pro_Rate_Master WHERE Product_Id=@Item_Id`;
            //     await request4.query(query4);
            // }


            const request6 = new sql.Request();
            request6.input('Rate_Date', Rate_Date);
            request6.input('Item_Id', Item_Id);
            request6.input('Rate', Rate);
            request6.input('Max_Rate',MaxRate)
            request6.input('Is_Active_Decative', Is_Active_Decative);

            const query6 = `update tbl_Product_Master SET Product_Rate=@Rate,Max_Rate=@Max_Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id`;

            const result6 = await request6.query(query6);


            if (result.rowsAffected[0] > 0) {
         
                return success(res, 'Rate Master updated successfully');
            } else {
                return failed(res, 'No changes were made, the Rate Master not exist');
            }
        } catch (e) {

       
            return servError(e, res);
        }
    };

    const deletePosRateMaster = async (req, res) => {
        const { Id } = req.body;
    
        if (!Id) {
            return invalidInput(res, 'Id is required');
        }
    
        try {
            const request = new sql.Request().input('Id', Id);
    
           
            const getData = await request.query(`
                SELECT Item_Id FROM tbl_Pos_Rate_Master WHERE Id = @Id
            `);
    
            if (getData.recordset.length === 0) {
                return failed(res, 'Rate Master not found');
            }
    
            const productId = getData.recordset[0].Item_Id;
    
       
            const result = await request.query(`
                DELETE FROM tbl_Pos_Rate_Master WHERE Id = @Id
            `);
    
            if (result.rowsAffected[0] > 0) {
             
                if (productId) {
                    await new sql.Request()
                        .input('Product_Id', productId)
                        .query(`
                            UPDATE tbl_Product_Master SET IsActive = 0 WHERE Product_Id = @Product_Id
                        `);
                }
    
                return success(res, 'Rate Master Deleted successfully');
            } else {
                return failed(res, 'No changes were made, the Master might not exist');
            }
        } catch (e) {
            return servError(e, res);
        }
    };
    

    const getProductDropdown = async (req, res) => {

        try {
            const pos = (await new sql.Request()
                .query(`
                    SELECT 
                        pm.product_Id as Item_Id, 
                        pm.product_Name as Item_Name
                    FROM 
                       tbl_Product_Master pm
                        `)
            ).recordset;
            // AND
            // Company_id = @Comp

            if (pos.length > 0) {
                dataFound(res, pos)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

  
    const postbulkExport = async (req, res) => {
        var { FromDate, NewDate } = req.query;
    
        if (!FromDate || !NewDate) {
            return invalidInput(res, "Both FromDate and NewDate are required");
        }
    
        let transaction;
        try {
            const pool = await sql.connect();
            transaction = new sql.Transaction(pool);
            await transaction.begin();
    
            const request = new sql.Request(transaction);
            request.input("FromDate", sql.Date, FromDate);
            request.input("NewDate", sql.Date, NewDate);
    
            const query = `
                SELECT rm.*, pb.POS_Brand_Name, pm.Product_Name
                FROM tbl_Pos_Rate_Master rm
                LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
                LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
                WHERE Rate_Date = @FromDate
            `;
    
            const result = await request.query(query);
            const getMaxId = await getNextId({ table: "tbl_Pos_Rate_Master", column: "Id" });
    
            if (!checkIsNumber(getMaxId.MaxId)) {
                await transaction.rollback();
                return failed(res, "Error generating RateMaster");
            }
    
            let newId = getMaxId.MaxId;
    
            if (result.recordset.length > 0) {
                const records = result.recordset;
    
                await deleteRecords(records, transaction, NewDate);
                await insertRecords(records, newId, transaction, NewDate);
    
                await transaction.commit();
                return success(res, "Records successfully updated and inserted into both tables");
            } else {
                await transaction.rollback();
                return noData(res, "No records found for the given date range");
            }
        } catch (e) {
            if (transaction) await transaction.rollback();
            return servError(e,res);
        }
    };
    
    const deleteRecords = async (records, transaction, NewDate) => {
        for (const record of records) {
            const requestDelete = new sql.Request(transaction);
            requestDelete.input("Rate_Date", sql.Date, NewDate); 
            requestDelete.input("Item_Id", sql.Int, record.Item_Id);
    
            await requestDelete.query(`
                DELETE FROM tbl_Pos_Rate_Master
                WHERE Rate_Date = @Rate_Date AND Item_Id = @Item_Id
            `);
        }
    };
    
    const insertRecords = async (records, newId, transaction, NewDate) => {
     
        for (const record of records) {
            const requestInsert = new sql.Request(transaction);
            requestInsert.input("Id", newId++);
            requestInsert.input("Rate_Date",  NewDate); 
            requestInsert.input("Pos_Brand_Id", record.Pos_Brand_Id);
            requestInsert.input("Item_Id",  record.Item_Id);
            requestInsert.input("Rate",  record.Rate);
            requestInsert.input("Max_Rate",  record.Max_Rate);
            requestInsert.input("Is_Active_Decative",  record.Is_Active_Decative);
    
            await requestInsert.query(`
                INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate,Max_Rate,Is_Active_Decative)
                VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate,@Max_Rate, @Is_Active_Decative)
            `);
    
            // const requestProInsert = new sql.Request(transaction);
            // requestProInsert.input("Rate_Date",  NewDate);
            // requestProInsert.input("Item_Id",  record.Item_Id);
            // requestProInsert.input("Rate",  record.Rate);
            // requestProInsert.input("Is_Active_Decative",  record.Is_Active_Decative);
    
            // await requestProInsert.query(`
            //     UPDATE tbl_Product_Master SET Product_Rate=@Rate, IsActive=@Is_Active_Decative WHERE Product_Id=@Item_Id
            // `);
        }
    };
    
    
    const valuesSync = async (req, res) => {
        try {
            const { invoiceId } = req.query;
    
            if (!invoiceId) {
                return res.status(400).json({
                    data: [],
                    message: "No invoiceId FOUND",
                    success: false,
                });
            }
    
            const apiUrl = `https://smtraders.posbill.in/api/fetchbilldata.php?invoiceid=${invoiceId}`;

            const response = await fetch(apiUrl);
            const data = await response.json();
 
            if (!data.invoice_data || data.invoice_data.length === 0 || data.status === "error") {
                return res.status(400).json({
                    data: [],
                    success: false,
                    message: "No Data Found",
                    invoiceId: invoiceId,
                });
            }
    
            const invoice = data.invoice_data[0] || {};
            const { invoiceno = 0, edate, cusid = 0, namount = 0, items = [] } = invoice;
    
            const result1 = await new sql.Request()
                .input("Pos_Id", sql.BigInt, invoiceno)
                .query(`SELECT Pre_Id FROM tbl_Pre_Sales_Order_Gen_Info WHERE Pos_Id = @Pos_Id`);
    
            if (result1.recordset.length > 0) {
                const getId = result1.recordset[0].Pre_Id;
    
                await new sql.Request()
                    .input("Pre_Id", getId)
                    .input("Pos_Id", invoiceno)
                    .input("Pre_Date", edate)
                    .input("Custome_Id", cusid)
                    .input("Total_Invoice_value", namount)
                    .input("Cancel_status", sql.NVarChar, "Pending")
                    .query(`
                        UPDATE tbl_Pre_Sales_Order_Gen_Info 
                        SET Pos_Id = @Pos_Id, 
                            Pre_Date = @Pre_Date, 
                            Custome_Id = @Custome_Id, 
                            Total_Invoice_value = @Total_Invoice_value, 
                            isConverted = 0, 
                            Cancel_status = @Cancel_status
                        WHERE Pre_Id = @Pre_Id
                    `);
    
                await new sql.Request()
                    .input("Pre_Id", getId)
                    .query(`DELETE FROM tbl_Pre_Sales_Order_Stock_Info WHERE Pre_Id = @Pre_Id`);
    
                const productsData = (await getProducts()).dataArray || [];
                let sNo = 1;
    
                for (const item of items) {
                    const product = findProductDetails(productsData, item.icode) || {};
                    await new sql.Request()
                        .input("Pre_Id", getId)
                        .input("Pos_Id", invoiceno)
                        .input("S_No", sNo++)
                        .input("Item_Id", item.icode || 0)
                        .input("Unit_Id", product.UOM_Id || 0)
                        .input("Bill_Qty", item.qty || 0)
                        .input("Rate", item.sell || 0)
                        .input("Amount", (item.sell || 0) * (item.qty || 0))
                        .query(`
                            INSERT INTO tbl_Pre_Sales_Order_Stock_Info 
                            (Pre_Id, Pos_Id, S_No, Item_Id, Unit_Id, Bill_Qty, Rate, Amount)
                            VALUES (@Pre_Id, @Pos_Id, @S_No, @Item_Id, @Unit_Id, @Bill_Qty, @Rate, @Amount)
                        `);
                }
    
                return res.status(200).json({
                    data,
                    message: "Data Updated Successfully",
                    invoiceId: invoiceno,
                    success: true,
                });
            } else {
                const getId = await getNextId({
                    table: "tbl_Pre_Sales_Order_Gen_Info",
                    column: "Pre_Id",
                });
    
                const newPreId = getId.MaxId;

                await new sql.Request()
                    .input("Pre_Id", newPreId)
                    .input("Pos_Id", invoiceno)
                    .input("Pre_Date", edate)
                    .input("Custome_Id", cusid)
                    .input("Total_Invoice_value", namount)
                    .input("Cancel_status",  "Pending")
                    .query(`
                        INSERT INTO tbl_Pre_Sales_Order_Gen_Info 
                        (Pre_Id, Pos_Id, Pre_Date, Custome_Id, Total_Invoice_value, isConverted, Cancel_status, Created_by, Created_on)
                        VALUES (@Pre_Id, @Pos_Id, @Pre_Date, @Custome_Id, @Total_Invoice_value, 0, @Cancel_status, 0, GETDATE())
                    `);
    
                const productsData = (await getProducts()).dataArray || [];
                let sNo = 1;
    
                for (const item of items) {
                    const product = findProductDetails(productsData, item.icode) || {};
                    await new sql.Request()
                        .input("Pre_Id", newPreId)
                        .input("Pos_Id", invoiceno)
                        .input("S_No", sNo++)
                        .input("Item_Id", item.icode || 0)
                        .input("Unit_Id", product.UOM_Id || 0)
                        .input("Bill_Qty", item.qty || 0)
                        .input("Rate", item.sell || 0)
                        .input("Amount", (item.sell || 0) * (item.qty || 0))
                        .query(`
                            INSERT INTO tbl_Pre_Sales_Order_Stock_Info 
                            (Pre_Id, Pos_Id, S_No, Item_Id, Unit_Id, Bill_Qty, Rate, Amount)
                            VALUES (@Pre_Id, @Pos_Id, @S_No, @Item_Id, @Unit_Id, @Bill_Qty, @Rate, @Amount)
                        `);
                }
    
                return res.status(200).json({
                    data,
                    message: "Data Sync Successfully",
                    invoiceId: invoiceno,
                    success: true,
                });
            }
        } catch (error) {
          
            return res.status(500).json({
                message: "Internal Server Error. Please try again.",
                success: false,
            });
        }
    };
    
    const posProductSync = async (req, res) => {
        try {
            const response = await fetch("https://smtraders.posbill.in/api/interproductapi.php");
            const data = await response.json();
    
         
                success(res, data.data);
            
    
        } catch (error) {
            return servError(error, res);
        }
    };
    



const posProductList = async (req, res) => {
    const { FromDate, ToDate } = req.query;

    try {
     
        const response = await fetch(`https://smtraders.posbill.in/api/fetchbilldata.php?from=${FromDate}&to=${ToDate}`);
        const data = await response.json();

        if (!data || !data.invoice_data) {
            return success(res, 'No Invoce Id');
        }
        else if(data.length<=0){
            return success(res, []);
        }

        let PosSyncData = data.invoice_data;

    
        const retailerResult = await new sql.Request()
            .query(`SELECT Retailer_Id, Retailer_Name FROM tbl_Retailers_Master`);
        
        const retailerMap = {};
        retailerResult.recordset.forEach(row => {
            retailerMap[row.Retailer_Id] = row.Retailer_Name;
        });

    
        const productResult = await new sql.Request()
            .query(`SELECT Product_Id, product_name FROM tbl_Product_Master`);
        
        const productMap = {};
        productResult.recordset.forEach(row => {
            productMap[row.Product_Id] = row.product_name;
        });

      
        PosSyncData = PosSyncData.map(invoice => ({
            ...invoice,
            Retailer_Name: retailerMap[invoice.cusid] || "0",  
            items: invoice.items.map(item => ({
                ...item,
                product_name: productMap[item.icode] || "0" 
            }))
        }));

       
        const result = await new sql.Request()
            .input("FromDate", sql.Date, FromDate)
            .input("ToDate", sql.Date, ToDate)
            .query(`
                SELECT 
                    i.Pre_Id AS Pre_Id,
                    i.Pos_Id AS invoiceno,
                    i.Pre_Date AS edate,
                    i.Custome_Id AS cusid,
                    i.Total_Invoice_Value AS namount,
                    rm.Retailer_Name,
                    (
                        SELECT 
                            ii.Item_Id AS icode,
                            pm.product_name,
                            ii.Unit_Id AS uom,
                            ii.Bill_Qty AS qty,
                            ii.Rate AS sell
                        FROM tbl_Pre_Sales_Order_Stock_Info ii
                        LEFT JOIN tbl_Product_Master pm ON ii.Item_Id = pm.Product_Id
                        WHERE ii.Pre_Id = i.Pre_Id
                        FOR JSON PATH
                    ) AS stock_info
                FROM tbl_Pre_Sales_Order_Gen_Info i
                LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = i.Custome_Id
                WHERE i.Pre_Date >= @FromDate AND i.Pre_Date <=@ToDate
                ORDER BY i.Pre_Id
            `);

        const invoices = {};

        result.recordset.forEach(row => {
            if (!invoices[row.invoiceno]) {
                invoices[row.invoiceno] = {
                    Pre_Id: row.Pre_Id,
                    invoiceno: row.invoiceno,
                    edate: row.edate,
                    cusid: row.cusid,
                    namount: row.namount,
                    Retailer_Name: row.Retailer_Name,
                    items: row.stock_info ? JSON.parse(row.stock_info) : []
                };
            }
        });

        const invoiceData = Object.values(invoices);

        return dataFound(res, PosSyncData, 'dataFound', {
            tallyResult: invoiceData
        });

    } catch (error) {
        return servError(error, res);
    }
};


return {

        getPosRateMaster,
        postPosRateMaster,
        putPosRateMaster,
        deletePosRateMaster,
        getProductDropdown,
        postbulkExport,
        valuesSync,
        posProductSync,
        posProductList
    }
}

export default posBranchController();