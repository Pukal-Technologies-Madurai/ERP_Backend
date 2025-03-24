import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
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
            return invalidInput(res, 'FromDate and ToDate are required');
        }
    
        try {
            const request = new sql.Request();
    
           
            let query = `
               SELECT rm.*,pb.POS_Brand_Name,pm.Product_Name
                FROM tbl_Pos_Rate_Master rm
				left join  tbl_POS_Brand pb on pb.POS_Brand_Id=rm.Pos_Brand_Id
				LEFT JOIN tbl_Product_Master pm on pm.Product_Id=rm.Item_Id
                WHERE Rate_Date = @FromDate
            `;
    
            if (FromDate) {
                query += ` AND Rate_Date = @FromDate`; 
                request.input('FromDate', sql.Date, FromDate);
            }
    
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
    
            const query3 = `SELECT * FROM tbl_Pro_Rate_Master WHERE Product_Id=@Item_Id`;
            const result3 = await request3.query(query3);
    
        
            if (result3.recordset.length > 0) {
                const request4 = new sql.Request();
                request4.input('Rate_Date', formattedRateDate);
                request4.input('Item_Id', Item_Id);
                const query4 = `DELETE FROM tbl_Pro_Rate_Master WHERE  Product_Id=@Item_Id`;
                await request4.query(query4);
            }
    
    
            const request6 = new sql.Request();
            request6.input('Rate_Date', formattedRateDate);
            request6.input('Item_Id', Item_Id);
            request6.input('Rate', Rate);
            request6.input('Is_Active_Decative', Is_Active_Decative);
    
            const query6 = `
                INSERT INTO tbl_Pro_Rate_Master (Rate_Date, Product_Id, Product_Rate, Is_Active_Dective) 
                VALUES (@Rate_Date, @Item_Id, @Rate, @Is_Active_Decative)
            `;
    
            await request6.query(query6);
  
            const request7 = new sql.Request();
            const currentDateTime = new Date();
            const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
            request7.input('Last_Update_Time', formattedDateTime); 
    
            const updateQuery = `
                UPDATE tbl_POS_Table_Synch
                SET Last_Update_Time = @Last_Update_Time
                WHERE Sync_Table_Id = 5
            `;
            await request7.query(updateQuery);
    
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
        const {Id, Rate_Date,Pos_Brand_Id,Item_Id,Rate,Is_Active_Decative } = req.body;

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
    
            const query3 = `SELECT * FROM tbl_Pro_Rate_Master WHERE  Product_Id=@Item_Id`;
            const result3 = await request3.query(query3);
    
            if (result3.recordset.length > 0) {
                const request4 = new sql.Request();
                request4.input('Item_Id', Item_Id);
                const query4 = `DELETE FROM tbl_Pro_Rate_Master WHERE Product_Id=@Item_Id`;
                await request4.query(query4);
            }
    
          
            const request6 = new sql.Request();
            request6.input('Rate_Date', Rate_Date);
            request6.input('Item_Id', Item_Id);
            request6.input('Rate', Rate);
            request6.input('Is_Active_Decative', Is_Active_Decative);
    
            const query6 = `INSERT INTO tbl_Pro_Rate_Master (Rate_Date, Product_Id, Product_Rate, Is_Active_Dective) 
                            VALUES (@Rate_Date, @Item_Id, @Rate, @Is_Active_Decative)`;
    
            const result6 = await request6.query(query6);

     
           
                const request7 = new sql.Request();
                const currentDateTime = new Date();
                const formattedDateTime = `${currentDateTime.getFullYear()}/${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}/${currentDateTime.getDate().toString().padStart(2, '0')} ${currentDateTime.getHours().toString().padStart(2, '0')}:${currentDateTime.getMinutes().toString().padStart(2, '0')}`;
                request7.input('Last_Update_Time', formattedDateTime); 
        
                const updateQuery = `
                    UPDATE tbl_POS_Table_Synch
                    SET Last_Update_Time = @Last_Update_Time
                    WHERE Sync_Table_Id = 5
                `;
                await request7.query(updateQuery);

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
             return invalidInput(res, 'Id is required')
         }
 
         try {
             const request = new sql.Request();
             request.input('Id', Id);
            
             const result = await request.query(`
                 DELETE tbl_Pos_Rate_Master where Id=@Id
             `);
             if (result.rowsAffected[0] > 0) {
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
    
             
                const deletePromises = records.map(async (record) => {
                    const requestDelete = new sql.Request();
                    requestDelete.input('Item_Id', sql.Int, record.Item_Id);
    
                    const queryDelete = `
                        DELETE FROM tbl_Pro_Rate_Master
                        WHERE  Product_Id = @Item_Id
                    `;
    
                    await requestDelete.query(queryDelete);
                });
    
      
                await Promise.all(deletePromises);
    
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
                        INSERT INTO tbl_Pro_Rate_Master (Rate_Date, Product_Id, Product_Rate,Is_Active_Dective)
                        VALUES (@Rate_Date, @Item_Id, @Rate,@Is_Active_Decative)
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
    

    return {
      
        getPosRateMaster,
        postPosRateMaster,
        putPosRateMaster,
        deletePosRateMaster,
        getProductDropdown,
        postbulkExport
    }
}

export default posBranchController();