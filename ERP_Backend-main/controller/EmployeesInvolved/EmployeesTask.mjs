

import sql from 'mssql';
import { checkIsNumber } from '../../helper_functions.mjs';
import { dataFound, noData, invalidInput, servError, success, failed } from '../../res.mjs'
const employeesTasks = () => {

    const getusersDropDown = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const result = await new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT 
                        UserId, Name 
                    FROM 
                        tbl_Users 
                    WHERE 
                        (UserTypeId = 6 OR UserTypeId = 3) 
                        AND UDel_Flag = 0 
                      AND Company_id = @comp 
                `);

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (e) {
            return servError(e, res);
        }
    };



    const getUsersProjectId = async (req, res) => {
        const { Project_Id } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required and must be a number');
        }

        try {
            const result = await new sql.Request()
                .input('Project_Id', sql.Int, Project_Id)
                .query(`
                   SELECT 
                     pe.[Id],
                     pe.[Project_Id],
                     u.[UserId],
                     u.[Name]
                 FROM 
                     [dbo].[tbl_Project_Employee] AS pe
                 JOIN 
                [dbo].[tbl_Users] AS u
                 ON 
                 pe.[User_Id] = u.[UserId]
                 WHERE 
                 pe.[Project_Id] = @Project_Id 
                 ORDER BY 
                 pe.[Project_Id];

                `);

            // Check for results
            if (result.recordset.length > 0) {

                return dataFound(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (e) {
            return servError(e, res);
        }
    };


    const getEmployeeTasks = async (req, res) => {
        const { Project_Id } = req.query;

        if (!Project_Id) {
            return invalidInput(res, 'Project_Id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Project_Id', sql.Int, Project_Id)
                .query(`
                     SELECT 
                        e.UserId,
                        e.Name,
                        COALESCE(d.Designation, 'NOT FOUND') AS Designation_Name, 
                        COALESCE(b.BranchName, 'NOT FOUND') AS BranchName
                       
                    FROM 
                        tbl_Project_Employee AS pe
                    JOIN 
                        tbl_Users AS e ON pe.User_Id = e.UserId
                    LEFT JOIN 
                        tbl_Employee_Designation AS d ON e.UserTypeId = d.Designation_Id
                 
                    LEFT JOIN 
                        tbl_Branch_Master AS b ON e.BranchId = b.BranchId
                    WHERE 
                        pe.Project_Id = @Project_Id
                    ORDER BY 
                        e.Name
                        
                `);

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (err) {
            return servError(err, res);
        }
    };


    const postEmployeesProjects = async (req, res) => {
        const { Project_Id, UserIds } = req.body;

        if (!Project_Id) {
            return invalidInput(res, 'Project_Id is required');
        }

        try {

            const deleteQuery = `DELETE FROM tbl_Project_Employee WHERE Project_Id = @projectId`;
            const deleteRequest = new sql.Request();
            deleteRequest.input('projectId', Project_Id);
            await deleteRequest.query(deleteQuery);

            const insertQuery = `INSERT INTO tbl_Project_Employee (Project_Id, User_Id) VALUES (@projectId, @userId)`;
            const insertRequests = UserIds.map(async userId => {
                const insertRequest = new sql.Request();
                insertRequest.input('projectId', Project_Id);
                insertRequest.input('userId', userId);
                return insertRequest.query(insertQuery);
            });

            await Promise.all(insertRequests);

            return dataFound(res, [], 'Changes Saved');
        } catch (e) {
            console.error('Error saving project employees:', e);
            return servError(e, res);
        }
    };


    const assignTaskForEmployee = async (req, res) => {
        const {
            Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, 
            Sch_Period, Sch_Time, EN_Time, Est_Start_Dt, Est_End_Dt, Ord_By = 1, 
            Timer_Based = 0, Is_Repitative = 0, Sch_Type, RepeatDays = {}
        } = req.body;

    
        if (!Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Assigned_Emp_Id || !Emp_Id || 
            !Sch_Period || !Sch_Time || !EN_Time || !Est_Start_Dt || !Est_End_Dt || !Sch_Type) {
            return res.status(400).json({ error: "All fields must be defined for task assignment." });
        }
    
        try {
            const request = new sql.Request();
    
            request.input('Mode', sql.TinyInt, 1);  
            request.input('AN_No', sql.BigInt, ''); 
            request.input('Project_Id', sql.BigInt, parseInt(Project_Id));
            request.input('Sch_Id', sql.BigInt, parseInt(Sch_Id));
            request.input('Task_Levl_Id', sql.BigInt, parseInt(Task_Levl_Id));
            request.input('Task_Id', sql.BigInt, parseInt(Task_Id));
            request.input('Assigned_Emp_Id', sql.Int, parseInt(Assigned_Emp_Id));
            request.input('Emp_Id', sql.Int, parseInt(Emp_Id));
            request.input('Task_Assign_dt', sql.DateTime, new Date().toISOString().split('T')[0]);
            request.input('Sch_Period', sql.NVarChar(50), Sch_Period);
            request.input('Sch_Time', sql.NVarChar(50), Sch_Time);
            request.input('EN_Time', sql.NVarChar(50), EN_Time);
            request.input('Est_Start_Dt', sql.DateTime, Est_Start_Dt);
            request.input('Est_End_Dt', sql.DateTime, Est_End_Dt);
            request.input('Ord_By', sql.Int, parseInt(Ord_By));
            request.input('Timer_Based', sql.Int, Boolean(Number(Timer_Based)) ? 1 : 0);
            request.input('Invovled_Stat', sql.Int, 1); 
            request.input('Is_Repitative', sql.Int, Boolean(Number(Is_Repitative)) ? 1 : 0);
            request.input('Sch_Type', sql.Int, parseInt(Sch_Type));
    
            request.input('IS_Rep_Monday', sql.Int, RepeatDays.Mon ? 1 : 0);
            request.input('IS_Rep_Tuesday', sql.Int, RepeatDays.Tue ? 1 : 0);
            request.input('IS_Rep_Wednesday', sql.Int, RepeatDays.Wed ? 1 : 0);
            request.input('IS_Rep_Thursday', sql.Int, RepeatDays.Thu ? 1 : 0);
            request.input('Is_Rep_Friday', sql.Int, RepeatDays.Fri ? 1 : 0);
            request.input('Is_Rep_Saturday', sql.Int, RepeatDays.Sat ? 1 : 0);
            request.input('Is_Rep_Sunday', sql.Int, RepeatDays.Sun ? 1 : 0);
    
            const result = await request.execute('Task_Assign_SP');
    
            if (result.rowsAffected[0] > 0) {
                return success(res, [], 'Changes saved');
            } else {
                return failed(res, 'Failed to Assign');
            }
            
        } catch (e) {
            return servError(e, res);
        }
    };
    
    
    const getEmployeeAssignedInTheTask = async (req, res) => {
        const { Task_Id, ProjectId,LevelId } = req.query;
    
        if (!Task_Id || !ProjectId || !LevelId) {
            return invalidInput(res, 'Both Task_Id and ProjectId are required');
        }
    
        try {
            const getQuery = `SELECT 
                            td.*,
                            (SELECT Name FROM tbl_Users WHERE UserId = td.Assigned_Emp_Id) AS AssignedUser,
                            (SELECT Name FROM tbl_Users WHERE UserId = td.Emp_Id) AS EmployeeName,
                            (SELECT Task_Name FROM tbl_Task WHERE Task_Id = td.Task_Id) AS TaskNameGet,
                            pst.Sch_Project_Id,
                            pst.Task_levl_Id,
                            psty.Sch_Type as Sch_Type_Name
                            
                        FROM 
                          [dbo].[tbl_Task_Details]  AS td
                         JOIN 
                            [dbo].[tbl_Project_Sch_Task_DT] AS pst 
                            ON td.Task_Id = pst.Task_Id
                        join [dbo].[tbl_Project_Sch_Type] as psty
                            ON td.Sch_Type =psty.Sch_Type_Id
                            WHERE 
                            td.Task_Id = @taskid
                            AND pst.Sch_Project_Id = @projectid
                            AND td.Task_Levl_Id=@levelid`;
        
    
            const request = new sql.Request();
            request.input('taskid', sql.Int, Task_Id);
            request.input('projectid', sql.Int, ProjectId); 
            request.input('levelid', sql.Int, LevelId);
            const result = await request.query(getQuery);
    
            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
    
        } catch (e) {
            servError(e, res);
        }
    };

    const modifyTaskAssignedForEmployee = async (req, res) => {
        const {
            AN_No, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Sch_Period, Sch_Time,
            EN_Time, Est_Start_Dt, Est_End_Dt, Ord_By, Timer_Based, Invovled_Stat, Sch_Type, Is_Repitative, RepeatDays = {}
        } = req.body;
   
        if (!AN_No || !Project_Id  || !Task_Levl_Id || !Task_Id || !Assigned_Emp_Id || !Emp_Id || !Sch_Period || !Sch_Time
            || !EN_Time || !Est_Start_Dt || !Sch_Type || !Est_End_Dt) {
            return invalidInput(
                res,
                `AN_No, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Sch_Period, Sch_Time, EN_Time, Est_Start_Dt, Est_End_Dt, Sch_Type are required`
            );
        }
    
        try {
            const request = new sql.Request();
    
            request.input('Mode', sql.TinyInt, 2);  
            request.input('AN_No', sql.BigInt, AN_No);  
            request.input('Project_Id', sql.BigInt, parseInt(Project_Id));
            request.input('Sch_Id', sql.BigInt, parseInt(Sch_Id));
            request.input('Task_Levl_Id', sql.BigInt, parseInt(Task_Levl_Id));
            request.input('Task_Id', sql.BigInt, parseInt(Task_Id));
            request.input('Assigned_Emp_Id', sql.Int, parseInt(Assigned_Emp_Id));
            request.input('Emp_Id', sql.Int, parseInt(Emp_Id));
            request.input('Task_Assign_dt', sql.DateTime, new Date().toISOString().split('T')[0]);
            request.input('Sch_Period', sql.NVarChar(50), Sch_Period);
            request.input('Sch_Time', sql.NVarChar(50), Sch_Time);
            request.input('EN_Time', sql.NVarChar(50), EN_Time);
            request.input('Est_Start_Dt', sql.DateTime, Est_Start_Dt);
            request.input('Est_End_Dt', sql.DateTime, Est_End_Dt);
            request.input('Ord_By', sql.Int, parseInt(Ord_By));
            request.input('Timer_Based', sql.Int, Boolean(Number(Timer_Based)) ? 1 : 0);
            request.input('Invovled_Stat', sql.Int, Boolean(Number(Invovled_Stat)) ? 1 : 0);  
            request.input('Is_Repitative', sql.Int, Boolean(Number(Is_Repitative)) ? 1 : 0);
            request.input('Sch_Type', sql.Int, parseInt(Sch_Type));
    
            request.input('IS_Rep_Monday', sql.Int, RepeatDays.Mon ? 1 : 0);
            request.input('IS_Rep_Tuesday', sql.Int, RepeatDays.Tue ? 1 : 0);
            request.input('IS_Rep_Wednesday', sql.Int, RepeatDays.Wed ? 1 : 0);
            request.input('IS_Rep_Thursday', sql.Int, RepeatDays.Thu ? 1 : 0);
            request.input('Is_Rep_Friday', sql.Int, RepeatDays.Fri ? 1 : 0);
            request.input('Is_Rep_Saturday', sql.Int, RepeatDays.Sat ? 1 : 0);
            request.input('Is_Rep_Sunday', sql.Int, RepeatDays.Sun ? 1 : 0);
    
            const result = await request.execute('Task_Assign_SP');
    
            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, [], 'Changes saved');
            } else {
                return failed(res, 'Failed to save changes or record not found');
            }
        } catch (e) {
            return servError(e, res);
        }
    };
    

    
    const deleteAssignedTaskDetails = async (req, res) => {

            const { Task_Id } = req.query;
            if (!Task_Id) {
                return invalidInput(res, 'Task_Id is required')
            }
    
            try {
                const request = (await new sql.Request()
                    .input('Task_Id', Task_Id)
                    .query(`
                            DELETE FROM tbl_Project_Sch_Task_DT where Task_Id =@Task_Id;
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
        
    
    };


    const selectedTaskDetails = async (req, res) => {
        const { projectId, Sch_Id,Task_Id } = req.query;
        if (!projectId || !Sch_Id || !Task_Id) { 
            return invalidInput(res, 'projectId and Sch_Id are required');
        }
    
        try {
            const request = await new sql.Request()
                .input('projectId', sql.Int, projectId) 
                .input('Sch_Id', sql.Int, Sch_Id)  
                .input('Task_Id',sql.Int,Task_Id)    
                .query(`
                   SELECT pstd.Sch_Type AS Sch_Name, pst.*
                   FROM tbl_Project_Sch_Task_DT pst
                   LEFT JOIN tbl_Project_Sch_Type pstd ON pst.Sch_Type_Id = pstd.Sch_Type_Id
                   WHERE pst.Sch_project_Id = @projectId 
                     AND pst.Sch_Id = @Sch_Id 
                     AND pst.Task_Id = @Task_Id;
                   
                `);
    
            if (request.recordset.length > 0) {
                dataFound(res, request.recordset);
            } else {
                noData(res);
            }
    
        } catch (e) {
            servError(e, res);
        }
    };
    
    return {
        getEmployeeTasks,
        getusersDropDown,
        postEmployeesProjects,
        getUsersProjectId,
        assignTaskForEmployee,
        getEmployeeAssignedInTheTask,
        modifyTaskAssignedForEmployee,
        deleteAssignedTaskDetails,
        selectedTaskDetails
    };
};

export default employeesTasks();
