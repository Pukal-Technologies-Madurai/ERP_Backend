import sql from 'mssql';
import { dataFound, noData, servError, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';

const taskModule = () => {

    const getTaskDropDown = async (req, res) => {
        const { Company_id } = req.query;

        // if (!checkIsNumber(Company_id)) {
        //     return invalidInput(res, 'Company_id is required');
        // }

        try {
            const request = new sql.Request()
                .input('comp', Company_id)
                .query(`SELECT Task_Id, Task_Name FROM tbl_Task ORDER BY Task_Name`)
            // WHERE Company_id = @comp

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getTasks = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const result = await new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT 
	                    t.*,
		                COALESCE((
		            	    SELECT 
		            	    	Task_Type
		            	    FROM
		            	    	tbl_Task_Type
		            	    WHERE
		            	    	Task_Type_Id = t.Task_Group_Id
		                ), 'Unknown') AS Task_Group,
	                    COALESCE((
	                    	SELECT 
                                param.PA_Id,
                                param.Task_Id,
                                param.Param_Id AS Paramet_Id,
                                param.Default_Value,
                                pm.Paramet_Name,
                                pm.Paramet_Data_Type
	                    	FROM
	                    		tbl_Task_Paramet_DT AS param
                                LEFT JOIN tbl_Paramet_Master AS pm
                                ON pm.Paramet_Id = param.Param_Id
	                    	WHERE
	                    		Task_Id = t.Task_Id
	                    	FOR JSON PATH
	                    ), '[]') AS Task_Parameters
                    FROM 
                        tbl_Task AS t
                    ORDER BY 
                        CONVERT(DATE, t.Entry_Date) DESC`)

            // WHERE
            // t.Company_id = @comp

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Task_Parameters: JSON.parse(o?.Task_Parameters)
                }))
                return dataFound(res, parsed)
            } else {
                return noData(res)
            }
        } catch (err) {
            return servError(err, res)
        }
    }

    const createTask = async (req, res) => {
        const {
        
            Task_Name = '',
            Task_Desc = '',
            Task_Group_Id = null,
            Entry_By = null,
            Task_Parameters = [],
            Company_id
        } = req.body;

        if (!Task_Name || !Task_Desc || !checkIsNumber(Entry_By)) {
            return invalidInput(res, 'Task_Name, Task_Desc and Entry_By is required')
        }

        const transaction = new sql.Transaction();

        try {

            await transaction.begin();
            const request = new sql.Request(transaction)
                .input('Task_Name', Task_Name)
                .input('Task_Desc', Task_Desc)
                .input('Task_Group_Id', Task_Group_Id)
                .input('Company_id', Company_id)
                .input('Entry_By', Entry_By)
                .query(`
                    INSERT INTO tbl_Task 
                        (Task_Name, Task_Desc, Task_Group_Id, Company_id, Entry_By, Entry_Date)
                    VALUES
                        (@Task_Name, @Task_Desc, @Task_Group_Id, @Company_id, @Entry_By, GETDATE());
                    SELECT SCOPE_IDENTITY() AS Task_Id;`
                )

            const result = await request;

            if (result.rowsAffected.length === 0) {
                throw new Error('Failed to create Task')
            }

            if (Array.isArray(Task_Parameters) && Task_Parameters.length > 0) {
                for (let i = 0; i < Task_Parameters.length; i++) {
                    const insertParameters = (await new sql.Request(transaction)
                        .input('Task_Id', result.recordset[0].Task_Id)
                        .input('Param_Id', Task_Parameters[i]?.Param_Id)
                        .input('Default_Value', Task_Parameters[i]?.Default_Value)
                        .query(`
                                    INSERT INTO tbl_Task_Paramet_DT
                                        (Task_Id, Param_Id, Default_Value)
                                    VALUES
                                        (@Task_Id, @Param_Id, @Default_Value)
                                    `)
                    ).rowsAffected[0]

                    if (isEqualNumber(insertParameters, 0)) {
                        throw new Error('Failed to save Paramerters')
                    }
                }
            }

            await transaction.commit();
            return success(res, 'Task Created');

        } catch (e) {
            await transaction.rollback();
            return servError(e, res)
        }
    };

    const editTask = async (req, res) => {
        const { Task_Id, Task_Name, Task_Desc, Task_Group_Id, Entry_By, Task_Parameters } = req.body;

        if (!checkIsNumber(Task_Id) || !Task_Name || !Task_Desc || !checkIsNumber(Entry_By)) {
            return invalidInput(res, 'Task_Id, Task_Name, Task_Desc and Entry_By is required');
        }

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('Task_Id', Task_Id)
                .input('Task_Name', Task_Name)
                .input('Task_Desc', Task_Desc)
                .input('Task_Group_Id', Task_Group_Id)
                .input('Entry_By', Entry_By)
                .query(`
                    UPDATE tbl_Task
                    SET Task_Name = @Task_Name,
                        Task_Desc = @Task_Desc,
                        Task_Group_Id = @Task_Group_Id,
                        Update_By = @Entry_By,
                        Update_Date = GETDATE()
                    WHERE 
                        Task_Id = @Task_Id;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) {
                throw new Error('Failed to update Task')
            }

            const deleteParamsRequest = new sql.Request(transaction)
                .input('Task_Id', Task_Id)
                .query(`
                        DELETE FROM tbl_Task_Paramet_DT
                        WHERE Task_Id = @Task_Id;`
                );

            await deleteParamsRequest;

            if (Array.isArray(Task_Parameters) && Task_Parameters.length > 0) {
                for (let i = 0; i < Task_Parameters.length; i++) {
                    const insertParameters = (await new sql.Request(transaction)
                        .input('Task_Id', Task_Id)
                        .input('Param_Id', Task_Parameters[i]?.Param_Id)
                        .input('Default_Value', Task_Parameters[i]?.Default_Value)
                        .query(`
                                    INSERT INTO tbl_Task_Paramet_DT
                                        (Task_Id, Param_Id, Default_Value)
                                    VALUES
                                        (@Task_Id, @Param_Id, @Default_Value);
                                `)
                    ).rowsAffected[0];

                    if (isEqualNumber(insertParameters, 0)) {
                        throw new Error('Failed to save Parameters')
                    }
                }
            }

            await transaction.commit();
            return success(res, 'Task Updated');

        } catch (e) {
            await transaction.rollback();
            return servError(e, res);
        }
    };

    const deleteTask = async (req, res) => {
        const { Task_Id } = req.body;

        if (!Task_Id) {
            return invalidInput(res, 'Task_Id is required')
        }

        try {
            const request = (await new sql.Request()
                .input('Task_Id', Task_Id)
                .query(`
                    DELETE FROM tbl_Task WHERE Task_Id = @Task_Id;
                    DELETE FROM tbl_Task_Details WHERE Task_Id = @Task_Id;
                    DELETE FROM tbl_Task_Paramet_DT WHERE Task_Id = @Task_Id;
                    `)
            ).rowsAffected[0]
            // DELETE FROM tbl_Work_Master WHERE Task_Id = @Task_Id;

            if (request > 0) {
                return success(res, 'One Task Deleted');
            } else {
                return failed(res, 'Failed to Delete Task')
            }

        } catch (e) {
            return servError(e, res)
        }
    }

    const getTasksbyid = async (req, res) => {
        const { Project_Id } = req.query;


        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required and must be a number');
        }

        try {
            const result = await new sql.Request()
                .input('proj', Project_Id)
                .query(`
                    SELECT 
                        t.*,
                        COALESCE((
                            SELECT 
                                Task_Type
                            FROM
                                tbl_Task_Type
                            WHERE
                                Task_Type_Id = t.Task_Group_Id
                        ), 'Unknown') AS Task_Group,
                        COALESCE((
                            SELECT 
                                param.PA_Id,
                                param.Task_Id,
                                param.Param_Id AS Paramet_Id,
                                param.Default_Value,
                                pm.Paramet_Name,
                                pm.Paramet_Data_Type
                            FROM
                                tbl_Task_Paramet_DT AS param
                            LEFT JOIN tbl_Paramet_Master AS pm
                            ON pm.Paramet_Id = param.Param_Id
                            WHERE
                                Task_Id = t.Task_Id
                            FOR JSON PATH
                        ), '[]') AS Task_Parameters
                    FROM 
                        tbl_Task AS t
                    WHERE
                        t.Project_Id = @proj 
                    ORDER BY 
                        CONVERT(DATE, t.Entry_Date) DESC
                `);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Task_Parameters: JSON.parse(o?.Task_Parameters)
                }));
                return dataFound(res, parsed);
            } else {
                return noData(res);
            }
        } catch (err) {
            return servError(err, res);
        }
    };

    const getTaskIndividualId = async (req, res) => {
        const { Task_Id } = req.query;

        if (!Task_Id) {
            return invalidInput(res, 'Task_Id is required');
        }

        try {
            const request = await new sql.Request()
                .input('Task_Id', sql.Int, Task_Id)
                .query(`
                    SELECT 
                        t.*, 
                        COALESCE(tt.Task_Type, 'Unknown') AS Task_Group,
                        COALESCE((
                            SELECT 
                                param.PA_Id,
                                param.Task_Id,
                                param.Param_Id AS Paramet_Id,
                                param.Default_Value,
                                pm.Paramet_Name,
                                pm.Paramet_Data_Type
                            FROM
                                tbl_Task_Paramet_DT AS param
                            JOIN 
                                tbl_Paramet_Master AS pm ON pm.Paramet_Id = param.Param_Id
                            WHERE
                                param.Task_Id = t.Task_Id
                            FOR JSON PATH
                        ), '[]') AS Task_Parameters
                    FROM 
                        tbl_Task AS t
                    LEFT JOIN 
                        tbl_Task_Type AS tt ON tt.Task_Type_Id = t.Task_Group_Id
                    WHERE 
                        t.Task_Id = @Task_Id
                    
                `);

            const task = request.recordset[0];

            if (task) {
                task.Task_Parameters = JSON.parse(task.Task_Parameters);
                return success(res, 'Task retrieved successfully', task);
            } else {
                return failed(res, 'Task not found');
            }
        } catch (e) {
            return servError(e, res);
        }
    };

    return {
        getTaskDropDown,
        getTasks,
        editTask,
        createTask,
        deleteTask,
        getTasksbyid,
        getTaskIndividualId,
    }
}

export default taskModule();