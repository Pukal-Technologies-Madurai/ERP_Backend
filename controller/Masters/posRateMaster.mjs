import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';


import fetch from 'node-fetch';
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
                SELECT rm.Id, rm.Rate_Date, rm.Pos_Brand_Id, rm.Item_Id, rm.Rate, 
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
        const { Rate_Date, Pos_Brand_Id, Item_Id, Rate, Is_Active_Decative } = req.body;

        if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Rate || !Is_Active_Decative) {
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
            request6.input('Rate', Rate);
            request6.input('Is_Active_Decative', Is_Active_Decative);

            const query6 = `
                update tbl_Product_Master SET Product_Rate=@Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id
                
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
            request5.input('Is_Active_Decative', Is_Active_Decative);

            const query5 = `
                INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate, Is_Active_Decative) 
                VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate, @Is_Active_Decative)
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
        const { Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate, Is_Active_Decative } = req.body;

        if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Id) {
            return invalidInput(res, 'Rate_Date,Pos_Brand,Item is required')
        }

        try {
            const request = new sql.Request();
            request.input('Id', Id);
            request.input('Rate_Date', Rate_Date);
            request.input('Pos_Brand_Id', Pos_Brand_Id);
            request.input('Item_Id', Item_Id);
            request.input('Rate', Rate);
            request.input('Is_Active_Decative', Is_Active_Decative);
            const result = await request.query(`
                UPDATE tbl_Pos_Rate_Master
                SET Rate = @Rate,
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
            request6.input('Is_Active_Decative', Is_Active_Decative);

            const query6 = `update tbl_Product_Master SET Product_Rate=@Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id`;

            const result6 = await request6.query(query6);


            if (result.rowsAffected[0] > 0) {
         
                return success(res, 'Rate Master updated successfully');
            } else {
                return failed(res, 'No changes were made, the Rate Master not exist');
            }
        } catch (e) {

            console.error('Database error:', e);
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
            return servError(res, e);
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
        const { FromDate, NewDate } = req.query;

        if (!FromDate || !NewDate) {
            return invalidInput(res, 'FromDate, and NewDate are required');
        }

        try {
            const request = new sql.Request();


            let query = `
                SELECT rm.*, pb.POS_Brand_Name, pm.Product_Name
                FROM tbl_Pos_Rate_Master rm
                LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
                LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
                WHERE Rate_Date = @FromDate
            `;
            request.input('FromDate', sql.Date, FromDate);

            const result = await request.query(query);

            const getMaxId = await getNextId({ table: 'tbl_Pos_Rate_Master', column: 'Id' });

            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating RateMaster');
            }

            let newId = getMaxId.MaxId;


            if (result.recordset.length > 0) {
                const records = result.recordset;


                // const deletePromises = records.map(async (record) => {
                //     const requestDelete = new sql.Request();
                //     requestDelete.input('Item_Id', sql.Int, record.Item_Id);

                //     const queryDelete = `
                //         DELETE FROM tbl_Pro_Rate_Master
                //         WHERE  Product_Id = @Item_Id
                //     `;

                //     await requestDelete.query(queryDelete);
                // });


                // await Promise.all(deletePromises);

                const deletePromisesData = records.map(async (record) => {
                    const requestDelete1 = new sql.Request();
                    requestDelete1.input('Rate_Date', sql.Date, NewDate);
                    requestDelete1.input('Item_Id', sql.Int, record.Item_Id);

                    const queryDelete1 = `
                        DELETE FROM tbl_Pos_Rate_Master
                        WHERE Rate_Date=@Rate_Date AND Item_Id = @Item_Id
                    `;

                    await requestDelete1.query(queryDelete1);
                });


                await Promise.all(deletePromisesData);

                const insertPromises = records.map(async (record) => {
                    const requestInsert = new sql.Request();
                    requestInsert.input('Id', sql.Int, newId++);
                    requestInsert.input('Rate_Date', sql.Date, NewDate);
                    requestInsert.input('Pos_Brand_Id', sql.Int, record.Pos_Brand_Id);
                    requestInsert.input('Item_Id', sql.Int, record.Item_Id);
                    requestInsert.input('Rate', sql.Decimal, record.Rate);
                    requestInsert.input('Is_Active_Decative', sql.Int, record.Is_Active_Decative);

                    const queryInsert = `
                        INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate, Is_Active_Decative)
                        VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate, @Is_Active_Decative)
                    `;
                    await requestInsert.query(queryInsert);

                    const requestProInsert = new sql.Request();
                    requestProInsert.input('Rate_Date', sql.Date, NewDate);
                    requestProInsert.input('Item_Id', sql.Int, record.Item_Id);
                    requestProInsert.input('Rate', sql.Decimal, record.Rate);
                    requestProInsert.input('Is_Active_Decative', sql.Int, record.Is_Active_Decative);
                    const queryProInsert = `
                    UPDATE tbl_Product_Master SET Product_Rate=@Item_Id,isActive=@Is_Active_Decative where Product_Id=@Item_Id
                    `;

                    await requestProInsert.query(queryProInsert);
                });

                await Promise.all(insertPromises);
            
                return success(res, 'Records successfully updated and inserted into both tables');
            } else {
                return noData(res, 'No records found for the given date range');
            }
        } catch (e) {
            console.error('Error occurred while processing the request:', e);
            return servError(e, res);
        }
    };



    const valuesSync = async (req, res) => {
        try {
            const { invoiceId } = req.query;
    
            if (!invoiceId) {
                return invalidInput(res, "No invoice id");
            }
    
            const apiUrl = `https://smtraders.posbill.in/api/fetchbilldata.php?invoiceid=${invoiceId}`;
            const response = await axios.get(apiUrl);
            const data = response.data;
    
            if (!data.invoice_data || data.invoice_data.length === 0) {
                return invalidInput(res, "No invoice data found.");
            }
    
            const invoice = data.invoice_data[0];
            const { invoiceno, edate, cusid, namount, items } = invoice;
    
            const posId = (invoiceno) || 0;
            const customerId = (cusid) || 0;
            const totalInvoiceValue = (namount) || 0;
    
         
            const result1 = await new sql.Request()
                .input("Pos_Id", sql.BigInt, posId)
                .query(`SELECT Pre_Id FROM tbl_Pre_Sales_Order_Gen_Info WHERE Pos_Id = @Pos_Id`);
    
            if (result1.recordset.length > 0) {
                const getId = result1.recordset[0].Pre_Id;
               
    
               
                await new sql.Request()
                .input("Pre_Id",  getId)
                    .query(`DELETE FROM tbl_Pre_Sales_Order_Gen_Info WHERE Pre_Id = @Pre_Id`);
    
                await new sql.Request()
                .input("Pre_Id", sql.BigInt, getId)
                    .query(`DELETE FROM tbl_Pre_Sales_Order_Stock_Info WHERE Pre_Id = @Pre_Id`);
    
            
                await new sql.Request()
                    .input("Pre_Id",  getId)
                    .input("Pos_Id", posId)
                    .input("Pre_Date",  edate)
                    .input("Custome_Id", customerId)
                    .input("Total_Invoice_value",  totalInvoiceValue)
                    .input("Cancel_status", sql.NVarChar, '0') 
                    .query(
                        `INSERT INTO tbl_Pre_Sales_Order_Gen_Info 
                         (Pre_Id, Pos_Id, Pre_Date, Custome_Id, Total_Invoice_value, isConverted, Cancel_status, Created_by, Created_on)
                         VALUES (@Pre_Id, @Pos_Id, @Pre_Date, @Custome_Id, @Total_Invoice_value, 0, @Cancel_status, 0, GETDATE())`
                    );
    
              
                let sNo = 1;
                for (const item of items) {
                    await new sql.Request()
                        .input("Pre_Id", getId)
                        .input("Pos_Id", posId)
                        .input("S_No", sNo++)
                        .input("Item_Id",  (item.icode) || 0)
                        .input("Unit_Id",  (item.uom) || '')
                        .input("Bill_Qty",(item.qty) || 0)
                        .input("Rate", (item.sell) || 0)
                        .input("Amount",  (parseFloat(item.sell) || 0) * (parseInt(item.qty) || 0))
                        .query(
                            `INSERT INTO tbl_Pre_Sales_Order_Stock_Info 
                             (Pre_Id, Pos_Id, S_No, Item_Id,Unit_Id, Bill_Qty, Rate, Amount)
                             VALUES (@Pre_Id, @Pos_Id, @S_No, @Item_Id,@Unit_Id, @Bill_Qty, @Rate, @Amount)`
                        );
                }
    
                return success(res,"Data Sync Successfully")
            } else {
               
                const getId = await getNextId({
                    table: "tbl_Pre_Sales_Order_Gen_Info",
                    column: "Pre_Id",
                });
    
                const newPreId = getId.MaxId;
             
    
            
                await new sql.Request()
                    .input("Pre_Id",  newPreId)
                    .input("Pos_Id",  posId)
                    .input("Pre_Date",  edate)
                    .input("Custome_Id", customerId)
                    .input("Total_Invoice_value", totalInvoiceValue)
                    .input("Cancel_status", sql.NVarChar, '0')
                    .query(
                        `INSERT INTO tbl_Pre_Sales_Order_Gen_Info 
                         (Pre_Id, Pos_Id, Pre_Date, Custome_Id, Total_Invoice_value, isConverted, Cancel_status, Created_by, Created_on)
                         VALUES (@Pre_Id, @Pos_Id, @Pre_Date, @Custome_Id, @Total_Invoice_value, 0, @Cancel_status, 0, GETDATE())`
                    );
    
              
                let sNo = 1;
                for (const item of items) {
                    await new sql.Request()
                        .input("Pre_Id", newPreId)
                        .input("Pos_Id", posId)
                        .input("S_No",  sNo++)
                        .input("Item_Id", item.icode || 0)
                        .input("Unit_Id",item.uom || '')
                        .input("Bill_Qty", item.qty || 0)
                        .input("Rate",  item.sell || 0)
                        .input("Amount",  (item.sell || 0) * (item.qty) || 0)
                        .query(
                            `INSERT INTO tbl_Pre_Sales_Order_Stock_Info 
                             (Pre_Id, Pos_Id, S_No, Item_Id,Unit_Id, Bill_Qty, Rate, Amount)
                             VALUES (@Pre_Id, @Pos_Id, @S_No, @Item_Id,@Unit_Id, @Bill_Qty, @Rate, @Amount)`
                        );
                }
    
                return success(res,"Data Sync Successfully")
            }
        } catch (error) {
        
            return servError(res, error);
        }
    };
    
    const posProductSync = async (req, res) => {
        try {
            const response = await fetch("https://smtraders.posbill.in/api/interproductapi.php");
            const data = await response.json();

            if (data) {
                success(res, data.data)
            }
            else {
                failed(res, "Failed to sync POS products")
            }

        } catch (error) {
            console.error("Error fetching POS product data:", error);
            servError(res, "Internal server error")
        }
    }
    return {

        getPosRateMaster,
        postPosRateMaster,
        putPosRateMaster,
        deletePosRateMaster,
        getProductDropdown,
        postbulkExport,
        valuesSync,
        posProductSync
    }
}

export default posBranchController();