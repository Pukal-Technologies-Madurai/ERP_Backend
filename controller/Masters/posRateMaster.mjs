import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';
import { getProducts, getNextId } from '../../middleware/miniAPIs.mjs';
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

        // Query for Pos Rate Master
        let posRateQuery = `
            SELECT rm.Id, rm.Rate_Date,rm.Min_Rate, rm.Pos_Brand_Id, rm.Item_Id, rm.Rate, rm.Max_Rate, 
                   pb.POS_Brand_Name, pm.Product_Name, pm.Short_Name, 
                   pm.isActive AS Is_Active_Decative, rm.Brand_Level, rm.Item_Level
            FROM tbl_Pos_Rate_Master rm
            LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
            LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
            WHERE rm.Rate_Date = @FromDate
            ORDER BY pm.IsActive DESC
        `;

        // Query for Rate Gen - Get only the fields that exist
        let rateGenQuery = `
            SELECT 
                rg.Id,
                rg.Rate_Date,
                rg.Rate_time
               
            FROM tbl_Rate_Gen rg
            WHERE rg.Rate_Date = @FromDate
            ORDER BY rg.Rate_time DESC
        `;

        request.input('FromDate', sql.Date, FromDate);

        // Execute both queries
        const posRateResult = await request.query(posRateQuery);
        const rateGenResult = await request.query(rateGenQuery);

        const combinedResults = {
            posRateMaster: posRateResult.recordset,
            rateGen: rateGenResult.recordset,
            totalPosRateRecords: posRateResult.recordset.length,
            totalRateGenRecords: rateGenResult.recordset.length,
            fromDate: FromDate
        };

        if (combinedResults.totalPosRateRecords > 0 || combinedResults.totalRateGenRecords > 0) {
            return dataFound(res, combinedResults);
        } else {
            return noData(res);
        }
    } catch (e) {
        return servError(e, res);
    }
};
    const postPosRateMaster = async (req, res) => {
        const { Rate_Date, Pos_Brand_Id, Item_Id, Rate, MinRate,MaxRate, Is_Active_Decative, Brand_Level, Item_Level, Short_Name } = req.body;

        if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Rate || !Is_Active_Decative || !MaxRate || !MinRate) {
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
            request6.input('Min_Rate', MinRate)
            request6.input('Max_Rate', MaxRate)
            request6.input('Rate', Rate);
            request6.input('Is_Active_Decative', Is_Active_Decative);

            const query6 = `
                update tbl_Product_Master SET Product_Rate=@Rate,Min_Rate=@Min_Rate,Max_Rate=@Max_Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id
                
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
            request5.input('Min_Rate', MinRate);
            request5.input('Max_Rate', MaxRate);
            request5.input('Is_Active_Decative', Is_Active_Decative);
            request5.input('Brand_Level', Brand_Level);
            request5.input('Item_Level', Item_Level);

            const query5 = `
                INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate,Min_Rate, Max_Rate, Is_Active_Decative,Brand_Level,Item_Level) 
                VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate,@Min_Rate,@Max_Rate,@Is_Active_Decative,@Brand_Level,@Item_Level)
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

    // const putPosRateMaster = async (req, res) => {
    //     const { Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate, MaxRate, Is_Active_Decative } = req.body;

    //     if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Id | !MaxRate) {
    //         return invalidInput(res, 'Rate_Date,Pos_Brand,Item is required')
    //     }

    //     try {
    //         const request = new sql.Request();
    //         request.input('Id', Id);
    //         request.input('Rate_Date', Rate_Date);
    //         request.input('Pos_Brand_Id', Pos_Brand_Id);
    //         request.input('Item_Id', Item_Id);
    //         request.input('Rate', Rate);
    //         request.input('Max_Rate', MaxRate);
    //         request.input('Is_Active_Decative', Is_Active_Decative);
    //         const result = await request.query(`
    //             UPDATE tbl_Pos_Rate_Master
    //             SET Rate = @Rate,
    //             Max_Rate=@Max_Rate,
    //             Pos_Brand_Id=@Pos_Brand_Id,
    //             Rate_Date=@Rate_Date,
    //             Item_Id=@Item_Id,
    //             Is_Active_Decative=@Is_Active_Decative
    //             WHERE Id=@Id
    //         `);


    //         const request3 = new sql.Request();
    //         request3.input('Item_Id', Item_Id);

    //         const query3 = `SELECT * FROM tbl_Product_Master WHERE Product_Id=@Item_Id`;
    //         const result3 = await request3.query(query3);

    //         // if (result3.recordset.length > 0) {
    //         //     const request4 = new sql.Request();
    //         //     request4.input('Item_Id', Item_Id);
    //         //     const query4 = `DELETE FROM tbl_Pro_Rate_Master WHERE Product_Id=@Item_Id`;
    //         //     await request4.query(query4);
    //         // }


    //         const request6 = new sql.Request();
    //         request6.input('Rate_Date', Rate_Date);
    //         request6.input('Item_Id', Item_Id);
    //         request6.input('Rate', Rate);
    //         request6.input('Max_Rate', MaxRate)
    //         request6.input('Is_Active_Decative', Is_Active_Decative);

    //         const query6 = `update tbl_Product_Master SET Product_Rate=@Rate,Max_Rate=@Max_Rate,isActive=@Is_Active_Decative where Product_Id=@Item_Id`;

    //         const result6 = await request6.query(query6);


    //         if (result.rowsAffected[0] > 0) {

    //             return success(res, 'Rate Master updated successfully');
    //         } else {
    //             return failed(res, 'No changes were made, the Rate Master not exist');
    //         }
    //     } catch (e) {


    //         return servError(e, res);
    //     }
    // };

