import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';


const taskTypeControlelr = () => {

    const TaskTypeDropDown = async (req, res) => {
        try {
            const query = `SELECT Task_Type_Id, Task_Type FROM tbl_Task_Type ORDER BY Task_Type`;

            const request = new sql.Request();
            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getTaskTyepe = async (req, res) => {

        try {
            const result = (await new sql.Request().execute('Task_Type_Vw')).recordset
            if (result.length > 0) {
                dataFound(res, result);
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const postTaskType = async (req, res) => {
        const { Task_Type } = req.body;

        if (!Task_Type) {
            return invalidInput(res, 'Task_Type is required')
        }

        try {
            const result = await new sql.Request()
                .input('Mode', 1)
                .input('Task_Type_Id', 0)
                .input('Task_Type', Task_Type)
                .execute('Task_Type_SP')

            if (result.rowsAffected[0] > 0) {
                success(res, 'Task type added successfully')
            } else {
                failed(res, 'Failed to add task type');
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const editTaskType = async (req, res) => {
        const { Task_Type_Id, Task_Type } = req.body;

        if (!Task_Type_Id || !Task_Type) {
            return invalidInput(res, 'Task_Type_Id, Task_Type is required')
        }

        try {
            const result = await new sql.Request()
                .input('Mode', 2)
                .input('Task_Type_Id', Task_Type_Id)
                .input('Task_Type', Task_Type)
                .execute('Task_Type_SP')
            

            if (result.rowsAffected[0] > 0) {
                success(res, 'Task type updated successfully')
            } else {
                failed(res, 'Failed to update task type');
            }

        } catch (e) {
            servError(e, res)
        }
    };

    const deleteTaskType = async (req, res) => {
        const { Task_Type_Id } = req.body;

        if (!Task_Type_Id) {
            return invalidInput(res, 'Task_Type_Id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Task_Type_Id', Task_Type_Id);
            request.input('Task_Type', 0);

            const result = await request.execute('Task_Type_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Task type deleted successfully')
            } else {
                failed(res, 'Failed to delete task type')
            }
        } catch (e) {
            servError(e, res)
        }
    };


    return {
        TaskTypeDropDown,
        getTaskTyepe,
        postTaskType,
        editTaskType,
        deleteTaskType
    }
}

export default taskTypeControlelr()