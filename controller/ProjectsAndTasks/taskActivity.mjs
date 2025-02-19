import sql from 'mssql';
import { checkIsNumber } from '../../helper_functions.mjs';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';

const TaskActivity = () => {

    const getEmployeeAssignedInTheTask = async (req, res) => {
        const { Task_Levl_Id } = req.query;

        if (!Task_Levl_Id) {
            return invalidInput(res, 'Task_Levl_Id is required');
        }

        try {
            const getQuery = `
            SELECT 
                td.*,
                (SELECT Name FROM tbl_Users WHERE UserId = td.Assigned_Emp_Id) AS AssignedUser,
                (SELECT Name FROM tbl_Users WHERE UserId = td.Emp_Id) AS EmployeeName,
                (SELECT Task_Name FROM tbl_Task WHERE Task_Id = td.Task_Id) AS TaskNameGet
            FROM 
                tbl_Task_Details AS td
            WHERE 
                td.Task_Levl_Id = @taskid`

            const request = new sql.Request()
            request.input('taskid', Task_Levl_Id)

            const result = await request.query(getQuery)

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const assignTaskForEmployee = async (req, res) => {
        const {
            Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Sch_Period, Sch_Time,
            EN_Time, Est_Start_Dt, Est_End_Dt, Ord_By, Timer_Based
        } = req.body;

        if (!Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Assigned_Emp_Id || !Emp_Id || !Sch_Period || !Sch_Time
            || !EN_Time || !Est_Start_Dt || !Est_End_Dt) {
            return invalidInput(res, `
            Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Sch_Period, Sch_Time,
            EN_Time, Est_Start_Dt, Est_End_Dt, Ord_By is required`)
        }

        try {

            const request = new sql.Request()
            request.input('Mode', 1)
            request.input('AN_No', '')
            request.input('Project_Id', Project_Id)
            request.input('Sch_Id', Sch_Id)
            request.input('Task_Levl_Id', Task_Levl_Id)
            request.input('Task_Id', Task_Id)
            request.input('Assigned_Emp_Id', Assigned_Emp_Id)
            request.input('Emp_Id', Emp_Id)
            request.input('Task_Assign_dt', new Date().toISOString().split('T')[0])
            request.input('Sch_Period', Sch_Period)
            request.input('Sch_Time', Sch_Time)
            request.input('EN_Time', EN_Time)
            request.input('Est_Start_Dt', Est_Start_Dt)
            request.input('Est_End_Dt', Est_End_Dt)
            request.input('Ord_By', Number(Ord_By) || 1)
            request.input('Timer_Based', Boolean(Number(Timer_Based)) ? 1 : 0)
            request.input('Invovled_Stat', 1)

            const result = await request.execute('Task_Assign_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Task assigned')
            } else {
                failed(res, 'Failed to assign task')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const modifyTaskAssignedForEmployee = async (req, res) => {
        const {
            AN_No, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Task_Assign_dt, Sch_Period, Sch_Time,
            EN_Time, Est_Start_Dt, Est_End_Dt, Ord_By, Timer_Based, Invovled_Stat
        } = req.body;

        if (!AN_No || !Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Assigned_Emp_Id || !Emp_Id || !Sch_Period || !Sch_Time
            || !EN_Time || !Est_Start_Dt || !Est_End_Dt) {
            return invalidInput(res, `
            AN_No, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Assigned_Emp_Id, Emp_Id, Sch_Period, Sch_Time,
            EN_Time, Est_Start_Dt, Est_End_Dt is required`)
        }

        try {

            const request = new sql.Request()
            request.input('Mode', 2)
            request.input('AN_No', AN_No)
            request.input('Project_Id', Project_Id)
            request.input('Sch_Id', Sch_Id)
            request.input('Task_Levl_Id', Task_Levl_Id)
            request.input('Task_Id', Task_Id)
            request.input('Assigned_Emp_Id', Assigned_Emp_Id)
            request.input('Emp_Id', Emp_Id)
            request.input('Task_Assign_dt', Task_Assign_dt || new Date().toISOString().split('T')[0])
            request.input('Sch_Period', Sch_Period)
            request.input('Sch_Time', Sch_Time)
            request.input('EN_Time', EN_Time)
            request.input('Est_Start_Dt', Est_Start_Dt)
            request.input('Est_End_Dt', Est_End_Dt)
            request.input('Ord_By', Number(Ord_By) || 1)
            request.input('Timer_Based', Boolean(Number(Timer_Based)) ? 1 : 0)
            request.input('Invovled_Stat', Boolean(Number(Invovled_Stat)) ? 1 : 0)

            const result = await request.execute('Task_Assign_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, [], 'Changes saved')
            } else {
                failed(res, 'Failed to save changes')
            }


        } catch (e) {
            servError(e, res)
        }
    }

    const getWorkedDetailsForTask = async (req, res) => {
        const { Task_Levl_Id } = req.query;

        if (!checkIsNumber(Task_Levl_Id)) {
            return invalidInput(res, 'Task_Levl_Id is required')
        }

        try {
            const query = `
            SELECT
                wm.*,
                t.Task_Name,
                u.Name AS EmployeeName,
                s.Status AS WorkStatus,

                COALESCE(
                    (SELECT Timer_Based FROM tbl_Task_Details WHERE AN_No = wm.AN_No), 
                    0
                ) AS Timer_Based
                
            FROM 
                tbl_Work_Master AS wm
            LEFT JOIN 
                tbl_Task AS t ON t.Task_Id = wm.Task_Id
            LEFT JOIN
                tbl_Users AS u ON u.UserId = wm.Emp_Id
            LEFT JOIN
                tbl_Status AS s ON s.Status_Id = wm.Work_Status
                
            WHERE 
				wm.Task_Levl_Id = @Task_Levl_Id
                
            ORDER BY 
                wm.Start_Time`

            const result = await new sql.Request().input('Task_Levl_Id', Task_Levl_Id).query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getTaskAssignedUsers = async (req, res) => {

        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {

            const result = await new sql.Request()
                .input('Comp', Company_id)
                .query(`
                SELECT 
                    td.Emp_Id AS UserId,
                    u.Name
                FROM 
                    tbl_Work_Master AS td
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = td.Emp_Id
                GROUP BY
                    td.Emp_Id,
                    u.Name`);
                    
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

    const getAssignedTasks = async (req, res) => {
        try {
            const query = `
            SELECT
                td.Task_Id,
                t.Task_Name
            FROM
                tbl_Work_Master AS td
                LEFT JOIN tbl_Task AS t
                ON t.Task_Id = td.Task_Id
            GROUP BY
                td.Task_Id,
                t.Task_Name`;

            const result = await sql.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getFilteredUsersBasedOnTasks = async (req, res) => {
        const { Task_Id } = req.query;

        if (!checkIsNumber(Task_Id)) {
            return invalidInput(res, 'Task_Id is required');
        }

        try {
            const query = `
            SELECT 
                td.Emp_Id,
                u.Name
            FROM 
                tbl_Work_Master AS td
                LEFT JOIN tbl_Users AS u
                ON u.UserId = td.Emp_Id
            WHERE 
                td.Task_Id = @task_id
            GROUP BY
                td.Emp_Id,
                u.Name`;

            const request = new sql.Request();
            request.input('task_id', Task_Id);

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

    return {
        getEmployeeAssignedInTheTask,
        assignTaskForEmployee,
        modifyTaskAssignedForEmployee,
        getWorkedDetailsForTask, 
        getTaskAssignedUsers,
        getAssignedTasks,
        getFilteredUsersBasedOnTasks,
    }
}

export default TaskActivity();