const putPosRateMaster = async (req, res) => {
    const { 
        Id, 
        Rate_Date, 
        Pos_Brand_Id, 
        Item_Id, 
        Rate, 
        MinRate,
        MaxRate, 
        Is_Active_Decative,
        Brand_Level,
        Item_Level,
        Short_Name,
        Old_Rate,
        Old_Min_Rate,
        Old_Max_Rate,
        Rate_time,
        Updated_By
    } = req.body;

  
    if (!Rate_Date || !Pos_Brand_Id || !Item_Id || !Id) {
        return invalidInput(res, 'Rate_Date, Pos_Brand_Id, Item_Id, and Id are required');
    }

    try {

        const getCurrentRequest = new sql.Request();
        getCurrentRequest.input('Id', sql.Int, parseInt(Id));
        const currentResult = await getCurrentRequest.query(`
            SELECT 
                Rate, 
                Min_Rate, 
                Max_Rate, 
                Is_Active_Decative, 
                Brand_Level, 
                Item_Level 
            FROM tbl_Pos_Rate_Master 
            WHERE Id = @Id
        `);
        
        let rateChanged = false;
        let maxRateChanged = false;
        let minRateChanged = false;
        let activeStatusChanged = false; 
        let currentRate = null;
        let currentMinRate = null;
        let currentMaxRate = null;
        let currentActiveStatus = null;
        
        if (currentResult.recordset.length > 0) {
            const current = currentResult.recordset[0];
            currentRate = current.Rate;
            currentMinRate = current.Min_Rate;
            currentMaxRate = current.Max_Rate;
            currentActiveStatus = current.Is_Active_Decative;
            
            rateChanged = Rate !== undefined && parseFloat(Rate) !== parseFloat(current.Rate);
            minRateChanged = MinRate !== undefined && parseFloat(MinRate) !== parseFloat(current.Min_Rate);
            maxRateChanged = MaxRate !== undefined && parseFloat(MaxRate) !== parseFloat(current.Max_Rate);
            activeStatusChanged = Is_Active_Decative !== undefined && 
                                  parseInt(Is_Active_Decative) !== parseInt(current.Is_Active_Decative);
        }
        
        const rateOrMaxRateChanged = rateChanged || maxRateChanged || minRateChanged;
        const needsProductSync = rateOrMaxRateChanged || activeStatusChanged; 

      
        const request = new sql.Request();
        request.input('Id', sql.Int, parseInt(Id));
        request.input('Rate_Date', sql.Date, new Date(Rate_Date));
        request.input('Pos_Brand_Id', sql.Int, parseInt(Pos_Brand_Id));
        request.input('Item_Id', sql.Int, parseInt(Item_Id));
        request.input('Rate', sql.Decimal(18, 2), parseFloat(Rate) || 0);
        request.input('Min_Rate', sql.Decimal(18, 2), parseFloat(MinRate) || 0);
        request.input('Max_Rate', sql.Decimal(18, 2), parseFloat(MaxRate) || 0);
        request.input('Is_Active_Decative', sql.Int, parseInt(Is_Active_Decative));
        
        if (Brand_Level !== undefined && Brand_Level !== null) {
            request.input('Brand_Level', sql.VarChar(255), Brand_Level.toString());
        }
        if (Item_Level !== undefined && Item_Level !== null) {
            request.input('Item_Level', sql.VarChar(255), Item_Level.toString());
        }
        
        let updateQuery = `
            UPDATE tbl_Pos_Rate_Master
            SET 
                Rate = @Rate,
                Min_Rate = @Min_Rate,
                Max_Rate = @Max_Rate,
                Pos_Brand_Id = @Pos_Brand_Id,
                Rate_Date = @Rate_Date,
                Item_Id = @Item_Id,
                Is_Active_Decative = @Is_Active_Decative
        `;
        
        if (Brand_Level !== undefined && Brand_Level !== null) {
            updateQuery += `, Brand_Level = @Brand_Level`;
        }
        if (Item_Level !== undefined && Item_Level !== null) {
            updateQuery += `, Item_Level = @Item_Level`;
        }
        
        updateQuery += ` WHERE Id = @Id`;
        
        const result = await request.query(updateQuery);

       
        if (needsProductSync) {
            const productRequest = new sql.Request();
            productRequest.input('Item_Id', sql.Int, parseInt(Item_Id));
            productRequest.input('Rate', sql.Decimal(18, 2), parseFloat(Rate) || 0);
            productRequest.input('Min_Rate', sql.Decimal(18, 2), parseFloat(MinRate) || 0);
            productRequest.input('Max_Rate', sql.Decimal(18, 2), parseFloat(MaxRate) || 0);
            productRequest.input('Is_Active_Decative', sql.Int, parseInt(Is_Active_Decative));
            
            await productRequest.query(`
                UPDATE tbl_Product_Master 
                SET 
                    Product_Rate = @Rate, 
                    Max_Rate = @Max_Rate, 
                    Min_Rate = @Min_Rate,
                    isActive = @Is_Active_Decative 
                WHERE Product_Id = @Item_Id
            `);
        }

      
        if (rateOrMaxRateChanged && Rate_time) {
            const formattedTime = Rate_time.length === 5 ? Rate_time + ':00' : Rate_time;

            const rateGenRequest = new sql.Request();
            rateGenRequest.input('Rate_Date', sql.Date, new Date(Rate_Date));
            rateGenRequest.input('Rate_time', sql.VarChar(50), formattedTime);

            const checkGen = await rateGenRequest.query(`
                SELECT COUNT(*) as cnt 
                FROM tbl_Rate_Gen 
                WHERE CAST(Rate_Date AS DATE) = CAST(@Rate_Date AS DATE)
            `);

            if (checkGen.recordset[0].cnt > 0) {
                await rateGenRequest.query(`
                    UPDATE tbl_Rate_Gen 
                    SET Rate_time = @Rate_time 
                    WHERE CAST(Rate_Date AS DATE) = CAST(@Rate_Date AS DATE)
                `);
            } else {
                const insertGenRequest = new sql.Request();
                insertGenRequest.input('Rate_Date', sql.Date, new Date(Rate_Date));
                insertGenRequest.input('Rate_time', sql.VarChar(50), formattedTime);

                await insertGenRequest.query(`
                    INSERT INTO tbl_Rate_Gen (Id, Rate_Date, Rate_time)
                    VALUES (
                        (SELECT ISNULL(MAX(Id), 0) + 1 FROM tbl_Rate_Gen),
                        @Rate_Date,
                        @Rate_time
                    )
                `);
            }
        }


        if (rateOrMaxRateChanged) {
            const historyRequest = new sql.Request();
            historyRequest.input('Updated_Date', sql.DateTime, new Date());
            historyRequest.input('Item_Id', sql.Int, parseInt(Item_Id));
          
            const oldRateValue = Old_Rate !== undefined ? parseFloat(Old_Rate) : (currentRate !== null ? currentRate : 0);
            const oldMinRateValue = Old_Min_Rate !== undefined ? parseFloat(Old_Min_Rate) : (currentMinRate !== null ? currentMinRate : 0);
            const oldMaxRateValue = Old_Max_Rate !== undefined ? parseFloat(Old_Max_Rate) : (currentMaxRate !== null ? currentMaxRate : 0);
            
            historyRequest.input('New_Rate', sql.Decimal(18, 2), parseFloat(Rate) || 0);
            historyRequest.input('Old_Rate', sql.Decimal(18, 2), oldRateValue);
            historyRequest.input('New_Min_Rate', sql.Decimal(18, 2), parseFloat(MinRate) || 0);
            historyRequest.input('Old_Min_Rate', sql.Decimal(18, 2), oldMinRateValue);
            historyRequest.input('New_Max_Rate', sql.Decimal(18, 2), parseFloat(MaxRate) || 0);
            historyRequest.input('Old_Max_Rate', sql.Decimal(18, 2), oldMaxRateValue);
            historyRequest.input('Updated_By', sql.VarChar(255), (Updated_By?.toString() || '0'));

            await historyRequest.query(`
                INSERT INTO tbl_Pos_Updated_Rate 
                (Id, Updated_Date, Item_Id, New_Rate, Old_Rate, New_Min_Rate, Old_Min_Rate, New_Max_Rate, Old_Max_Rate, Updated_By)
                VALUES (
                    (SELECT ISNULL(MAX(Id), 0) + 1 FROM tbl_Pos_Updated_Rate),
                    @Updated_Date, 
                    @Item_Id, 
                    @New_Rate, 
                    @Old_Rate, 
                    @New_Min_Rate, 
                    @Old_Min_Rate, 
                    @New_Max_Rate, 
                    @Old_Max_Rate, 
                    @Updated_By
                )
            `);
        }

      
        if (result.rowsAffected[0] > 0) {
            let message = 'Rate Master updated successfully';
            if (needsProductSync) {
                message = activeStatusChanged && !rateOrMaxRateChanged 
                    ? 'Rate Master updated successfully (Status synced to Product Master)'
                    : 'Rate Master updated successfully (Rates and Status synced to Product Master and History recorded)';
            }
            return success(res, message);
        } else {
            return failed(res, 'No changes were made, the Rate Master does not exist');
        }

    } catch (e) {
        console.error('Error updating rate master:', e);
        return servError(e, res);
    }
};

