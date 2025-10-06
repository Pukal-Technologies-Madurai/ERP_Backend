import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, randomNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const processMaster = () => {

    const getProcessDetails = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT *
                    FROM tbl_Process_Master`
                );

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

    const postprocess = async (req, res) => {
        const { Process_Name } = req.body;

        if (!Process_Name) {
            return invalidInput(res, 'Process is required');
        }

        try {
            const checkExisting = await new sql.Request()
                .input('Process_Name', Process_Name)
                .query('SELECT 1 FROM tbl_Process_Master WHERE Process_Name = @Process_Name');

            if (checkExisting.recordset.length > 0) {
                return failed(res, 'Process already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_Process_Master', column: 'Id' });

            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Id');
            }

            const Id = getMaxId.MaxId;
        
            const result = await new sql.Request()
                .input('Id', Id)
                .input('Process_Name', Process_Name)
                .query(`
                INSERT INTO tbl_Process_Master 
                (Id, Process_Name) 
                VALUES 
                (@Id,@Process_Name)
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Process created');
            } else {
                return failed(res, 'Failed to create Process');
            }
        } catch (e) {
            return servError(e, res);
        }
    };

    const putProcess = async (req, res) => {
        const { Id, Process_Name } = req.body;

        if (!Id || !Process_Name) {
            return invalidInput(res, 'Id, Process_Name are required');
        }

        try {
        
            const result = await new sql.Request()
                .input('Id', Id)
                .input('Process_Name', Process_Name)
                .query(`
                UPDATE tbl_Process_Master
                SET 
                    Id = @Id,
                    Process_Name = @Process_Name
                WHERE Id = @Id
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Process updated successfully');
            } else {
                failed(res, 'Failed to save changes');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteProcess = async (req, res) => {
        const { Id } = req.body;

        if (!Id) {
            return invalidInput(res, 'Id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Id', Id)
                .query('DELETE FROM tbl_Process_Master WHERE Id = @Id');

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Process deleted successfully');
            } else {
                failed(res, 'Failed to delete Pro Group');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getProcessDetails,
        postprocess,
        putProcess,
        deleteProcess
    }
}

export default processMaster();