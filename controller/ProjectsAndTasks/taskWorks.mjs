import sql from 'mssql';
import { checkIsNumber, ISOString, isValidDate } from '../../helper_functions.mjs';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';

const TaskWorks = () => {

    const getAllWorkedData = async (req, res) => {
        try {
            const { Emp_Id = '', Project_Id = '', Task_Id = '' } = req.query;
            const from = req.query.from ? ISOString(req.query.from) : ISOString();
            const to = req.query.to ? ISOString(req.query.to) : ISOString();

            let query = `
                SELECT
                    wm.*,
                    p.Project_Name,
                    t.Task_Name,
                    u.Name AS EmployeeName,
                    s.Status AS WorkStatus,
                    COALESCE(
                        (SELECT Timer_Based FROM tbl_Task_Details WHERE AN_No = wm.AN_No), 
                        0
                    ) AS Timer_Based,
					COALESCE((
						SELECT
							wpm.*,
							tpm.Paramet_Name,
							tpm.Paramet_Data_Type
						FROM
							tbl_Work_Paramet_DT AS wpm
							LEFT JOIN tbl_Paramet_Master AS tpm
							ON tpm.Paramet_Id = wpm.Param_Id 
						WHERE
							wpm.Work_Id = wm.Work_Id
						FOR JSON PATH
					), '[]') AS Work_Param
                FROM 
                    tbl_Work_Master AS wm
                LEFT JOIN
                    tbl_Project_Master AS p ON p.Project_Id = wm.Project_Id
                LEFT JOIN 
                    tbl_Task AS t ON t.Task_Id = wm.Task_Id
                LEFT JOIN
                    tbl_Users AS u ON u.UserId = wm.Emp_Id
                LEFT JOIN
                    tbl_Status AS s ON s.Status_Id = wm.Work_Status
                LEFT JOIN
                    tbl_Task_Details AS td ON td.Task_Levl_Id = wm.Task_Levl_Id
                WHERE 
                    (wm.AN_No = td.AN_No OR wm.AN_No = 0)`;

            if (Emp_Id) {
                query += ` 
                AND wm.Emp_Id = @Emp_Id`;
            }
            if (Boolean(Number(Project_Id))) {
                query += ` 
                AND wm.Project_Id = @Project_Id`;
            }
            if (Boolean(Number(Task_Id))) {
                query += ` 
                AND wm.Task_Id = @Task_Id`;
            }

            query += ` 
            AND CONVERT(DATE, Work_Dt) >= CONVERT(DATE, @from)`;
            query += ` 
            AND CONVERT(DATE, Work_Dt) <= CONVERT(DATE, @to) ORDER BY wm.Start_Time`;

            const result = await new sql.Request()
                .input('Emp_Id', sql.BigInt, Emp_Id)
                .input('Project_Id', sql.BigInt, Project_Id)
                .input('Task_Id', sql.BigInt, Task_Id)
                .input('from', sql.Date, from)
                .input('to', sql.Date, to)
                .query(query);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Work_Param: JSON.parse(o?.Work_Param)
                }))
                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const postWorkedTask = async (req, res) => {

        try {

            const {
                Mode, Work_Id, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, AN_No, Emp_Id,
                Work_Dt, Work_Done, Start_Time, End_Time, Work_Status, Det_string
            } = req.body;

            if (!Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Emp_Id || !Work_Done || !Start_Time || !End_Time || !Work_Status) {
                return invalidInput(res, 'Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Emp_Id, Work_Done, Start_Time, End_Time, Work_Status is required')
            }

            if (Number(Mode) === 2 && Number(Work_Id) === 0) {
                return invalidInput(res, 'Work_Id is required')
            }

            const request = new sql.Request()
            request.input('Mode', Mode || 1)
            request.input('Work_Id', Work_Id)
            request.input('Project_Id', Project_Id)
            request.input('Sch_Id', Sch_Id)
            request.input('Task_Levl_Id', Task_Levl_Id)
            request.input('Task_Id', Task_Id)
            request.input('AN_No', AN_No)
            request.input('Emp_Id', Emp_Id)
            request.input('Work_Dt', Work_Dt || new Date())
            request.input('Work_Done', Work_Done)
            request.input('Start_Time', Start_Time)
            request.input('End_Time', End_Time)
            request.input('Work_Status', Work_Status)
            request.input('Entry_By', Emp_Id)
            request.input('Entry_Date', new Date());
            request.input('Det_string', Det_string);

            const result = await request.execute('Work_SP')
            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                const Query = `DELETE FROM tbl_Task_Start_Time WHERE Emp_Id = '${Emp_Id}'`;
                await sql.query(Query);
                success(res, [], 'Work Saved');
            } else {
                failed(res, 'Failed to save work')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getAllGroupedWorkedData = async (req, res) => {
        try {

            const { Emp_Id = '', Project_Id = '', Task_Id = '' } = req.query;
            const from = req.query.from ? ISOString(req.query.from) : ISOString();
            const to = req.query.to ? ISOString(req.query.to) : ISOString();

            let query = `
            SELECT 
            	tty.Task_Type_Id,
            	tty.Task_Type,
                    
            	COALESCE(
            		(
            			SELECT
            				wm.*,
                            p.Project_Name,
                            t.Task_Name,
                            u.Name AS EmployeeName,
                            s.Status AS WorkStatus,
                            COALESCE(
            					(
            						SELECT 
            							Timer_Based 
            						FROM 
            							tbl_Task_Details 
            						WHERE 
            							AN_No = wm.AN_No
            					), 0
            				) AS Timer_Based,

                            COALESCE((
                                SELECT
                                    wpm.*,
                                    tpm.Paramet_Name,
                                    tpm.Paramet_Data_Type
                                FROM
                                    tbl_Work_Paramet_DT AS wpm
                                    LEFT JOIN tbl_Paramet_Master AS tpm
                                    ON tpm.Paramet_Id = wpm.Param_Id 
                                WHERE
                                    wpm.Work_Id = wm.Work_Id
                                FOR JSON PATH
                            ), '[]') AS Work_Param
                        
            			FROM 
            				tbl_Work_Master AS wm
                        
            			LEFT JOIN
                                tbl_Project_Master AS p ON p.Project_Id = wm.Project_Id
            			LEFT JOIN 
                                tbl_Task AS t ON t.Task_Id = wm.Task_Id
            			LEFT JOIN
                                tbl_Users AS u ON u.UserId = wm.Emp_Id
            			LEFT JOIN
                                tbl_Status AS s ON s.Status_Id = wm.Work_Status
            			LEFT JOIN
                                tbl_Task_Details AS td ON td.Task_Levl_Id = wm.Task_Levl_Id
                        
                        WHERE 
                            (wm.AN_No = td.AN_No OR wm.AN_No = 0)
            			AND
            				t.Task_Group_Id = tty.Task_Type_Id
            `

            if (Emp_Id) {
                query += ` 
                AND wm.Emp_Id = @Emp_Id`;
            }
            if (Boolean(Number(Project_Id))) {
                query += ` 
                AND wm.Project_Id = @Project_Id`;
            }
            if (Boolean(Number(Task_Id))) {
                query += ` 
                AND wm.Task_Id = @Task_Id`;
            }
            if (from && to) {
                query += ` 
                AND 
                    CONVERT(DATE, Work_Dt) >= CONVERT(DATE, @from)
                AND 
                    CONVERT(DATE, Work_Dt) <= CONVERT(DATE, @to)`;
            }

            query += `
                        ORDER BY wm.Start_Time
                        FOR JSON PATH
            		), '[]'
            	) AS TASK_GROUP
            
            FROM 
            	tbl_Task_Type AS tty`;
            const result = await new sql.Request()
                .input('Emp_Id', sql.BigInt, Emp_Id)
                .input('Project_Id', sql.BigInt, Project_Id)
                .input('Task_Id', sql.BigInt, Task_Id)
                .input('from', sql.Date, from)
                .input('to', sql.Date, to)
                .query(query);

            if (result.recordset.length > 0) {

                const parsedResponse = result.recordset.map(o => ({
                    ...o,
                    TASK_GROUP: JSON.parse(o?.TASK_GROUP)
                }))

                const levelTwoParsed = parsedResponse.map(o => ({
                    ...o,
                    TASK_GROUP: o?.TASK_GROUP?.map(oo => ({
                        ...oo,
                        Work_Param: JSON.parse(oo?.Work_Param)
                    }))
                }))

                dataFound(res, levelTwoParsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const taskWorkDetailsPieChart = async (req, res) => {
        const { Emp_Id = '' } = req.query;
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();

        try {
            let query = `
            SELECT 
                CONVERT(DATE, wm.Work_Dt) AS Work_Date,
                t.Task_Name,
                emp.Name AS Employee_Name,
                SUM(DATEDIFF(MINUTE, wm.Start_Time, wm.End_Time)) AS Total_Worked_Minutes
            FROM
                tbl_Work_Master AS wm
            LEFT JOIN
                tbl_Task AS t ON t.Task_Id = wm.Task_Id
            LEFT JOIN
                tbl_Users AS emp ON emp.UserId = wm.Emp_Id
            WHERE
                t.Task_Id != 2
            `;

            if (Number(Emp_Id)) {
                query += `
                AND wm.Emp_Id = @Emp_Id
                `
            }
            if (reqDate) {
                query += `
                AND CONVERT(DATE, wm.Work_Dt) = CONVERT(DATE, @reqDate)
                `
            }

            query += `
            GROUP BY
                CONVERT(DATE, wm.Work_Dt),
                t.Task_Name,
                emp.Name
            ORDER BY
                Work_Date
            `

            const request = new sql.Request()
                .input('Emp_Id', Emp_Id)
                .input('reqDate', reqDate)
                .query(query)
            const result = await request

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const taskWorkDetailsBarChart = async (req, res) => {
        const { Emp_Id = '', Task_Id = '' } = req.query;
        const From = req.query.From ? ISOString(req.query.From) : ISOString();
        const To = req.query.To ? ISOString(req.query.To) : ISOString();

        if (!checkIsNumber(Task_Id)) {
            return invalidInput(res, 'Task_Id, From, To is required, Emp_Id is optional')
        }

        try {
            let query = `
            SELECT 
                CONVERT(DATE, wm.Work_Dt) AS Work_Dt,
                t.Task_Id,
                t.Task_Name,
                wm.Emp_Id,
                emp.Name AS Employee_Name,
                wm.Start_Time,
                wm.End_Time,
                DATEDIFF(MINUTE, wm.Start_Time, wm.End_Time) AS Worked_Minutes 
            FROM
                tbl_Work_Master AS wm
                LEFT JOIN tbl_Task AS t 
                ON t.Task_Id = wm.Task_Id
                LEFT JOIN tbl_Users AS emp 
                ON emp.UserId = wm.Emp_Id
            WHERE
                t.Task_Id = @Task_Id
                AND	CONVERT(DATE, wm.Work_Dt) >= CONVERT(DATE, @From)
                AND	CONVERT(DATE, wm.Work_Dt) <= CONVERT(DATE, @To)
            `;

            if (Number(Emp_Id)) {
                query += ` AND wm.Emp_Id = @Emp_Id `
            }
            query += ` ORDER BY CONVERT(DATE, wm.Work_Dt) `;

            const request = new sql.Request()
                .input('Task_Id', sql.BigInt, Task_Id)
                .input('From', sql.Date, From)
                .input('To', sql.Date, To)
                .input('Emp_Id', sql.BigInt, Emp_Id)
                .query(query);

            const result = await request;

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
        getAllWorkedData,
        postWorkedTask,
        getAllGroupedWorkedData,
        taskWorkDetailsPieChart,
        taskWorkDetailsBarChart,
    }
}

export default TaskWorks();