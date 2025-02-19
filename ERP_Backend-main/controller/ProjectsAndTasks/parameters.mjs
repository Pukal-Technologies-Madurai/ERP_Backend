import sql from 'mssql';
import { dataFound, noData, failed, servError, invalidInput, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const TaskPrarameter = () => {

    const getTaskParameters = async (req, res) => {
        try {
            const result = await sql.query(`SELECT * FROM tbl_Paramet_Master WHERE Del_Flag = 0`)

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const addTaskPrarameter = async (req, res) => {
        const { Paramet_Name, Paramet_Data_Type } = req.body;

        if (!Paramet_Name || !Paramet_Data_Type) {
            return invalidInput(res, 'Paramet_Name, Paramet_Data_Type is required')
        }

        try {
            const checkRequest = new sql.Request();
            checkRequest.input('param', Paramet_Name);
            checkRequest.input('flag', 0)
            const checkExists = await checkRequest.query(`
                SELECT 
                    Paramet_Name 
                FROM 
                    tbl_Paramet_Master 
                WHERE 
                    Paramet_Name = @param
                    AND Del_Flag = @flag`
            )

            if (checkExists.recordset.length > 0) {
                return failed(res, 'Parameter Already Exists')
            }

            const request = new sql.Request()
                .input('name', Paramet_Name)
                .input('type', Paramet_Data_Type)
                .input('del', 0)
                .query(`INSERT INTO tbl_Paramet_Master (Paramet_Name, Paramet_Data_Type, Del_Flag) VALUES (@name, @type, @del)`);

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Task Parameter Created')
            } else {
                failed(res, 'Failed to Create')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const editTaskPrarameter = async (req, res) => {
        const { Paramet_Id, Paramet_Name, Paramet_Data_Type } = req.body;

        if (!checkIsNumber(Paramet_Id) || !Paramet_Name || !Paramet_Data_Type) {
            return invalidInput(res, 'Paramet_Name, Paramet_Data_Type is required')
        }

        try {
            const request = new sql.Request()
                .input('id', Paramet_Id)
                .input('name', Paramet_Name)
                .input('type', Paramet_Data_Type)
                .query( `
                    UPDATE 
                        tbl_Paramet_Master 
                    SET 
                        Paramet_Name = @name, 
                        Paramet_Data_Type = @type 
                    WHERE 
                        Paramet_Id = @id`)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                failed(res, 'Failed to Save Changes')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const delTaskParameter = async (req, res) => {
        const { Paramet_Id } = req.body;

        if (!checkIsNumber(Paramet_Id)) {
            return invalidInput(res, 'Paramet_Id is required')
        }

        try {

            const request = new sql.Request()
                .input('id', Paramet_Id)
                .query(`
                UPDATE 
                    tbl_Paramet_Master
                SET
                    Del_Flag = 1
                WHERE
                    Paramet_Id = @id`)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'One Task Paramerter Removed!')
            } else {
                failed(res, 'Failed to Remove Task Paramerter')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getTaskParameters,
        addTaskPrarameter,
        editTaskPrarameter,
        delTaskParameter
    }
}

export default TaskPrarameter();