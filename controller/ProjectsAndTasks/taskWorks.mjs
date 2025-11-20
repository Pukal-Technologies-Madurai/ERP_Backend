import sql from 'mssql';
import { checkIsNumber, ISOString, isValidDate } from '../../helper_functions.mjs';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';

const TaskWorks = () => {

    const getAllNewFormatData=async(req,res)=>{
          try {
        const { Emp_Id = null, Project_Id = null, Task_Id = null, Process_Id = null } = req.query;
        const from = req.query.from ? ISOString(req.query.from) : ISOString();
        const to = req.query.to ? ISOString(req.query.to) : ISOString();

        const query = `
SELECT
    wm.*,
    CASE 
        WHEN wm.Project_Id != 1 THEN ISNULL(p.Project_Name, '')
        ELSE ISNULL(wm.Additional_Project, '')
    END AS Project_Name,
    CASE 
        WHEN wm.Task_Id != 1 THEN ISNULL(t.Task_Name, '')
        ELSE ISNULL(wm.Additional_Task, '')
    END AS Task_Name,
    u.Name AS EmployeeName,
    s.Status AS WorkStatus,
    ISNULL(pm.Process_Name, '') as Process_Name,
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
            LEFT JOIN tbl_Paramet_Master AS tpm ON tpm.Paramet_Id = wpm.Param_Id 
        WHERE
            wpm.Work_Id = wm.Work_Id
        FOR JSON PATH
    ), '[]') AS Work_Param
FROM 
    tbl_Work_Master AS wm
    LEFT JOIN tbl_Project_Master AS p ON p.Project_Id = wm.Project_Id
    LEFT JOIN tbl_Task AS t ON t.Task_Id = wm.Task_Id
    LEFT JOIN tbl_Users AS u ON u.UserId = wm.Emp_Id
    LEFT JOIN tbl_Status AS s ON s.Status_Id = wm.Work_Status
    LEFT JOIN tbl_Process_Master AS pm ON pm.Id = wm.Process_Id
    LEFT JOIN tbl_Task_Details AS td ON td.Task_Levl_Id = wm.Task_Levl_Id AND wm.AN_No = td.AN_No
WHERE 
    (wm.AN_No = td.AN_No OR wm.AN_No = 0)
    AND CONVERT(DATE, wm.Work_Dt) >= CONVERT(DATE, @from)
    AND CONVERT(DATE, wm.Work_Dt) <= CONVERT(DATE, @to)
    AND (@Emp_Id IS NULL OR wm.Emp_Id = @Emp_Id)
    AND (@Project_Id IS NULL OR wm.Project_Id = @Project_Id)
    AND (@Task_Id IS NULL OR wm.Task_Id = @Task_Id)
    AND (@Process_Id IS NULL OR wm.Process_Id = @Process_Id)
ORDER BY 
    wm.Work_Dt DESC, 
    wm.Start_Time DESC`;

        const result = await new sql.Request()
            .input('Emp_Id', sql.BigInt, Emp_Id)
            .input('Project_Id', sql.BigInt, Project_Id)
            .input('Task_Id', sql.BigInt, Task_Id)
            .input('Process_Id', sql.BigInt, Process_Id)
            .input('from', sql.Date, from)
            .input('to', sql.Date, to)
            .query(query);

        if (result.recordset.length > 0) {
            const parsed = result.recordset.map(o => ({
                ...o,
                Work_Param: o.Work_Param && o.Work_Param !== '[]' ? JSON.parse(o.Work_Param) : []
            }));
            dataFound(res, parsed);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }

    }

  const getAllWorkedData = async (req, res) => {
        try {
            const { Emp_Id = '', Project_Id = '', Task_Id = '',Process_Id='' } = req.query;
            const from = req.query.from ? ISOString(req.query.from) : ISOString();
            const to = req.query.to ? ISOString(req.query.to) : ISOString();

            let query = `
             SELECT
    wm.*,
    CASE 
        WHEN wm.Project_Id != 1 THEN ISNULL(p.Project_Name, '')
        ELSE ISNULL(wm.Additional_Project, '')
    END AS Project_Name,
    CASE 
        WHEN wm.Task_Id != 1 THEN ISNULL(t.Task_Name, '')
        ELSE ISNULL(wm.Additional_Task, '')
    END AS Task_Name,
    u.Name AS EmployeeName,
    s.Status AS WorkStatus,
    ISNULL(pm.Process_Name, '') as Process_Name,
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
                    tbl_Process_Master AS pm ON pm.Id=wm.Process_Id
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
            if (Boolean(Number(Process_Id))) {
                query += ` 
                AND wm.Process_Id = @Process_Id`;
            }

            query += ` 
            AND CONVERT(DATE, Work_Dt) >= CONVERT(DATE, @from)`;
            query += ` 
            AND CONVERT(DATE, Work_Dt) <= CONVERT(DATE, @to) ORDER BY wm.Start_Time`;

            const result = await new sql.Request()
                .input('Emp_Id', Emp_Id)
                .input('Project_Id', Project_Id)
                .input('Task_Id', Task_Id) 
                  .input('Process_Id', Process_Id) 
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

    //   const postWorkedTask = async (req, res) => {

    //     try {

    //         const {
    //             Mode, Work_Id, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, AN_No, Emp_Id,
    //             Process_Id,
    //             Work_Dt, Work_Done, Start_Time, End_Time, Work_Status, Det_string,
    //             ProjectName,TaskName
    //         } = req.body;


    //         if (!Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Emp_Id || 
               
    //             !Work_Done || !Start_Time || !End_Time || !Work_Status) {
    //             return invalidInput(res, 'Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Emp_Id, Work_Done, Start_Time, End_Time, Work_Status is required')
    //         }

    //         if (Number(Mode) === 2 && Number(Work_Id) === 0) {
    //             return invalidInput(res, 'Work_Id is required')
    //         }

    //         const request = new sql.Request()
    //         request.input('Mode', Mode || 1)
    //         request.input('Work_Id', Work_Id)
    //         request.input('Project_Id', Project_Id)
    //         request.input('Sch_Id', Sch_Id)
    //         request.input('Task_Levl_Id', Task_Levl_Id)
    //         request.input('Task_Id', Task_Id)
    //         request.input('AN_No', AN_No)
    //         request.input('Emp_Id', Emp_Id)
    //         request.input('Process_Id',Process_Id || 0)
    //         request.input('Work_Dt', Work_Dt || new Date())
    //         request.input('Work_Done', Work_Done)
    //         request.input('Start_Time', Start_Time)
    //         request.input('End_Time', End_Time)
    //         request.input('Work_Status', Work_Status)
    //         request.input('Entry_By', Emp_Id)
    //         request.input('Entry_Date', new Date())
    //         request.input('Det_string', Det_string )
    //         request.input('Additional_Project',ProjectName)
    //         request.input('Additional_Task',TaskName)
          

    //         const result = await request.execute('Work_SP')
    //         if (result.rowsAffected && result.rowsAffected[0] > 0) {
    //             const Query = `DELETE FROM tbl_Task_Start_Time WHERE Emp_Id = '${Emp_Id}'`;
    //             await sql.query(Query);
    //             // success(res, [], 'Work Saved');
    //                return success(res, 'Work Saved');
    //         } else {
    //             failed(res, 'Failed to save work')
    //         }
    //     } catch (e) {
    //         servError(e, res)
    //     }
    // }


 const postWorkedTask = async (req, res) => {
    try {
        const {
            Mode, Work_Id, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, AN_No, Emp_Id,
            Process_Id,
            Work_Dt, Work_Done, Start_Time, End_Time, Work_Status, Det_string,
            ProjectName, TaskName
        } = req.body;

      
        if (!Project_Id || !Sch_Id || !Task_Levl_Id || !Task_Id || !Emp_Id || 
            !Work_Done || !Start_Time || !End_Time || !Work_Status) {
            return invalidInput(res, 'Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Emp_Id, Work_Done, Start_Time, End_Time, Work_Status is required')
        }

       
        const isValidTimeFormat = (timeStr) => {
            if (!timeStr || typeof timeStr !== 'string') return false;
            
            
            const cleanTime = timeStr.trim();
            const parts = cleanTime.split(':');
            
      
            if (parts.length !== 2) return false;
            
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            
    
            if (isNaN(hours) || isNaN(minutes)) return false;
            

            if (hours < 0 || hours > 23) return false;
            if (minutes < 0 || minutes > 59) return false;
            
            return true;
        };


        if (!isValidTimeFormat(Start_Time)) {
            return invalidInput(res, 'Start_Time must be in valid HH:MM format (00:00 to 23:59)')
        }

        if (!isValidTimeFormat(End_Time)) {
            return invalidInput(res, 'End_Time must be in valid HH:MM format (00:00 to 23:59)')
        }

   
        const formatTime = (timeStr) => {
            const parts = timeStr.split(':');
            const hours = parts[0].padStart(2, '0');
            const minutes = parts[1].padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        const formattedStartTime = formatTime(Start_Time);
        const formattedEndTime = formatTime(End_Time);

      
        
      

        if (Number(Mode) === 2 && Number(Work_Id) === 0) {
            return invalidInput(res, 'Work_Id is required for Mode 2')
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
        request.input('Process_Id', Process_Id || 0)
        request.input('Work_Dt', Work_Dt || new Date())
        request.input('Work_Done', Work_Done)
        request.input('Start_Time', formattedStartTime) 
        request.input('End_Time', formattedEndTime)   
        request.input('Work_Status', Work_Status)
        request.input('Entry_By', Emp_Id)
        request.input('Entry_Date', new Date())
        request.input('Det_string', Det_string)
        request.input('Additional_Project', ProjectName)
        request.input('Additional_Task', TaskName)

        const result = await request.execute('Work_SP')
        if (result.rowsAffected && result.rowsAffected[0] > 0) {
            const Query = `DELETE FROM tbl_Task_Start_Time WHERE Emp_Id = '${Emp_Id}'`;
            await sql.query(Query);
            return success(res, 'Work Saved');
        } else {
            failed(res, 'Failed to save work')
        }
    } catch (e) {
        servError(e, res)
    }
}


const updateWorkedTask = async (req, res) => {
    try {
        const {
            Mode, Work_Id, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, AN_No, Emp_Id,
            Process_Id, Work_Dt, Work_Done, Start_Time, End_Time, Work_Status,
            Det_string, Additional_Project, Additional_Task, Entry_By
        } = req.body;

        console.log('Updating work data:', {
            Mode, Work_Id, Project_Id, Sch_Id, Task_Levl_Id, Task_Id, AN_No, Emp_Id,
            Process_Id, Work_Dt, Work_Done, Start_Time, End_Time, Work_Status,
            Additional_Project, Additional_Task, Det_string
        });


        if (!Work_Id) {
            return invalidInput(res, 'Work_Id is required for update');
        }

        const requiredFields = [
            'Project_Id', 'Sch_Id', 'Task_Levl_Id', 'Task_Id', 'Emp_Id',
            'Work_Done', 'Start_Time', 'End_Time', 'Work_Status'
        ];

        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return invalidInput(res, `Missing required fields: ${missingFields.join(', ')}`);
        }

        
        const checkQuery = `SELECT Work_Id FROM tbl_Work_Master WHERE Work_Id = '${Work_Id}'`;
        const existingWork = await sql.query(checkQuery);
        
        if (!existingWork.recordset || existingWork.recordset.length === 0) {
            return invalidInput(res, `Work with ID ${Work_Id} not found`);
        }

       
        const isValidTimeFormat = (timeStr) => {
            if (!timeStr || typeof timeStr !== 'string') return false;
            
            const cleanTime = timeStr.trim();
            const parts = cleanTime.split(':');
            
            if (parts.length !== 2) return false;
            
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            
            if (isNaN(hours) || isNaN(minutes)) return false;
            if (hours < 0 || hours > 23) return false;
            if (minutes < 0 || minutes > 59) return false;
            
            return true;
        };

        if (!isValidTimeFormat(Start_Time)) {
            return invalidInput(res, 'Start_Time must be in valid HH:MM format (00:00 to 23:59)');
        }

        if (!isValidTimeFormat(End_Time)) {
            return invalidInput(res, 'End_Time must be in valid HH:MM format (00:00 to 23:59)');
        }


        const startTimeObj = new Date(`1970-01-01T${Start_Time}:00`);
        const endTimeObj = new Date(`1970-01-01T${End_Time}:00`);
        
        if (endTimeObj <= startTimeObj) {
            return invalidInput(res, 'End_Time must be after Start_Time');
        }

  
        const formatTime = (timeStr) => {
            const parts = timeStr.split(':');
            const hours = parts[0].padStart(2, '0');
            const minutes = parts[1].padStart(2, '0');
            return `${hours}:${minutes}`;
        };

        const formattedStartTime = formatTime(Start_Time);
        const formattedEndTime = formatTime(End_Time);


        const formatDateForSQL = (dateStr) => {
            if (!dateStr) return new Date();
            
          
            if (dateStr.includes('T')) {
                const datePart = dateStr.split('T')[0];
                return new Date(datePart);
            }
            
            return new Date(dateStr);
        };

        const formattedWorkDate = formatDateForSQL(Work_Dt);

     
        let formattedDetString = null;
        if (Det_string && Array.isArray(Det_string) && Det_string.length > 0) {
        
            formattedDetString = `<?xml version="1.0"?>
<DocumentElement>
    ${Det_string.map(param => `
    <Data>
        <Task_Id>${param.Task_Id || Task_Id || 0}</Task_Id>
        <Param_Id>${param.Param_Id || 0}</Param_Id>
        <Default_Value>${param.Default_Value || ''}</Default_Value>
        <Current_Value>${param.Current_Value || ''}</Current_Value>
    </Data>
    `).join('')}
</DocumentElement>`;
        } else if (Det_string === null || Det_string === 'null') {
            formattedDetString = null;
        }

        console.log('Formatted Det_string:', formattedDetString);

        const request = new sql.Request();
        

        console.log("bwedifrestoerw procedure")

        request.input('Mode',  2) 
        request.input('Work_Id', parseInt(Work_Id))
        request.input('Project_Id',  parseInt(Project_Id))
        request.input('Sch_Id',parseInt(Sch_Id))
        request.input('Task_Levl_Id', parseInt(Task_Levl_Id))
        request.input('Task_Id', parseInt(Task_Id))
        request.input('AN_No', parseInt(AN_No))
        request.input('Emp_Id',  parseInt(Emp_Id))
        request.input('Process_Id', parseInt(Process_Id) || 0)
        request.input('Work_Dt', formattedWorkDate)
        request.input('Work_Done', Work_Done)
        request.input('Start_Time',  formattedStartTime)
        request.input('End_Time',formattedEndTime)
        request.input('Work_Status', parseInt(Work_Status))
        request.input('Entry_By',parseInt(Entry_By || Emp_Id))
        request.input('Entry_Date',  '2025-10-10')
        request.input('Det_string',  formattedDetString)
        request.input('Additional_Project', Additional_Project || '')
        request.input('Additional_Task', Additional_Task || '')

        console.log('Calling stored procedure with parameters...');
        
        const result = await request.execute('Work_SP');
        
        console.log('Stored procedure result:', result);

        if (result.recordset && result.recordset.length > 0) {
            const updatedWorkId = result.recordset[0].Work_Id;
            
            console.log(`Work updated successfully - Work_Id: ${updatedWorkId}`);
            return success(res, 'Work updated successfully', { 
                Work_Id: updatedWorkId,
                message: 'Work record updated successfully'
            });
        } else {
            console.error('No result returned from stored procedure');
            return failed(res, 'Failed to update work - no result returned from stored procedure');
        }
    } catch (error) {
        console.error('Error updating work:', error);
        
        // Check if it's a SQL error from the stored procedure
        if (error.message && error.message.includes('Invalid Start_Time format')) {
            return invalidInput(res, 'Invalid Start Time format');
        }
        if (error.message && error.message.includes('Invalid End_Time format')) {
            return invalidInput(res, 'Invalid End Time format');
        }
        
        // More specific error handling
        if (error.originalError && error.originalError.info) {
            console.error('SQL Server Error:', error.originalError.info);
            return failed(res, `Database error: ${error.originalError.info.message}`);
        }
        
        servError(error, res);
    }
};


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

    const getProcessDetails=async(req,res)=>{
         try {
                   const request = new sql.Request()
                        .query(`SELECT Id,Process_Name FROM tbl_Process_Master ORDER BY Id`)
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
    return {
        getAllNewFormatData,
        getAllWorkedData,
        postWorkedTask,
        getAllGroupedWorkedData,
        taskWorkDetailsPieChart,
        taskWorkDetailsBarChart,
        getProcessDetails
    }
}

export default TaskWorks();