const bulkUpdatePosRateMaster = async (req, res) => {
    const { updates, Rate_Date, Rate_time } = req.body;

    // Validate input
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return invalidInput(res, 'Updates array is required and cannot be empty');
    }

    if (!Rate_Date) {
        return invalidInput(res, 'Rate_Date is required');
    }

    if (!Rate_time) {
        return invalidInput(res, 'Rate_time is required');
    }

    let transaction;

    try {
        // Start a transaction
        transaction = new sql.Transaction();
        await transaction.begin();

        let updatedCount = 0;

        // Process each update
        for (const update of updates) {
            // Parse IDs as integers
            const Id = parseInt(update.Id);
            const Item_Id = parseInt(update.Item_Id);
            const Rate = parseFloat(update.Rate) || 0;
            const Min_Rate = parseFloat(update.Min_Rate) || 0;
            const Max_Rate = parseFloat(update.Max_Rate) || 0;
            const Old_Rate = parseFloat(update.Old_Rate) || 0;
            const Old_Min_Rate = parseFloat(update.Old_Min_Rate) || 0;
            const Old_Max_Rate = parseFloat(update.Old_Max_Rate) || 0;

            const Updated_By = parseInt(update.Updated_By) || null;

            if (isNaN(Id) || isNaN(Item_Id)) {
                throw new Error(`Invalid update data: Invalid Id or Item_Id values`);
            }

            // 1. Update tbl_Pos_Rate_Master
            const request = new sql.Request(transaction);
            request.input('Id', sql.BigInt, Id);
            request.input('Rate', sql.Decimal(18, 2), Rate);
            request.input('Min_Rate', sql.Decimal(18, 2), Min_Rate);
            request.input('Max_Rate', sql.Decimal(18, 2), Max_Rate);
            request.input('Rate_Date', sql.Date, Rate_Date);
            
            const updateRateMasterResult = await request.query(`
                UPDATE tbl_Pos_Rate_Master
                SET Rate = @Rate,
                    Min_Rate = @Min_Rate,
                    Max_Rate = @Max_Rate,
                    Rate_Date = @Rate_Date
                WHERE Id = @Id
            `);

            if (updateRateMasterResult.rowsAffected[0] > 0) {
                updatedCount++;
            }

            // 2. Update tbl_Product_Master with new rates
            const request2 = new sql.Request(transaction);
            request2.input('Item_Id', sql.BigInt, Item_Id);
            request2.input('Rate', sql.Decimal(18, 2), Rate);
            request2.input('Min_Rate', sql.Decimal(18, 2), Min_Rate);
            request2.input('Max_Rate', sql.Decimal(18, 2), Max_Rate);
            
            await request2.query(`
                UPDATE tbl_Product_Master 
                SET Product_Rate = @Rate,
                    Min_Rate = @Min_Rate,
                    Max_Rate = @Max_Rate
                WHERE Product_Id = @Item_Id
            `);

            

        const request4 = new sql.Request(transaction);
        request4.input('Rate_Date', sql.Date, Rate_Date);
        request4.input('Rate_time', sql.NVarChar(10), Rate_time);
        
    
        const checkGenResult = await request4.query(`
            SELECT COUNT(*) as count FROM tbl_Rate_Gen WHERE Rate_Date = @Rate_Date
        `);
        
         const getMax= checkGenResult.recordset[0].count +  1;
         const rateGenId = getMax;
       
            request4.input('Id', sql.BigInt, rateGenId);
            await request4.query(`
                INSERT INTO tbl_Rate_Gen (Id,Rate_Date, Rate_time) 
                VALUES (@Id,@Rate_Date, @Rate_time)
            `);
      




            const request3 = new sql.Request(transaction);
            request3.input('Updated_Date', sql.DateTime, new Date());
            request3.input('Item_Id', sql.BigInt, Item_Id);
            request3.input('New_Rate', sql.Decimal(18, 2), Rate);
            request3.input('Old_Rate', sql.Decimal(18, 2), Old_Rate);
            request3.input('New_Max_Rate', sql.Decimal(18, 2), Max_Rate);
            request3.input('Old_Max_Rate', sql.Decimal(18, 2), Old_Max_Rate);
             request3.input('Gen_Id', sql.BigInt, rateGenId);
             request3.input('Updated_By', sql.VarChar, Updated_By?.toString() || '0');
            await request3.query(`
                INSERT INTO tbl_Pos_Updated_Rate 
                (Id,Updated_Date, Item_Id, New_Rate, Old_Rate, New_Min_Rate, Old_Min_Rate, New_Max_Rate, Old_Max_Rate, Updated_By,Gen_Id)
                VALUES ( (SELECT ISNULL(MAX(Id), 0) + 1 FROM tbl_Pos_Updated_Rate),@Updated_Date, @Item_Id, @New_Rate, @Old_Rate, @New_Max_Rate, @Old_Max_Rate, @Updated_By,@Gen_Id)
            `);
        }


     
        await transaction.commit();

        return success(res, `Successfully updated ${updatedCount} rate(s)`, {
            updatedCount: updatedCount,
            totalUpdates: updates.length,
            rateDate: Rate_Date,
            rateTime: Rate_time
        });

    } catch (error) {
        // Rollback transaction on error
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back transaction:', rollbackError);
            }
        }
        console.error('Error in bulk update:', error);
        return servError(error, res);
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

    // const postbulkExport = async (req, res) => {
    //     var { FromDate, NewDate } = req.query;

    //     if (!FromDate || !NewDate) {
    //         return invalidInput(res, "Both FromDate and NewDate are required");
    //     }

    //     let transaction;
    //     try {
    //         const pool = await sql.connect();
    //         transaction = new sql.Transaction(pool);
    //         await transaction.begin();

    //         const request = new sql.Request(transaction);
    //         request.input("FromDate", sql.Date, FromDate);
    //         request.input("NewDate", sql.Date, NewDate);

    //         const query = `
    //             SELECT rm.*, pb.POS_Brand_Name, pm.Product_Name
    //             FROM tbl_Pos_Rate_Master rm
    //             LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
    //             LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
    //             WHERE Rate_Date = @FromDate
    //         `;

    //         const result = await request.query(query);
    //         const getMaxId = await getNextId({ table: "tbl_Pos_Rate_Master", column: "Id" });

    //         if (!checkIsNumber(getMaxId.MaxId)) {
    //             await transaction.rollback();
    //             return failed(res, "Error generating RateMaster");
    //         }

    //         let newId = getMaxId.MaxId;

    //         if (result.recordset.length > 0) {
    //             const records = result.recordset;

    //             await deleteRecords(records, transaction, NewDate);
    //             await insertRecords(records, newId, transaction, NewDate);

    //             await transaction.commit();
    //             return success(res, "Records successfully updated and inserted into both tables");
    //         } else {
    //             await transaction.rollback();
    //             return noData(res, "No records found for the given date range");
    //         }
    //     } catch (e) {
    //         if (transaction) await transaction.rollback();
    //         return servError(e, res);
    //     }
    // };

    // const deleteRecords = async (records, transaction, NewDate) => {
    //     for (const record of records) {
    //         const requestDelete = new sql.Request(transaction);
    //         requestDelete.input("Rate_Date", sql.Date, NewDate);
    //         requestDelete.input("Item_Id", sql.Int, record.Item_Id);

    //         await requestDelete.query(`
    //             DELETE FROM tbl_Pos_Rate_Master
    //             WHERE Rate_Date = @Rate_Date AND Item_Id = @Item_Id
    //         `);
    //     }
    // };

    // const insertRecords = async (records, newId, transaction, NewDate) => {

    //     for (const record of records) {
    //         const requestInsert = new sql.Request(transaction);
    //         requestInsert.input("Id", newId++);
    //         requestInsert.input("Rate_Date", NewDate);
    //         requestInsert.input("Pos_Brand_Id", record.Pos_Brand_Id);
    //         requestInsert.input("Item_Id", record.Item_Id);
    //         requestInsert.input("Rate", record.Rate);
    //         requestInsert.input("Max_Rate", record.Max_Rate);
    //         requestInsert.input("Is_Active_Decative", record.Is_Active_Decative);

    //         await requestInsert.query(`
    //             INSERT INTO tbl_Pos_Rate_Master (Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate,Max_Rate,Is_Active_Decative)
    //             VALUES (@Id, @Rate_Date, @Pos_Brand_Id, @Item_Id, @Rate,@Max_Rate, @Is_Active_Decative)
    //         `);

    //         // const requestProInsert = new sql.Request(transaction);
    //         // requestProInsert.input("Rate_Date",  NewDate);
    //         // requestProInsert.input("Item_Id",  record.Item_Id);
    //         // requestProInsert.input("Rate",  record.Rate);
    //         // requestProInsert.input("Is_Active_Decative",  record.Is_Active_Decative);

    //         // await requestProInsert.query(`
    //         //     UPDATE tbl_Product_Master SET Product_Rate=@Rate, IsActive=@Is_Active_Decative WHERE Product_Id=@Item_Id
    //         // `);
    //     }
    // };

