import sql from 'mssql';
import { checkIsNumber, ISOString } from '../../helper_functions.mjs';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';

const EmployeeAndTasks = () => {

    const getTaskStartTime = async (req, res) => {
        const { Emp_Id } = req.query;

        if (!checkIsNumber(Emp_Id)) {
            return invalidInput(res, 'Emp_Id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Emp_Id', Emp_Id)
                .query(`SELECT TOP (1) * FROM tbl_Task_Start_Time WHERE Emp_Id = @Emp_Id`);

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset)
            } else {
                return failed(res, 'no data');
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postStartTime = async (req, res) => {
        const { Emp_Id, Time, Task_Id, ForcePost } = req.body;

        if (!checkIsNumber(Emp_Id) || !checkIsNumber(Task_Id) || !Time) {
            return invalidInput(res, 'Emp_Id, Time, Task_Id is required')
        }

        try {
            const checkResult = await new sql.Request()
                .input('Emp_Id', Emp_Id)
                .query(`SELECT * FROM tbl_Task_Start_Time WHERE Emp_Id = @Emp_Id;`);

            if (checkResult.recordset.length > 0 && ForcePost === 0) {
                return failed(res, 'Previous Task is Not Completed')
            } else {
                const insertTask = `
                INSERT INTO 
                    tbl_Task_Start_Time 
                    (Emp_Id, Time, Task_Id) 
                VALUES 
                    (@emp, @time, @taskid)`;
                const request = new sql.Request();
                request.input('emp', Emp_Id)
                request.input('time', Time)
                request.input('taskid', Task_Id)
                const result = await request.query(insertTask);

                if (result.rowsAffected.length > 0) {
                    return dataFound(res, [], 'Task started')
                } else {
                    return failed(res, 'Failed to start Task')
                }
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const deleteTaskTime = async (req, res) => {
        const { Emp_Id, Mode } = req.body;

        if (!checkIsNumber(Emp_Id)) {
            return invalidInput(res, 'Emp_Id is required')
        }

        try {
            if (Number(Mode) === 1) {
                const result = await new sql.Request()
                    .input('Emp_Id', Emp_Id)
                    .query(`DELETE FROM tbl_Task_Start_Time WHERE Emp_Id = @Emp_Id;`);

                if (result.rowsAffected.length > 0) {
                    return success(res, 'Task cancelled')
                } else {
                    return failed(res, 'Failed to cancel')
                }
            } else {
                return failed(res, 'Failed to Save')
            }


        } catch (e) {
            return servError(e, res)
        }
    }

    const getMyTasks = async (req, res) => {
        const { Emp_Id, reqDate } = req.query;

        if (!checkIsNumber(Emp_Id)) {
            return invalidInput(res, 'Emp_Id is required');
        }

        try {
            const request = new sql.Request()
                .input('Work_Date', reqDate ? ISOString(reqDate) : ISOString())
                .input('Emp_Id', Emp_Id)
                .query(`
                    SELECT  
                        T.*, 
                        W.SNo,
                        W.Work_Id,
                        W.Work_Dt,
                        W.Work_Done,
                        Start_Time,
                        End_Time,
                        Tot_Minutes,
                        Work_Status,
                        COALESCE((
                            SELECT * 
                            FROM Task_Param_DT_Fn() 
                            WHERE Task_Id = T.Task_Id 
                            FOR JSON PATH
                        ), '[]') AS Param_Dts
                    FROM 
                        Task_Details_Fill_Fn() T 
                    LEFT JOIN 
                        Work_Master_Daily_Fn(@Work_Date, @Emp_Id) W 
                        ON T.AN_No = W.AN_No
                        AND T.Emp_Id = W.Emp_Id 
                    WHERE 
                        T.Emp_Id = @Emp_Id
                        AND CONVERT(date, Est_Start_Dt, 102) <= CONVERT(date, @Work_Date, 102)
                        AND CONVERT(date, Est_End_Dt, 102) >= CONVERT(date, @Work_Date, 102)
                    ORDER BY 
                        Ord_By ASC
                    `);

            const result = await request;

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset.map(o => ({...o, Param_Dts: JSON.parse(o.Param_Dts)})))
            } else {
                return noData(res)
            }
        } catch (e) {
            return servError(e, res);
        }
    }

    const todayTasks = async (req, res) => {
        const { Emp_Id } = req.query;

        if (!Number(Emp_Id)) {
            return invalidInput(res, 'Emp_Id is required')
        }

        try {
            const query = `
            SELECT 
                td.*,
                (SELECT Name FROM tbl_Users WHERE UserId = td.Assigned_Emp_Id) AS Assigned_Name,
                (SELECT Name FROM tbl_Users WHERE UserId = td.Emp_Id) AS EmployeeName,
                (
                    SELECT 
                        u.Name 
                    FROM 
                        tbl_Users AS u 
                    JOIN
                        tbl_Project_Master p
                        ON u.UserId = p.Project_Head 
                    WHERE 
                        p.Project_Id = td.Project_Id
                ) AS Project_Head_Name,
                (SELECT Task_Name FROM tbl_Task WHERE Task_Id = td.Task_Id) AS Task_Name,
                (SELECT Task_Desc FROM tbl_Task WHERE Task_Id = td.Task_Id) AS Task_Desc,
                (SELECT Project_Name FROM tbl_Project_Master WHERE Project_Id = td.Project_Id) AS Project_Name
            FROM 
                tbl_Task_Details AS td
            WHERE 
                td.Emp_Id = @emp
            AND 
                CONVERT(DATE, td.Est_Start_Dt) <= CONVERT(DATE, @date)
            AND
                CONVERT(DATE, td.Est_End_Dt) >= CONVERT(DATE, @date)
            ORDER BY 
                CONVERT(TIME, td.Sch_Time, 108)`

            const request = new sql.Request()
            request.input('emp', Emp_Id)
            request.input('date', new Date().toISOString().split('T')[0])

            const result = await request.query(query)

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const EmployeeTaskDropDown = async (req, res) => {
        const { Emp_Id } = req.query;

        if (!checkIsNumber(Emp_Id)) {
            return invalidInput(res, 'Emp_Id is Required');
        }

        try {
            const query = `
            SELECT 
            	DISTINCT(wm.Task_Id),
            	COALESCE(t.Task_Name, 'unknown task') AS Task_Name
            FROM
            	tbl_Task_Details AS wm
            	LEFT JOIN tbl_Task AS t
            	ON t.Task_Id = wm.Task_Id
            WHERE
            	wm.Emp_Id = @emp`;

            const request = new sql.Request();
            request.input('emp', sql.BigInt, Emp_Id);

            const result = await request.query(query);

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
        getTaskStartTime,
        postStartTime,
        deleteTaskTime,
        getMyTasks,
        todayTasks,
        EmployeeTaskDropDown,
    }
}

export default EmployeeAndTasks();