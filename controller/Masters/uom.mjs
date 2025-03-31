import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
const uomController = () => {

    const getPosDropDown = async (req, res) => {

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

    const getUOM = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                      pb.Unit_Id,
                      pb.Units
                    FROM 
                      tbl_UOM pb
                    
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

    const postUOM = async (req, res) => {
        const { Units } = req.body;

        if (!Units) {
            return invalidInput(res, 'Units is required');
        }

        try {
            // Get the next ID
            const getMaxId = await getNextId({ table: 'tbl_UOM', column: 'Unit_Id' });

            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Unit_Id');
            }

            const Unit_Id = getMaxId.MaxId;

            const request = new sql.Request();
            request.input('Unit_Id', Unit_Id);
            request.input('Units', Units);

            const query = `INSERT INTO tbl_UOM (Unit_Id, Units) VALUES (@Unit_Id, @Units)`;

            const result = await request.query(query);


            if (result.rowsAffected[0] > 0) {
               
                success(res, 'Unit created successfully');
            } else {
                failed(res, 'Failed to create Unit_Id');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putUOM = async (req, res) => {
        const { Unit_Id, Units } = req.body;

        if (!Unit_Id || !Units) {
            return invalidInput(res, 'Units is required')
        }

        try {
            const request = new sql.Request();
            request.input('Unit_Id', Unit_Id);
            request.input('Units', Units);
            const result = await request.query(`
                UPDATE tbl_UOM
                SET Units = @Units
                WHERE Unit_Id = @Unit_Id
            `);
            if (result.rowsAffected[0] > 0) {
            
                return success(res, 'Units updated successfully');
            } else {
                return failed(res, 'No changes were made, the Units might not exist');
            }
        } catch (e) {

            console.error('Database error:', e);
            return servError(e, res);
        }
    };


    const deleteUOM = async (req, res) => {
        const { Unit_Id } = req.body;

        if (!Unit_Id) {
            return invalidInput(res, 'Unit_Id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Unit_Id', Unit_Id);

            const result = await request.query(`
                DELETE tbl_UOM where Unit_Id=@Unit_Id
            `);
            if (result.rowsAffected[0] > 0) {
                return success(res, 'Unit Deleted successfully');
            } else {
                return failed(res, 'No changes were made, the Unit might not exist');
            }
        } catch (e) {

            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    return {
        getUOM,
        postUOM,
        putUOM,
        deleteUOM
    }
}

export default uomController();