const postbulkExport = async (req, res) => {
    var { FromDate, NewDate, NewTime } = req.query;
    const { brandLevels, productLevels } = req.body;

    if (!FromDate || !NewDate) {
        return invalidInput(res, "Both FromDate and NewDate are required");
    }

    let timeOnly = '00:00:00';
    
    if (NewTime) {
        timeOnly = `${NewTime}:00`;
    }
    
    const dateOnly = NewDate;

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
            WHERE rm.Rate_Date = @FromDate
        `;

        const result = await request.query(query);

        if (result.recordset.length === 0) {
            await transaction.rollback();
            return noData(res, "No records found for the given date range");
        }

        const records = result.recordset;

        await deleteExistingRecords(transaction, NewDate);

        const rateGenId = await insertRateGen(transaction, NewDate, timeOnly);

        const getMaxId = await getNextId({ table: "tbl_Pos_Rate_Master", column: "Id", transaction });
        
        if (!checkIsNumber(getMaxId.MaxId)) {
            await transaction.rollback();
            return failed(res, "Error generating RateMaster ID");
        }

        let newId = getMaxId.MaxId;

        const insertResults = await insertRateMasterRecords(records, newId, transaction, dateOnly, timeOnly, brandLevels, productLevels, rateGenId);

        if (insertResults.changedRecords.length > 0) {
            const getUpdatedRateMaxId = await getNextId({ table: "tbl_Pos_Updated_Rate", column: "Id", transaction });
            let updatedRateId = getUpdatedRateMaxId.MaxId;
            
            await insertUpdatedRateRecords(insertResults.changedRecords, transaction, dateOnly, timeOnly, updatedRateId);
        }

        await transaction.commit();
        return success(res, `Successfully exported ${records.length} records. ${insertResults.changedRecords.length} rates were updated.`);
        
    } catch (e) {
        console.error("Error in postbulkExport:", e);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
        }
        return servError(e, res);
    }
};


const deleteExistingRecords = async (transaction, NewDate) => {
    const deleteRequest = new sql.Request(transaction);
    deleteRequest.input("NewDate", sql.Date, NewDate);
    
    await deleteRequest.query(`
        DELETE FROM tbl_Pos_Rate_Master 
        WHERE CAST(Rate_Date AS DATE) = @NewDate
    `);
};

const insertRateGen = async (transaction, NewDate, timeOnly) => {
    const rateGenRequest = new sql.Request(transaction);
    rateGenRequest.input("Rate_Date", sql.Date, NewDate);
    
    const [hours, minutes] = timeOnly.split(':');
    
  
    const getMaxId = await getNextId({ table: "tbl_Rate_Gen", column: "Id", transaction });
    const newId = getMaxId.MaxId;
    
    rateGenRequest.input("Id", sql.BigInt, newId);
    
    const rateGenQuery = `
        INSERT INTO tbl_Rate_Gen (Id, Rate_Date, Rate_time)
        VALUES (@Id, @Rate_Date, '${hours}:${minutes}:00')
    `;
    
    await rateGenRequest.query(rateGenQuery);
    return newId; 
};

const getExistingRate = async (itemId, posBrandId, transaction) => {
    const checkRequest = new sql.Request(transaction);
    checkRequest.input("Item_Id", sql.BigInt, itemId);
    checkRequest.input("Pos_Brand_Id", sql.BigInt, posBrandId);
    
    const checkQuery = `
        SELECT TOP 1 Rate, Max_Rate 
        FROM tbl_Pos_Rate_Master 
        WHERE Item_Id = @Item_Id 
        AND Pos_Brand_Id = @Pos_Brand_Id
        AND Is_Active_Decative = 1
        ORDER BY Rate_Date DESC, Id DESC
    `;
    
    const result = await checkRequest.query(checkQuery);
    return result.recordset[0] || null;
};


const insertRateMasterRecords = async (records, startId, transaction, dateOnly, timeOnly, brandLevels, productLevels, rateGenId) => {
    const changedRecordsMap = new Map();
    let currentId = startId;
    
    const [hours, minutes] = timeOnly.split(':');
    
    for (const record of records) {
        const insertRequest = new sql.Request(transaction);
        
        const existingRate = await getExistingRate(record.Item_Id, record.Pos_Brand_Id, transaction);
        
        const newRate = parseFloat(record.Rate) || 0;
        const newMaxRate = parseFloat(record.Max_Rate) || 0;
        const oldRate = existingRate ? parseFloat(existingRate.Rate) || 0 : 0;
        const oldMaxRate = existingRate ? parseFloat(existingRate.Max_Rate) || 0 : 0;
        
        const hasRateChanged = existingRate && oldRate !== newRate;
        const hasMaxRateChanged = existingRate && oldMaxRate !== newMaxRate;
        
        const brandLevel = brandLevels?.[record.Pos_Brand_Id] || record.Brand_Level || null;
        const itemLevel = productLevels?.[`${record.Pos_Brand_Id}_${record.Item_Id}`] || record.Item_Level || null;
        
        insertRequest.input("Id", sql.BigInt, currentId);
        insertRequest.input("Pos_Brand_Id", sql.BigInt, record.Pos_Brand_Id);
        insertRequest.input("Item_Id", sql.BigInt, record.Item_Id);
        insertRequest.input("Rate", sql.Decimal(18, 2), newRate);
        insertRequest.input("Max_Rate", sql.Decimal(18, 2), newMaxRate);
        insertRequest.input("Is_Active_Decative", sql.Int, record.Is_Active_Decative || 1);
        insertRequest.input("Brand_Level", sql.NVarChar, brandLevel);
        insertRequest.input("Item_Level", sql.NVarChar, itemLevel);
        
     
        const insertQuery = `
            INSERT INTO tbl_Pos_Rate_Master (
                Id, Rate_Date, Pos_Brand_Id, Item_Id, Rate, Max_Rate, 
                Is_Active_Decative, Brand_Level, Item_Level
            )
            VALUES (
                @Id, 
                '${dateOnly}',
                @Pos_Brand_Id, @Item_Id, @Rate, @Max_Rate,
                @Is_Active_Decative, @Brand_Level, @Item_Level
            )
        `;
        
        await insertRequest.query(insertQuery);
        
        if (hasRateChanged || hasMaxRateChanged) {
            const key = `${record.Item_Id}`;
            
            if (!changedRecordsMap.has(key)) {
                changedRecordsMap.set(key, {
                    Item_Id: record.Item_Id,
                    New_Rate: hasRateChanged ? newRate : (existingRate ? oldRate : newRate),
                    Old_Rate: hasRateChanged ? oldRate : (existingRate ? oldRate : newRate),
                    New_Max_Rate: hasMaxRateChanged ? newMaxRate : (existingRate ? oldMaxRate : newMaxRate),
                    Old_Max_Rate: hasMaxRateChanged ? oldMaxRate : (existingRate ? oldMaxRate : newMaxRate),
                    hasRateChanged: hasRateChanged,
                    hasMaxRateChanged: hasMaxRateChanged,
                    Gen_Id: rateGenId
                });
            } else {
                const existing = changedRecordsMap.get(key);
                if (hasRateChanged) {
                    existing.New_Rate = newRate;
                    existing.Old_Rate = oldRate;
                    existing.hasRateChanged = true;
                }
                if (hasMaxRateChanged) {
                    existing.New_Max_Rate = newMaxRate;
                    existing.Old_Max_Rate = oldMaxRate;
                    existing.hasMaxRateChanged = true;
                }
                existing.Gen_Id = rateGenId;
            }
        }
        
        currentId++;
    }
    
    const changedRecords = Array.from(changedRecordsMap.values());
    return { changedRecords, lastId: currentId - 1 };
};

const insertUpdatedRateRecords = async (changedRecords, transaction, dateOnly, timeOnly, startId) => {
    let currentId = startId;
    
    const fullDateTime = `${dateOnly} ${timeOnly}`;
    
    for (const record of changedRecords) {
        const insertRequest = new sql.Request(transaction);
        
        insertRequest.input("Id", sql.BigInt, currentId);
        insertRequest.input("Updated_Date", sql.DateTime, fullDateTime);
        insertRequest.input("Item_Id", sql.BigInt, record.Item_Id);
        insertRequest.input("New_Rate", sql.Decimal(18, 2), record.New_Rate);
        insertRequest.input("Old_Rate", sql.Decimal(18, 2), record.Old_Rate);
        insertRequest.input("New_Max_Rate", sql.Decimal(18, 2), record.New_Max_Rate);
        insertRequest.input("Old_Max_Rate", sql.Decimal(18, 2), record.Old_Max_Rate);
        insertRequest.input("Gen_Id", sql.BigInt, record.Gen_Id);
        
        const insertQuery = `
            INSERT INTO tbl_Pos_Updated_Rate (
                Id, Updated_Date, Item_Id, New_Rate, Old_Rate, New_Max_Rate, Old_Max_Rate, Gen_Id
            )
            VALUES (
                @Id, @Updated_Date, @Item_Id, @New_Rate, @Old_Rate, @New_Max_Rate, @Old_Max_Rate, @Gen_Id
            )
        `;
        
        await insertRequest.query(insertQuery);
        currentId++;
    }
};

const getNextId = async ({ table, column, transaction }) => {
    const request = new sql.Request(transaction);
    const query = `
        SELECT ISNULL(MAX(${column}), 0) + 1 AS MaxId 
        FROM ${table} WITH (TABLOCKX)
    `;
    const result = await request.query(query);
    return { MaxId: result.recordset[0].MaxId };
};

const checkIsNumber = (value) => {
    return !isNaN(value) && isFinite(value);
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
                    .input("Cancel_status", "Pending")
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
            else if (data.length <= 0) {
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
                    i.Transporter_Id AS Transporter_Id,
					i.Broker_Id AS Broker_Id,
					cc2.Cost_Center_Name AS Broker_Name,
                    ecc.Cost_Center_Name AS Transporter_Name,
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
                LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id=i.Transporter_Id
				LEFT JOIN tbl_ERP_Cost_Center cc2 ON cc2.Cost_Center_Id=i.Broker_Id
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
                        Broker_Name: row.Broker_Name,
                        Transporter_Name: row.Transporter_Name,
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

//   const getPosRateMasterForWhatsapp = async (req, res) => {
//     try {
//         const request = new sql.Request();

//         const dateQuery = `SELECT TOP 1 Rate_Date FROM tbl_Pos_Rate_Master ORDER BY Rate_Date DESC`;
//         const resultOfDate = await request.query(dateQuery);

//         if (resultOfDate.recordset.length === 0) {
//             return noData(res);
//         }

      
//         const latestDate = resultOfDate.recordset[0].Rate_Date;

      
//         request.input('latestDate', sql.DateTime, latestDate);

//         const query = `
//              SELECT 
//                 rm.Id, 
//                 rm.Rate_Date, 
//                 rm.Pos_Brand_Id, 
//                 rm.Item_Id,		
//                 rm.Rate,
//                 rm.Max_Rate, 
//                 pb.POS_Brand_Name, 
//                 pm.Product_Name, 
//                 pm.Short_Name, 
//                 pm.isActive AS Is_Active_Decative,
// 				slo.Item_Name_Modified
//             FROM tbl_Pos_Rate_Master rm
//             LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
//             LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
// 			LEFT JOIN tbl_Stock_LOS slo ON slo.Pro_Id=pm.Product_Id
//             WHERE rm.Rate_Date = @latestDate
//              ORDER BY pm.Product_Name asc
//         `;

//         const result = await request.query(query);

//         if (result.recordset.length > 0) {
//             return dataFound(res, result.recordset);
//         } else {
//             return noData(res);
//         }

//     } catch (e) {
//         return servError(e, res);
//     }
// };

const getPosRateMasterForWhatsapp = async (req, res) => {
    try {
        const request = new sql.Request();

        
        const dateQuery = `SELECT TOP 1 Rate_Date FROM tbl_Pos_Rate_Master ORDER BY Rate_Date DESC`;
        const resultOfDate = await request.query(dateQuery);

        if (resultOfDate.recordset.length === 0) {
            return noData(res);
        }

        const latestDate = resultOfDate.recordset[0].Rate_Date;
 
        
        const dateOnly = latestDate.toISOString().split('T')[0];
    
        
        request.input('latestDate', sql.Date, latestDate);
        request.input('dateOnly', sql.NVarChar, dateOnly);

        // Query for Pos Rate Master
        const posRateQuery = `
            SELECT 
                rm.Id, 
                rm.Rate_Date, 
                rm.Pos_Brand_Id, 
                rm.Item_Id,		
                rm.Rate,
                rm.Max_Rate, 
                pb.POS_Brand_Name, 
                pm.Product_Name, 
                pm.Short_Name, 
                pm.isActive AS Is_Active_Decative,
                slo.Item_Name_Modified,
                rm.Brand_Level,
                rm.Item_Level
            FROM tbl_Pos_Rate_Master rm
            LEFT JOIN tbl_POS_Brand pb ON pb.POS_Brand_Id = rm.Pos_Brand_Id
            LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = rm.Item_Id
            LEFT JOIN tbl_Stock_LOS slo ON slo.Pro_Id = pm.Product_Id
            WHERE CAST(rm.Rate_Date AS DATE) = CAST(@latestDate AS DATE)
            ORDER BY pm.Product_Name ASC
        `;

        // Query for Rate Gen - Get latest Rate_Gen record overall (if no record for the specific date)
        const rateGenQuery = `
            SELECT TOP 1
                rg.Id,
                rg.Rate_Date,
                rg.Rate_time,
                FORMAT(rg.Rate_time, 'HH:mm:ss') AS Rate_time_only,
                FORMAT(rg.Rate_time, 'hh:mm:ss tt') AS Rate_time_formatted
            FROM tbl_Rate_Gen rg
            ORDER BY rg.Rate_Date DESC, rg.Rate_time DESC
        `;

        // Execute both queries
        const [posRateResult, rateGenResult] = await Promise.all([
            request.query(posRateQuery),
            request.query(rateGenQuery)
        ]);
        
     
        
        const latestRateGen = rateGenResult.recordset.length > 0 ? rateGenResult.recordset[0] : null;
       
        
        const rateTime = latestRateGen?.Rate_time || null;
        const rateTimeOnly = latestRateGen?.Rate_time_only || null;
        const rateTimeFormatted = latestRateGen?.Rate_time_formatted || null;

        // Prepare response
        const response = {
            success: true,
            message: "Data fetched successfully",
            data: {
                posRateMaster: posRateResult.recordset,
                latestRateGen: latestRateGen,
                metadata: {
                    fromDate: latestDate,
                    fromDateOnly: dateOnly,
                    totalPosRateRecords: posRateResult.recordset.length,
                    rateGenDate: latestRateGen?.Rate_Date || null,
                    latestRateTime: rateTime,
                    latestRateTimeOnly: rateTimeOnly,
                    latestRateTimeFormatted: rateTimeFormatted,
                    fetchedAt: new Date().toISOString()
                }
            }
        };

        if (posRateResult.recordset.length > 0) {
            return res.status(200).json(response);
        } else {
            return noData(res, `No rate master data found for date: ${latestDate}`);
        }

    } catch (e) {
        console.error("Error in getPosRateMasterForWhatsapp:", e);
        return servError(e, res);
    }
};

const saveOrderLevels = async (req, res) => {
    const { brandLevels, productLevels } = req.body;
    
    if (!brandLevels && !productLevels) {
        return invalidInput(res, "No level data provided");
    }
    
    let transaction;
    try {
        const pool = await sql.connect();
        transaction = new sql.Transaction(pool);
        await transaction.begin();
        
    
        if (brandLevels && Object.keys(brandLevels).length > 0) {
            for (const [brandId, level] of Object.entries(brandLevels)) {
                if (level && level.trim() !== '') {
                    const updateRequest = new sql.Request(transaction);
                    updateRequest.input("Pos_Brand_Id", sql.BigInt, brandId);
                    updateRequest.input("Brand_Level", sql.NVarChar, level);
                    updateRequest.input("Rate_Date", sql.Date, new Date().toISOString().split('T')[0]);
                    
                    const updateQuery = `
                        UPDATE tbl_Pos_Rate_Master 
                        SET Brand_Level = @Brand_Level
                        WHERE Pos_Brand_Id = @Pos_Brand_Id 
                        AND Rate_Date = @Rate_Date
                        AND Is_Active_Decative = 1
                    `;
                    
                    await updateRequest.query(updateQuery);
                }
            }
        }
        
        // Update Product/Item Levels
        if (productLevels && Object.keys(productLevels).length > 0) {
            for (const [key, level] of Object.entries(productLevels)) {
                if (level && level.trim() !== '') {
                    const [brandId, itemId] = key.split('_');
                    
                    const updateRequest = new sql.Request(transaction);
                    updateRequest.input("Pos_Brand_Id", sql.BigInt, brandId);
                    updateRequest.input("Item_Id", sql.BigInt, itemId);
                    updateRequest.input("Item_Level", sql.NVarChar, level);
                    updateRequest.input("Rate_Date", sql.Date, new Date().toISOString().split('T')[0]);
                    
                    const updateQuery = `
                        UPDATE tbl_Pos_Rate_Master 
                        SET Item_Level = @Item_Level
                        WHERE Pos_Brand_Id = @Pos_Brand_Id 
                        AND Item_Id = @Item_Id
                        AND Rate_Date = @Rate_Date
                        AND Is_Active_Decative = 1
                    `;
                    
                    await updateRequest.query(updateQuery);
                }
            }
        }
        
        await transaction.commit();
        return success(res, "Order levels saved successfully");
        
    } catch (error) {
        console.error("Error saving order levels:", error);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Error during rollback:", rollbackError);
            }
        }
        return servError(error, res);
    }
};

const rateGen = async (req, res) => {
    try {
        const { Rate_Date } = req.query;

        if (!Rate_Date) {
             return invalidInput(res, "No Rate_Date Found");
        }

        const request = new sql.Request();

      
        request.input("rate_Date", sql.Date, Rate_Date);

        const result = await request.query(`
            SELECT TOP 1 
                Rate_Date,
                Rate_Time
            FROM tbl_Rate_Gen
            WHERE Rate_Date = @rate_Date
            ORDER BY Rate_Time DESC
        `);

        const data = result.recordset;

        if (data.length > 0) {
            dataFound(res, data);
        } else {
            noData(res);
        }

    } catch (e) {
        servError(e, res);
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
        posProductList,
        getPosRateMasterForWhatsapp,
        saveOrderLevels,
        bulkUpdatePosRateMaster,
        rateGen
    }
}

export default posBranchController();