import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
const posBranchController = () => {

    const getPosDropDown = async (req, res) => {

        try {
            const pos = (await new sql.Request()
                .query(`
                    SELECT 
                        POS_Brand_Id AS value, 
                        POS_Brand_Name AS label
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

    const getPosBranch = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                      pb.POS_Brand_Id,
                      pb.POS_Brand_Name
                    FROM 
                      tbl_POS_Brand pb
                    
                    `);
                // B.Company_id = CM.Company_id
                //     AND 

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const postPosBranch = async (req, res) => {
        const { POS_Brand_Name } = req.body;
    
        if (!POS_Brand_Name) {
            return invalidInput(res, 'POS_Brand_Name is required');
        }
    
        try {
           
            const getMaxId = await getNextId({ table: 'tbl_POS_Brand', column: 'POS_Brand_Id' });
    
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating POS_Brand_Id');
            }
    
            const posId = getMaxId.MaxId; 
    
            const request = new sql.Request();
            request.input('POS_Brand_Id', posId);
            request.input('POS_Brand_Name', POS_Brand_Name);
    
            const query = `INSERT INTO tbl_POS_Brand (POS_Brand_Id, POS_Brand_Name) VALUES (@POS_Brand_Id, @POS_Brand_Name)`;
    
            const insertResult = await request.query(query);
    
            if (insertResult.rowsAffected[0] > 0) {
             
                success(res, 'POS_Brand created and Last_Update_Time updated successfully');
            } else {
                failed(res, 'Failed to create POS_Brand');
            }
        } catch (e) {
            servError(e, res);
        }
    };
    
    
    const putPosBranch = async (req, res) => {
        const { POS_Brand_Id,POS_Brand_Name } = req.body;

        if (!POS_Brand_Id || !POS_Brand_Name ) {
            return invalidInput(res, 'POS_Brand_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('POS_Brand_Id', POS_Brand_Id);
            request.input('POS_Brand_Name', POS_Brand_Name);
            const result = await request.query(`
                UPDATE tbl_POS_Brand
                SET POS_Brand_Name = @POS_Brand_Name
                WHERE POS_Brand_Id = @POS_Brand_Id
            `);
            if (result.rowsAffected[0] > 0) {
               return success(res, 'POS_Brand updated successfully');
            } else {
                return failed(res, 'No changes were made, the POS brand might not exist');
            }
        } catch (e) {
        
      
            return servError(e, res);
        }
    };


    const deleteBranch = async (req, res) => {
        const { POS_Brand_Id } = req.body;

        if (!POS_Brand_Id) {
            return invalidInput(res, 'POS_Brand_Id is required')
        }

        try {
            const request = new sql.Request();
            request.input('POS_Brand_Id', POS_Brand_Id);
           
            const result = await request.query(`
                DELETE tbl_POS_Brand where POS_Brand_Id=@POS_Brand_Id
            `);
            if (result.rowsAffected[0] > 0) {
                return success(res, 'Branch POS_Brand successfully');
            } else {
                return failed(res, 'No changes were made, the POS brand might not exist');
            }
        } catch (e) {
        
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    const getProductsList = async (req, res) => {
        const { Pos_Brand_Id } = req.query;
        try {
                const result = await new sql.Request()
                            .input('Pos_Brand_Id', Pos_Brand_Id)
                            .query(`
                            SELECT 
                        Product_Id AS value, 
                         Product_Name AS label
                    FROM 
                        tbl_Product_Master
                   where Pos_Brand_Id=@Pos_Brand_Id
                            `);
                                
                            // WHERE
                            // u.Company_Id = @Comp
            
                        if (result.recordset.length > 0) {
                            dataFound(res, result.recordset)
                        } else {
                            noData(res)
                        }
                    } catch (e) {
                        servError(e, res);
                    }
                }

  
    return {
        getPosDropDown,
        getPosBranch,
        postPosBranch,
        putPosBranch,
        deleteBranch,
        getProductsList
    }
}

export default posBranchController();