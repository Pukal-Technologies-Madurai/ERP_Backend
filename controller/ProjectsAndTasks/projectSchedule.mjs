import sql from 'mssql';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';

import { checkIsNumber, ISOString } from '../../helper_functions.mjs';

const ProjectScheduler = () => {

    const getScheduleType = async (req, res) => {
        try {
            const result = (await sql.query(`SELECT * FROM tbl_Project_Sch_Type`)).recordset;

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const getSchedule = async (req, res) => {
        const { Project_Id } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required')
        }

        try {
            const getProjectScheduleQuery = `
            SELECT 
                s.Sch_Id,
                CONVERT(DATE, s.Sch_Date) AS Sch_Date,
                s.Sch_By,
                (SELECT Name FROM tbl_Users WHERE UserId = s.Sch_By) AS SchByGet,
                s.Sch_Type_Id, 
                (SELECT Sch_Type FROM tbl_Project_Sch_Type WHERE Sch_Type_Id = s.Sch_Type_Id) AS SchTypGet,
                (SELECT Sch_Days FROM tbl_Project_Sch_Type WHERE Sch_Type_Id = s.Sch_Type_Id) AS SchDays,
                CONVERT(DATE, s.Sch_Est_Start_Date) AS Sch_Est_Start_Date,
                CONVERT(DATE, s.Sch_Est_End_Date) AS Sch_Est_End_Date,
                s.Sch_Status,
                (SELECT Status FROM tbl_Status WHERE Status_Id = s.Sch_Status) AS SchStatusGet,
                s.Entry_By,
                (SELECT Name FROM tbl_Users WHERE UserId = s.Entry_By) AS EntryByGet,
                s.Entry_Date,
                s.Update_By,
                s.Update_Date,

                ISNULL((
                    SELECT 
                        tty.Task_Type_Id,
                        tty.Task_Type,
                        ISNULL((
                            SELECT 
                                pst.A_Id,
                                pst.Task_Levl_Id,
                                pst.Task_Id,
                                pst.Type_Task_Id,
                                pst.Task_Sch_Duaration,
                                pst.Task_Start_Time,
                                pst.Task_End_Time,
                                pst.Task_Est_Start_Date,
                                pst.Task_Est_End_Date,
                                pst.Task_Sch_Status,
                                (SELECT Task_Name FROM tbl_Task WHERE Task_Id = pst.Task_Id) AS TaskNameGet,
                                (SELECT Task_Type FROM tbl_Task_Type WHERE Task_Type_Id = pst.Type_Task_Id) AS TaskTypeGet,
                                (SELECT Status FROM tbl_Status WHERE Status_Id = pst.Task_Sch_Status) AS TaskSchStatusGet
                            FROM 
                                tbl_Project_Sch_Task_DT AS pst
                            WHERE 
                                pst.Sch_Id = s.Sch_Id
                                AND 
                                pst.Levl_Id = 1
                                AND 
                                pst.Task_Sch_Del_Flag = 0
                                AND
                                pst.Type_Task_Id = tty.Task_Type_Id
                            ORDER BY
                                pst.Task_Est_Start_Date
                            FOR JSON PATH
                        ), '[]') AS TaskGroup
                    FROM 
                        tbl_Task_Type AS tty
                    FOR JSON PATH
                ), '[]') AS LevelOneTasks,
                    
                ISNULL((
                    SELECT 
                        tty.Task_Type_Id,
                        tty.Task_Type,
                        ISNULL((
                            SELECT 
                                pst.A_Id,
                                pst.Task_Levl_Id,
                                pst.Task_Id,
                                pst.Type_Task_Id,
                                pst.Task_Sch_Duaration,
                                pst.Task_Start_Time,
                                pst.Task_End_Time,
                                pst.Task_Est_Start_Date,
                                pst.Task_Est_End_Date,
                                pst.Task_Sch_Status,
                                (SELECT Task_Name FROM tbl_Task WHERE Task_Id = pst.Task_Id) AS TaskNameGet,
                                (SELECT Task_Type FROM tbl_Task_Type WHERE Task_Type_Id = pst.Type_Task_Id) AS TaskTypeGet,
                                (SELECT Status FROM tbl_Status WHERE Status_Id = pst.Task_Sch_Status) AS TaskSchStatusGet,
                                ISNULL((
                                    SELECT
                                        psdt.A_Id,
                                        psdt.Task_Levl_Id,
                                        psdt.Task_Depend_Level_Id,
                                        (SELECT Task_Name FROM tbl_Task WHERE Task_Id = tpstdt.Task_Id) AS TaskNameGet 
                                    FROM tbl_Project_Sch_Task_Depend_DT AS psdt
                                    JOIN tbl_Project_Sch_Task_DT AS tpstdt ON tpstdt.Task_Levl_Id = psdt.Task_Depend_Level_Id
                                    WHERE psdt.Task_Levl_Id = pst.Task_Levl_Id
                                    FOR JSON PATH
                                ), '[]') AS DependancyTasks
                            FROM 
                                tbl_Project_Sch_Task_DT AS pst
                            WHERE 
                                pst.Sch_Id = s.Sch_Id
                                AND 
                                pst.Levl_Id = 2
                                AND 
                                pst.Task_Sch_Del_Flag = 0
                                AND
                                pst.Type_Task_Id = tty.Task_Type_Id
                            ORDER BY
                                pst.Task_Est_Start_Date
                            FOR JSON PATH
                        ), '[]') AS TaskGroup
                    FROM 
                        tbl_Task_Type AS tty
                    FOR JSON PATH
                ), '[]') AS LevelTwoTasks,
                
                ISNULL((
                    SELECT 
                        tty.Task_Type_Id,
                        tty.Task_Type,
                        ISNULL((
                            SELECT 
                                pst.A_Id,
                                pst.Task_Levl_Id,
                                pst.Task_Id,
                                pst.Type_Task_Id,
                                pst.Task_Sch_Duaration,
                                pst.Task_Start_Time,
                                pst.Task_End_Time,
                                pst.Task_Est_Start_Date,
                                pst.Task_Est_End_Date,
                                pst.Task_Sch_Status,
                                (SELECT Task_Name FROM tbl_Task WHERE Task_Id = pst.Task_Id) AS TaskNameGet,
                                (SELECT Task_Type FROM tbl_Task_Type WHERE Task_Type_Id = pst.Type_Task_Id) AS TaskTypeGet,
                                (SELECT Status FROM tbl_Status WHERE Status_Id = pst.Task_Sch_Status) AS TaskSchStatusGet,
                                ISNULL((
                                    SELECT
                                        psdt.A_Id,
                                        psdt.Task_Levl_Id,
                                        psdt.Task_Depend_Level_Id,
                                        (SELECT Task_Name FROM tbl_Task WHERE Task_Id = tpstdt.Task_Id) AS TaskNameGet 
                                    FROM tbl_Project_Sch_Task_Depend_DT AS psdt
                                    JOIN tbl_Project_Sch_Task_DT AS tpstdt ON tpstdt.Task_Levl_Id = psdt.Task_Depend_Level_Id
                                    WHERE psdt.Task_Levl_Id = pst.Task_Levl_Id
                                    FOR JSON PATH
                                ), '[]') AS DependancyTasks
                            FROM 
                                tbl_Project_Sch_Task_DT AS pst
                            WHERE 
                                pst.Sch_Id = s.Sch_Id
                                AND 
                                pst.Levl_Id = 3
                                AND 
                                pst.Task_Sch_Del_Flag = 0
                                AND
                                pst.Type_Task_Id = tty.Task_Type_Id
                            ORDER BY
                                pst.Task_Est_Start_Date
                            FOR JSON PATH
                        ), '[]') AS TaskGroup
                    FROM 
                        tbl_Task_Type AS tty
                    FOR JSON PATH
                ), '[]') AS LevelThreeTasks
                                                   
            FROM 
                tbl_Project_Schedule AS s
            WHERE 
                s.Sch_Del_Flag = 0
                AND
                s.Project_Id = @proid
            ORDER BY 
                s.Sch_Est_Start_Date`;


            const request = new sql.Request();
            request.input('proid', Project_Id);

            const result = await request.query(getProjectScheduleQuery);

            if (result.recordset.length > 0) {

                for (let obj of result.recordset) {
                    obj.LevelOneTasks = JSON.parse(obj.LevelOneTasks)
                    obj.LevelTwoTasks = JSON.parse(obj.LevelTwoTasks)
                    obj.LevelThreeTasks = JSON.parse(obj.LevelThreeTasks)
                }

                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const createSchedule = async (req, res) => {
        const { Sch_Date, Project_Id, Sch_By, Sch_Type_Id, Sch_Est_Start_Date, Sch_Status, Entry_By, Sch_Est_End_Date } = req.body;

        if (!Sch_Date || !checkIsNumber(Project_Id) || !checkIsNumber(Sch_By) || !checkIsNumber(Sch_Type_Id) ||
            !Sch_Est_Start_Date || !checkIsNumber(Sch_Status) || !checkIsNumber(Entry_By)) {
            return invalidInput(res, 'Sch_Date, Project_Id, Sch_By, Sch_Type_Id, Sch_Est_Start_Date, Sch_Status, Entry_By is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1)
            request.input('Sch_Id', 0);
            request.input('Sch_Date', Sch_Date)
            request.input('Project_Id', Project_Id)
            request.input('Sch_By', Sch_By)
            request.input('Sch_Type_Id', Sch_Type_Id)
            request.input('Sch_Est_Start_Date', Sch_Est_Start_Date)
            request.input('Sch_Est_End_Date', Sch_Est_End_Date)
            request.input('Sch_Status', Sch_Status)
            request.input('Entry_By', Entry_By)
            request.input('Entry_Date', new Date())

            const result = await request.execute('Project_Schedule_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Project Schedule Created')
            } else {
                return failed(res, 'Failed to create Schedule')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const putSchedule = async (req, res) => {
        const { Sch_Id, Sch_Date, Project_Id, Sch_By, Sch_Type_Id, Sch_Est_Start_Date, Sch_Status, Entry_By, Sch_Est_End_Date } = req.body;

        if (!checkIsNumber(Sch_Id) || !Sch_Date || !checkIsNumber(Project_Id) || !checkIsNumber(Sch_By) ||
            !checkIsNumber(Sch_Type_Id) || !Sch_Est_Start_Date || !checkIsNumber(Sch_Status) || !checkIsNumber(Entry_By)) {
            return invalidInput(res, 'Sch_Id, Sch_Date, Project_Id, Sch_By, Sch_Type_Id, Sch_Est_Start_Date, Sch_Status, Entry_By is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2)
            request.input('Sch_Id', Sch_Id);
            request.input('Sch_Date', Sch_Date)
            request.input('Project_Id', Project_Id)
            request.input('Sch_By', Sch_By)
            request.input('Sch_Type_Id', Sch_Type_Id)
            request.input('Sch_Est_Start_Date', Sch_Est_Start_Date)
            request.input('Sch_Est_End_Date', Sch_Est_End_Date)
            request.input('Sch_Status', Sch_Status)
            request.input('Entry_By', Entry_By)
            request.input('Entry_Date', new Date())

            const result = await request.execute('Project_Schedule_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Changes Saved')
            } else {
                return failed(res, 'Failed to Save')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteSchedule = async (req, res) => {
        const { Sch_Id } = req.body;

        if (!checkIsNumber(Sch_Id)) {
            return invalidInput(res, 'Sch_Id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3)
            request.input('Sch_Id', Sch_Id);
            request.input('Sch_Date', '')
            request.input('Project_Id', '')
            request.input('Sch_By', '')
            request.input('Sch_Type_Id', '')
            request.input('Sch_Est_Start_Date', '')
            request.input('Sch_Est_End_Date', '')
            request.input('Sch_Status', '')
            request.input('Entry_By', '')
            request.input('Entry_Date', '')

            const result = await request.execute('Project_Schedule_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Changes Saved')
            } else {
                return failed(res, 'Failed to Save')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const assignTaskInSchedule = async (req, res) => {
        const {
            Sch_Project_Id, Sch_Id, Task_Id, Task_Start_Time, Task_End_Time, Task_Sch_Duaration, Task_Est_Start_Date, Task_Est_End_Date,
            Task_Sch_Status, Levl_Id, Task_Depend_Level_Id, Type_Task_Id
        } = req.body;

        if (!checkIsNumber(Sch_Project_Id) || !checkIsNumber(Sch_Id) || !checkIsNumber(Task_Id) || !Task_Start_Time || !Task_End_Time ||
            !Task_Sch_Duaration || !Task_Est_Start_Date || !Task_Est_End_Date || !checkIsNumber(Task_Sch_Status) || !checkIsNumber(Type_Task_Id)) {
            return invalidInput(res, 'Sch_Project_Id, Sch_Id, Task_Id, Task_Start_Time, Task_End_Time, Task_Est_Start_Date, Task_Est_End_Date, Task_Sch_Status, Type_Task_Id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1)
            request.input('Sch_Project_Id', Sch_Project_Id)
            request.input('Sch_Id', Sch_Id)
            request.input('Task_Levl_Id', '')
            request.input('Task_Id', Task_Id)
            request.input('Type_Task_Id', Type_Task_Id)
            request.input('Task_Sch_Duaration', Task_Sch_Duaration)
            request.input('Task_Start_Time', Task_Start_Time)
            request.input('Task_End_Time', Task_End_Time)
            request.input('Task_Est_Start_Date', Task_Est_Start_Date)
            request.input('Task_Est_End_Date', Task_Est_End_Date)
            request.input('Task_Sch_Status', Task_Sch_Status)
            request.input('Levl_Id', Levl_Id)
            request.input('Task_Depend_Level_Id', Task_Depend_Level_Id)

            const result = await request.execute('Project_Sch_Task_DT_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Task Scheduled')
            } else {
                failed(res, 'Failed to Schedule Task')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const modifyTaskInSchedule = async (req, res) => {
        const {
            Sch_Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Task_Start_Time, Task_End_Time, Task_Sch_Duaration, Task_Est_Start_Date, Task_Est_End_Date,
            Task_Sch_Status, Levl_Id, Task_Depend_Level_Id, Type_Task_Id
        } = req.body;

        if (!checkIsNumber(Sch_Project_Id) || !checkIsNumber(Sch_Id) || !checkIsNumber(Task_Levl_Id) || !checkIsNumber(Task_Id) || !Task_Start_Time ||
            !Task_End_Time || !Task_Sch_Duaration || !Task_Est_Start_Date || !Task_Est_End_Date || !checkIsNumber(Task_Sch_Status) || !checkIsNumber(Type_Task_Id)) {
            return invalidInput(res, `Sch_Project_Id, Sch_Id, Task_Levl_Id, Task_Id, Task_Start_Time, Task_End_Time,
                 Task_Est_Start_Date, Task_Est_End_Date, Task_Sch_Status, Type_Task_Id is required`)
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2)
            request.input('Sch_Project_Id', Sch_Project_Id)
            request.input('Sch_Id', Sch_Id)
            request.input('Task_Levl_Id', Task_Levl_Id)
            request.input('Task_Id', Task_Id)
            request.input('Type_Task_Id', Type_Task_Id)
            request.input('Task_Sch_Duaration', Task_Sch_Duaration)
            request.input('Task_Start_Time', Task_Start_Time)
            request.input('Task_End_Time', Task_End_Time)
            request.input('Task_Est_Start_Date', Task_Est_Start_Date)
            request.input('Task_Est_End_Date', Task_Est_End_Date)
            request.input('Task_Sch_Status', Task_Sch_Status)
            request.input('Levl_Id', Levl_Id)
            request.input('Task_Depend_Level_Id', Task_Depend_Level_Id)

            const result = await request.execute('Project_Sch_Task_DT_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                failed(res, 'Failed to Save Changes')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteTaskInSchedule = async (req, res) => {
        const { Task_Levl_Id } = req.body;

        if (!checkIsNumber(Task_Levl_Id)) {
            return invalidInput(res, 'Task_Levl_Id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3)
            request.input('Sch_Project_Id', '')
            request.input('Sch_Id', '')
            request.input('Task_Levl_Id', Task_Levl_Id)
            request.input('Task_Id', '')
            request.input('Type_Task_Id', '')
            request.input('Task_Sch_Duaration', '')
            request.input('Task_Start_Time', '')
            request.input('Task_End_Time', '')
            request.input('Task_Est_Start_Date', '')
            request.input('Task_Est_End_Date', '')
            request.input('Task_Sch_Status', '')
            request.input('Levl_Id', '')
            request.input('Task_Depend_Level_Id', '')

            const result = await request.execute('Project_Sch_Task_DT_SP');

            if (result && result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Task Deleted')
            } else {
                failed(res, 'Failed to Delete Task')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const createNewTaskwithSchedule = async (req, res) => {
        const {
            Project_Id,
            entryBy,
            tasks = [],
            Sch_Type_Id = Sch_Type_Id,
            Sch_Est_Start_Date = new Date(),
            Sch_Est_End_Date = new Date()
        } = req.body;
        const Sch_Date = new Date();
        const Sch_By = entryBy;
        const Sch_Status = 1;
        const Mode = 1;
        const Entry_Date = new Date();

        try {
            const existingScheduleRequest = new sql.Request();
            const existingScheduleResult = await existingScheduleRequest
                .input('Project_Id', sql.Int, Project_Id)
                .query('SELECT Sch_Id FROM dbo.tbl_Project_Schedule WHERE Project_Id = @Project_Id');

            let newScheduleId = existingScheduleResult.recordset.length > 0
                ? existingScheduleResult.recordset[0].Sch_Id
                : null;

            if (!newScheduleId) {
                const scheduleRequest = new sql.Request();
                await scheduleRequest
                    .input('Mode', sql.Int, Mode)
                    .input('Sch_Id', sql.Int, null)
                    .input('Sch_Date', sql.DateTime, Sch_Date)
                    .input('Project_Id', sql.Int, Project_Id)
                    .input('Sch_Type_Id', sql.Int, Sch_Type_Id)
                    .input('Sch_By', sql.BigInt, Sch_By)
                    .input('Sch_Est_Start_Date', sql.DateTime, Sch_Est_Start_Date)
                    .input('Sch_Est_End_Date', sql.DateTime, Sch_Est_End_Date)
                    .input('Sch_Status', sql.Int, Sch_Status)
                    .input('Entry_By', sql.BigInt, entryBy)
                    .input('Entry_Date', sql.DateTime, Entry_Date)
                    .execute('Project_Schedule_SP');

                const selectRequest = new sql.Request();
                const selectResult = await selectRequest.query('SELECT TOP 1 Sch_Id FROM dbo.tbl_Project_Schedule ORDER BY Sch_Id DESC');
                newScheduleId = selectResult.recordset[0]?.Sch_Id;
            }

            const taskInsertPromises = tasks.map(async (task) => {
                const existingTaskRequest = new sql.Request();
                const existingTaskResult = await existingTaskRequest
                    .input('Sch_Project_Id', sql.Int, Project_Id)
                    .input('Sch_Type_Id', sql.Int, Sch_Type_Id)
                    .input('Task_Id', sql.Int, task.Task_Id)
                    .input('Task_Group_Id', task.Task_Group_Id)
                    .query(`SELECT * FROM tbl_Project_Sch_Task_DT WHERE Sch_Project_Id = @Sch_Project_Id AND Task_Id = @Task_Id AND Type_Task_Id=@Task_Group_Id AND @Sch_Type_Id=@Sch_Type_Id`);

                // if (existingTaskResult.recordset.length > 0) {
                //     return {
                //         message: `Task ${task.Task_Name} already exists for this project.`,
                //         status: 'warning'
                //     };
                // }

                const taskStartTime = task.Task_Start_Time ? new Date(task.Task_Start_Time) : new Date();
                const taskEndTime = task.Task_End_Time ? new Date(task.Task_End_Time) : new Date();

                const formattedStartTime = taskStartTime.toTimeString().slice(0, 5);
                const formattedEndTime = taskEndTime.toTimeString().slice(0, 5);

                const durationInMilliseconds = taskEndTime - taskStartTime;
                const durationInMinutes = Math.floor(durationInMilliseconds / 60000);

                const hours = Math.floor(durationInMinutes / 60);
                const minutes = durationInMinutes % 60;
                const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

                const taskRequest = new sql.Request();
                await taskRequest
                    .input('Mode', sql.Int, 1)
                    .input('Sch_Project_Id', sql.Int, Project_Id)
                    .input('Sch_Id', sql.Int, newScheduleId)
                    .input('Task_Levl_Id', sql.Int, 0)
                    .input('Task_Id', sql.Int, task.Task_Id)
                    .input('Type_Task_Id', sql.Int, task.Task_Group_Id)
                    .input('Sch_Type_Id', sql.Int, task.Sch_Type_Id)
                    .input('Task_Sch_Duaration', sql.VarChar, formattedDuration)
                    .input('Task_Start_Time', sql.NVarChar, formattedStartTime)
                    .input('Task_End_Time', sql.NVarChar, formattedEndTime)
                    .input('Task_Est_Start_Date', sql.DateTime, task.Task_Est_Start_Date)
                    .input('Task_Est_End_Date', sql.DateTime, task.Task_Est_End_Date)
                    .input('Task_Sch_Status', sql.Int, 1)
                    .input('Levl_Id', sql.Int, 1)
                    .input('Task_Depend_Level_Id', sql.NVarChar, '')
                    .execute('[Project_Sch_Task_DT_SP]');

                return { message: `Task ${task.Task_Name} created successfully.`, status: 'success' };
            });

            const results = await Promise.all(taskInsertPromises);
            const successMessages = results.filter(res => res.status === 'success').map(res => res.message);
            const warningMessages = results.filter(res => res.status === 'warning').map(res => res.message);

            return res.status(200).send({
                success: warningMessages.length === 0,
                message: [...successMessages, ...warningMessages].join(', '),
                scheduleId: newScheduleId
            });

        } catch (error) {
            console.error('Error creating schedule:', error);
            return res.status(500).send({
                success: false,
                message: 'Failed to create schedule: ' + error.message
            });
        }
    };



    //  const getScheduleProjectid = async (req, res) => {
    //         const { Project_Id,Task_Type_Id } = req.query;

    //         if (!checkIsNumber(Project_Id)) {
    //             return invalidInput(res, 'Project_Id is required');
    //         }

    //         const getProjectScheduleQuery = 

    // `
    // SELECT DISTINCT
    //     ps.[Sch_Id],
    //     ps.[Sch_No],
    //     ps.[Sch_Date],
    //     ps.[Project_Id],
    //     ps.[Sch_By],
    //     ps.[Sch_Type_Id],
    //     ps.[Sch_Est_Start_Date],
    //     ps.[Sch_Est_End_Date],
    //     p.[Project_Name],
    //     p.[Project_Desc],
    //     s.[Status] AS ScheduleStatus,

    //     (
    //         SELECT DISTINCT
    //             tt.[Sch_Type_Id] AS SchTypeId,
    //             tt.[Sch_Type] AS SchType,

    //             (
    //                 SELECT 
    //                     COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
    //                     COALESCE(
    //                         (SELECT COUNT(DISTINCT CONCAT(wm.Task_Id, wm.Task_Levl_Id, wm.AN_No))
    //                          FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) wm
    //                          WHERE wm.Sch_Type = tt.Sch_Type_Id
    //                          AND wm.Project_Id = ps.Project_Id),
    //                         0
    //                     ) AS CompletedTasks
    //                 FROM tbl_Project_Sch_Task_DT pt
    //                 WHERE pt.Sch_Project_Id = p.Project_Id
    //                 AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                 AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
    //                 FOR JSON PATH
    //             ) AS TaskCountsInSchType,

    //             (
    //                 SELECT DISTINCT
    //                     ttt.[Task_Type_Id],
    //                     ttt.[Task_Type],

    //                     (
    //                         SELECT 
    //                             COUNT(DISTINCT CONCAT(pt_inner.Task_Id, pt_inner.Sch_Project_Id)) AS TotalTasks, 
    //                             COALESCE(
    //                                 (
    //                                     SELECT COUNT(DISTINCT CONCAT(wm.Task_Id, wm.Sch_Type, wm.Task_Levl_Id, wm.AN_No, wm.Emp_Id))
    //                                     FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) wm
    //                                     WHERE wm.Sch_Type = tt.Sch_Type_Id
    //                                       AND wm.Project_Id = ps.Project_Id
    //                                 ),
    //                                 0
    //                             ) AS CompletedTasks
    //                         FROM tbl_Project_Sch_Task_DT pt_inner
    //                         WHERE pt_inner.Sch_Id = ps.Sch_Id
    //                         AND pt_inner.Sch_Type_Id = tt.Sch_Type_Id
    //                         AND pt_inner.Task_Id IN (
    //                             SELECT DISTINCT t.Task_Id
    //                             FROM tbl_Task t
    //                             WHERE t.Task_Group_Id = ttt.Task_Type_Id
    //                         )
    //                         FOR JSON PATH
    //                     ) AS TaskMetrics,

    //                     (
    //                         SELECT DISTINCT
    //                             pt.[A_Id],
    //                             pt.[Sch_Project_Id],
    //                             pt.[Task_Levl_Id],
    //                             pt.[Task_Id],
    //                             pt.[Task_Sch_Duaration],
    //                             pt.[Task_Start_Time],
    //                             pt.[Task_End_Time],
    //                             pt.[Task_Est_Start_Date],
    //                             pt.[Task_Est_End_Date],
    //                             pt.[Task_Sch_Status] AS TaskSchStatus_Id,
    //                             pt.[Levl_Id],
    //                             pt.[Task_Sch_Del_Flag],
    //                             t.[Task_Name],
    //                             t.[Task_Desc],
    //                             pt.[Sch_Id] AS TaskSchId,
    //                             s2.[Status] AS TaskSchStatus,
    //                             pt.[Sch_Type_Id],
    //                             t.Task_Group_Id,
    //                             ttt_inner.Task_Type_Id,
    //                             ttt_inner.Task_Type,

    //                             (
    //                                 SELECT DISTINCT
    //                                     td.Emp_Id AS User_Id, 
    //                                     u.Name

    //                                	FROM tbl_Task_Details td
    //                                 LEFT JOIN tbl_Users u ON td.Emp_Id = u.UserId
    //                                 WHERE td.Task_Id = pt.Task_Id
    //                                     AND td.Task_Levl_Id = pt.Task_Levl_Id
    //                                     AND td.Project_Id = pt.Sch_Project_Id
    //                                 FOR JSON PATH
    //                             ) AS AssignedEmployees

    //                         FROM tbl_Project_Sch_Task_DT pt
    //                         JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
    //                         JOIN tbl_Status s2 ON s2.Status_Id = pt.Task_Sch_Status
    //                         JOIN tbl_Task_Type ttt_inner ON pt.Type_Task_Id = ttt_inner.Task_Type_Id
    //                         WHERE pt.Sch_Id = ps.Sch_Id
    //                         AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                         AND t.Task_Group_Id = ttt.Task_Type_Id
    //                      AND pt.Type_Task_Id=@Task_Type_Id
    //                         FOR JSON PATH
    //                     ) AS Tasks

    //                 FROM tbl_Task_Type ttt
    //                 WHERE EXISTS (
    //                     SELECT 1 
    //                     FROM tbl_Project_Sch_Task_DT pt
    //                     WHERE pt.Sch_Id = ps.Sch_Id
    //                       AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                       AND pt.Task_Id IN (
    //                           SELECT DISTINCT t.Task_Id
    //                           FROM tbl_Task t
    //                           WHERE t.Task_Group_Id = ttt.Task_Type_Id
    //                       )
    //                 )
    //                 FOR JSON PATH
    //             ) AS TaskTypeGroups

    //         FROM tbl_Project_Sch_Type tt
    //         WHERE EXISTS (
    //             SELECT 1 
    //             FROM tbl_Project_Sch_Task_DT pt 
    //             WHERE pt.Sch_Id = ps.Sch_Id
    //             AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //         )
    //         AND tt.Sch_Type_Id IS NOT NULL
    //         AND tt.Sch_Type_Id NOT IN (4, 5, 6, 0)
    //         FOR JSON PATH
    //     ) AS SchTypes

    // FROM tbl_Project_Schedule ps
    // JOIN tbl_Project_Master p ON ps.Project_Id = p.Project_Id
    // JOIN tbl_Status s ON ps.Sch_Status = s.Status_Id
    // WHERE ps.Project_Id =@proid
    // ORDER BY ps.Sch_Id`


    //         try {
    //             const request = new sql.Request();
    //             request.input('proid', sql.BigInt, Project_Id);
    //             request.input('Task_Type_Id',Task_Type_Id)
    //             const result = await request.query(getProjectScheduleQuery);

    //  if (result.recordset.length > 0) {
    //                 const parsed = result.recordset.map(o => ({
    //                     ...o,
    //                     SchTypes: JSON.parse(o?.SchTypes)
    //                 }))
    //                 dataFound(res, parsed);
    //             } else {
    //                 noData(res);
    //             }
    //         } catch (e) {
    //             servError(e, res);
    //         }
    //     };




    const getScheduleProjectid = async (req, res) => {
        const { Project_Id, Task_Type_Id } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required');
        }

        const getProjectScheduleQuery =

            `SELECT 
    ps.[Sch_Id],
    ps.[Sch_No],
    ps.[Sch_Date],
    ps.[Project_Id],
    ps.[Sch_By],
    ps.[Sch_Type_Id],
    ps.[Sch_Est_Start_Date],
    ps.[Sch_Est_End_Date],
    p.[Project_Name],
    p.[Project_Desc],

     (
        SELECT * FROM (
            -- Existing SchTypes
            SELECT DISTINCT
                tt.[Sch_Type_Id] AS SchTypeId,
                tt.[Sch_Type] AS SchType,

                -- Task Counts for each SchType
                (
                    SELECT 
                        COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
                        COALESCE(
                            (SELECT COUNT(CONCAT(wm.Task_Id, wm.Task_Levl_Id, wm.AN_No))
                             FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) wm
                             WHERE wm.Sch_Type = tt.Sch_Type_Id
                             AND wm.Project_Id = ps.Project_Id),
                            0
                        ) AS CompletedTasks
                    FROM tbl_Project_Sch_Task_DT pt
                    LEFT JOIN tbl_Work_Master wm ON wm.Task_Id = pt.Task_Id 
                                                  
                    WHERE pt.Sch_Project_Id = p.Project_Id
                    AND pt.Type_Task_Id=@Task_Type_Id
                    AND pt.Sch_Type_Id = tt.Sch_Type_Id
                    AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
                    FOR JSON PATH
                ) AS TaskCountsInSchType,

                -- Task Details for all tasks within the schedule type
                (
                    SELECT DISTINCT
                        pt.[A_Id],
                        pt.[Sch_Project_Id],
                        pt.[Task_Levl_Id],
                        pt.[Task_Id],
                        pt.[Task_Sch_Duaration],
                        pt.[Task_Start_Time],
                        pt.[Task_End_Time],
                        pt.[Task_Est_Start_Date],
                        pt.[Task_Est_End_Date],
                        pt.[Task_Sch_Status] AS TaskSchStatus_Id,
                        pt.[Levl_Id],
                        pt.[Task_Sch_Del_Flag],
                        t.[Task_Name],
                        t.[Task_Desc],
                        pt.[Sch_Id] AS TaskSchId,
                        s.[Status] AS TaskSchStatus,
                        pt.[Sch_Type_Id],
                        t.Task_Group_Id,
                        ttt.Task_Type_Id,
                        ttt.Task_Type,

                        -- Employee assignment details for each task
                        (
                            SELECT DISTINCT
                                td.Emp_Id AS User_Id, 
                                u.Name
                            --FROM dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) td
                            FROM tbl_Task_Details td
                            LEFT JOIN tbl_Users u ON td.Emp_Id = u.UserId
                            WHERE td.Task_Id = pt.Task_Id
                                AND td.Task_Levl_Id = pt.Task_Levl_Id
                                AND td.Project_Id = pt.Sch_Project_Id
                            FOR JSON PATH
                        ) AS AssignedEmployees

                    FROM tbl_Project_Sch_Task_DT pt
                    JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
                    JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
                    LEFT JOIN tbl_Task_Type ttt ON pt.Type_Task_Id = ttt.Task_Type_Id
                    WHERE pt.Sch_Id = ps.Sch_Id
					AND pt.Type_Task_Id=@Task_Type_Id
                    AND pt.Sch_Type_Id = tt.Sch_Type_Id
                    FOR JSON PATH
                ) AS Tasks

            FROM tbl_Project_Sch_Type tt
            LEFT JOIN tbl_Project_Sch_Task_DT pt 
                ON pt.Sch_Id = ps.Sch_Id
                AND pt.Sch_Type_Id = tt.Sch_Type_Id
            WHERE tt.Sch_Type_Id IS NOT NULL
            AND tt.Sch_Type_Id NOT IN (4, 5, 6, 0)

            UNION ALL

            
            SELECT 
                -1 AS SchTypeId,
                'ALL' AS SchType,

                -- Task Counts for ALL SchType
                (
                    SELECT 
                        COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
                        COALESCE(
                            (SELECT COUNT(CONCAT(wm.Task_Id, wm.Task_Levl_Id, wm.AN_No))
                             FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) wm
                             WHERE wm.Project_Id = ps.Project_Id
                             AND wm.Sch_Type IN (SELECT Sch_Type_Id FROM tbl_Project_Sch_Type WHERE Sch_Type_Id NOT IN (4, 5, 6, 0))),
                            0
                        ) AS CompletedTasks
                    FROM tbl_Project_Sch_Task_DT pt
                    LEFT JOIN tbl_Work_Master wm ON wm.Task_Id = pt.Task_Id 
                                                     AND wm.Task_Levl_Id = pt.Task_Levl_Id
                                                     AND pt.Sch_Id=wm.Sch_Id
                    WHERE pt.Sch_Project_Id = p.Project_Id
                    AND pt.Type_Task_Id=@Task_Type_Id
                    AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
                    FOR JSON PATH
                ) AS TaskCountsInSchType,

                -- Task Details for ALL tasks across all schedule types
              (
                    SELECT DISTINCT
                        pt.[A_Id],
                        pt.[Sch_Project_Id],
                        pt.[Task_Levl_Id],
                        pt.[Task_Id],
                        pt.[Task_Sch_Duaration],
                        pt.[Task_Start_Time],
                        pt.[Task_End_Time],
                        pt.[Task_Est_Start_Date],
                        pt.[Task_Est_End_Date],
                        pt.[Task_Sch_Status] AS TaskSchStatus_Id,
                        pt.[Levl_Id],
                        pt.[Task_Sch_Del_Flag],
                        t.[Task_Name],
                        t.[Task_Desc],
                        pt.[Sch_Id] AS TaskSchId,
                        s.[Status] AS TaskSchStatus,
                        pt.[Sch_Type_Id],
                        t.Task_Group_Id,
                        ttt.Task_Type_Id,
                        ttt.Task_Type,

                        -- Employee assignment details for each task
                        (
                            SELECT DISTINCT
                                td.Emp_Id AS User_Id, 
                                u.Name
                            -- FROM dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) td
                                FROM tbl_Task_Details td 
                            LEFT JOIN tbl_Users u ON td.Emp_Id = u.UserId
                            WHERE td.Task_Id = pt.Task_Id
                                AND td.Project_Id = pt.Sch_Project_Id
                            FOR JSON PATH
                        ) AS AssignedEmployees

                    FROM tbl_Project_Sch_Task_DT pt
                    JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
                    JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
                    LEFT JOIN tbl_Task_Type ttt ON pt.Type_Task_Id = ttt.Task_Type_Id
                    WHERE pt.Sch_Id = ps.Sch_Id
                    AND pt.Type_Task_Id=@Task_Type_Id
                    AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
                  --   AND (@Task_Type_Id = 0 OR ttt.Task_Type_Id = @Task_Type_Id)
                    FOR JSON PATH
                ) AS Tasks
       
        ) AS CombinedSchTypes
        FOR JSON PATH
    ) AS SchTypes
     
FROM tbl_Project_Schedule ps
JOIN tbl_Project_Master p ON ps.Project_Id = p.Project_Id
JOIN tbl_Status s ON ps.Sch_Status = s.Status_Id
WHERE ps.Project_Id = @proid 
ORDER BY ps.Sch_Id`

        try {

            const request = new sql.Request();
            request.input('proid', Project_Id);
            request.input('Task_Type_Id', Task_Type_Id);

            const result = await request.query(getProjectScheduleQuery);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(row => {
                    const parsedRow = { ...row };


                    if (row.SchTypes) {
                        try {
                            parsedRow.SchTypes = JSON.parse(row.SchTypes);

                            if (Array.isArray(parsedRow.SchTypes)) {
                                parsedRow.SchTypes = parsedRow.SchTypes.map(schType => {
                                    if (schType.TaskCounts) {
                                        try {
                                            schType.TaskCounts = JSON.parse(schType.TaskCounts);
                                        } catch (e) {
                                            console.warn('Failed to parse TaskCounts:', schType.TaskCounts);
                                            schType.TaskCounts = { TotalTasks: 0, CompletedTasks: 0 };
                                        }
                                    }


                                    if (schType.Tasks) {
                                        try {
                                            schType.Tasks = JSON.parse(schType.Tasks);


                                            if (Array.isArray(schType.Tasks)) {
                                                schType.Tasks = schType.Tasks.map(task => {
                                                    if (task.AssignedEmployees) {
                                                        try {

                                                            task.AssignedEmployees = task.AssignedEmployees;
                                                        } catch (e) {
                                                            console.warn('Failed to parse AssignedEmployees:', task.AssignedEmployees);
                                                            task.AssignedEmployees = [];
                                                        }
                                                    }
                                                    return task;
                                                });
                                            }
                                        } catch (e) {
                                            console.warn('Failed to parse Tasks:', schType.Tasks);
                                            schType.Tasks = [];
                                        }
                                    }

                                    return schType;
                                });
                            }
                        } catch (e) {
                            console.error('Failed to parse SchTypes:', row.SchTypes);
                            parsedRow.SchTypes = [];
                        }
                    }

                    return parsedRow;
                });

                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {
            console.error('Database error:', e);
            servError(e, res);
        }
    };


    const getScheduleProjectidActivity = async (req, res) => {
        const { Project_Id } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required');
        }

        const getProjectScheduleQuery =




            `SELECT 
    ps.[Sch_Id],
    ps.[Sch_No],
    ps.[Sch_Date],
    ps.[Project_Id],
    ps.[Sch_By],
    ps.[Sch_Type_Id],
    ps.[Sch_Est_Start_Date],
    ps.[Sch_Est_End_Date],
    p.[Project_Name],
    p.[Project_Desc],

    (
        SELECT DISTINCT
            tt.[Sch_Type_Id] AS SchTypeId,
            tt.[Sch_Type] AS SchType,

            -- Task Counts for each SchType
            (
                SELECT 
                    COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
                    COALESCE(
                        (
                            SELECT COUNT(DISTINCT CONCAT(pt2.Task_Id, pt2.Sch_Type_Id, pt2.Sch_Project_Id))
                            FROM tbl_Project_Sch_Task_DT pt2
                            WHERE pt2.Sch_Project_Id = p.Project_Id
                              AND pt2.Sch_Type_Id = tt.Sch_Type_Id
                              AND pt2.Task_Sch_Status = 2  
                        ),
                        0
                    ) AS CompletedTasks
                FROM tbl_Project_Sch_Task_DT pt
                WHERE pt.Sch_Project_Id = p.Project_Id
                  AND pt.Sch_Type_Id = tt.Sch_Type_Id
                  AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
                FOR JSON PATH
            ) AS TaskCountsInSchType,

            -- Task Type Groups for each SchType
            (
                SELECT DISTINCT
                    ttt.[Task_Type_Id],
                    ttt.[Task_Type] AS Task_Type,

                    -- Task Metrics for each Task Type
                    (
                        SELECT 
                            COUNT(DISTINCT CONCAT(pt_inner.Task_Id, pt_inner.Sch_Project_Id)) AS TotalTasks, 
                            COALESCE(
                                (
                                    SELECT COUNT(DISTINCT CONCAT(ptc.Task_Id, ptc.Sch_Project_Id))
                                    FROM tbl_Project_Sch_Task_DT ptc
                                    WHERE ptc.Sch_Id = ps.Sch_Id
                                      AND ptc.Sch_Type_Id = tt.Sch_Type_Id
                                      AND ptc.Task_Sch_Status = 2  
                                      AND ptc.Task_Id IN (
                                          SELECT t.Task_Id
                                          FROM tbl_Task t
                                          WHERE t.Task_Group_Id = ttt.Task_Type_Id
                                      )
                                ),
                                0
                            ) AS CompletedTasks
                        FROM tbl_Project_Sch_Task_DT pt_inner
                        WHERE pt_inner.Sch_Id = ps.Sch_Id
                          AND pt_inner.Sch_Type_Id = tt.Sch_Type_Id
                          AND pt_inner.Task_Id IN (
                              SELECT t.Task_Id
                              FROM tbl_Task t
                              WHERE t.Task_Group_Id = ttt.Task_Type_Id
                          )
                        GROUP BY pt_inner.Sch_Id, pt_inner.Sch_Type_Id
                        FOR JSON PATH
                    ) AS TaskMetrics,

     
                    (
                        SELECT DISTINCT
                            ptc.A_Id,
                            ptc.Sch_Id,
                            ptc.Task_Levl_Id,
                            ptc.Task_Id,
                            ptc.Sch_Type_Id AS Sch_Type,
                            ptc.Sch_Project_Id AS Sch_Project_Id,
                            ptc.Task_Sch_Status AS Work_Status
                     FROM tbl_Project_Sch_Task_DT ptc
                        WHERE ptc.Sch_Project_Id = ps.Project_Id
                          AND ptc.Sch_Type_Id = tt.Sch_Type_Id
                          AND ptc.Task_Sch_Status = 2  
                          AND ptc.Task_Id IN (
                              SELECT t.Task_Id
                              FROM tbl_Task t
                              WHERE t.Task_Group_Id = ttt.Task_Type_Id
                          )
                        FOR JSON PATH
                    ) AS CompletedTaskDetails,

                    -- All Task Details for each task within the task type group
                    (
                        SELECT DISTINCT
                            pt.[A_Id],
                            pt.[Sch_Project_Id],
                            pt.[Task_Levl_Id],
                            pt.[Task_Id],
                            pt.[Task_Sch_Duaration],
                            pt.[Task_Start_Time],
                            pt.[Task_End_Time],
                            pt.[Task_Est_Start_Date],
                            pt.[Task_Est_End_Date],
                            pt.[Task_Sch_Status] AS TaskSchStatus_Id,
                            pt.[Levl_Id],
                            pt.[Task_Sch_Del_Flag],
                            t.[Task_Name],
                            t.[Task_Desc],
                            pt.[Sch_Id] AS TaskSchId,
                            s.[Status] AS TaskSchStatus,
                            pt.[Sch_Type_Id],

                            -- Employee assignment details for each task
                            (
                                SELECT DISTINCT
                                    td.Emp_Id AS User_Id, 
                                    u.Name
                                FROM dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) td
                                LEFT JOIN tbl_Users u ON td.Emp_Id = u.UserId
                                WHERE td.Task_Id = pt.Task_Id
                                  AND td.Task_Levl_Id = pt.Task_Levl_Id
                                  AND td.Project_Id = pt.Sch_Project_Id
                                FOR JSON PATH
                            ) AS AssignedEmployees,

                            -- Work completion details for this specific task (if completed)
                            (
                                SELECT DISTINCT
                                    ptc.*
                                FROM tbl_Project_Sch_Task_DT ptc
                                WHERE ptc.Task_Id = pt.Task_Id
                                  AND ptc.Task_Levl_Id = pt.Task_Levl_Id
                                  AND ptc.Sch_Project_Id = pt.Sch_Project_Id
                                  AND ptc.Task_Sch_Status = 2  
                                FOR JSON PATH
                            ) AS CompletionDetails

                        FROM tbl_Project_Sch_Task_DT pt
                        JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
                        JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
                        WHERE pt.Sch_Id = ps.Sch_Id
                          AND pt.Sch_Type_Id = tt.Sch_Type_Id
                          AND t.Task_Group_Id = ttt.Task_Type_Id
                        FOR JSON PATH
                    ) AS Tasks
                FROM tbl_Task_Type ttt
                WHERE EXISTS (
                    SELECT 1 
                    FROM tbl_Project_Sch_Task_DT pt
                    WHERE pt.Sch_Id = ps.Sch_Id
                      AND pt.Sch_Type_Id = tt.Sch_Type_Id
                      AND pt.Task_Id IN (
                          SELECT t.Task_Id
                          FROM tbl_Task t
                          WHERE t.Task_Group_Id = ttt.Task_Type_Id
                      )
                )
                FOR JSON PATH
            ) AS TaskTypeGroups
        FROM tbl_Project_Sch_Type tt
        LEFT JOIN tbl_Project_Sch_Task_DT pt 
            ON pt.Sch_Id = ps.Sch_Id
            AND pt.Sch_Type_Id = tt.Sch_Type_Id
        WHERE tt.Sch_Type_Id IS NOT NULL
          AND tt.Sch_Type_Id NOT IN (4, 5, 6, 0)
        FOR JSON PATH
    ) AS SchTypes

FROM tbl_Project_Schedule ps
JOIN tbl_Project_Master p ON ps.Project_Id = p.Project_Id
JOIN tbl_Status s ON ps.Sch_Status = s.Status_Id
WHERE ps.Project_Id = @proid
ORDER BY ps.Sch_Id



    
`


        try {
            const request = new sql.Request();
            request.input('proid', sql.BigInt, Project_Id);

            const result = await request.query(getProjectScheduleQuery);


            const parsedData = result.recordset.map((row) => ({
                ...row,
                SchTypes: row.SchTypes
                    ? JSON.parse(row.SchTypes)
                    : [],

            }));

            if (parsedData.length > 0) {
                dataFound(res, parsedData);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    //  `SELECT 
    //     ps.[Sch_Id],
    //     ps.[Sch_No],
    //     ps.[Sch_Date],
    //     ps.[Project_Id],
    //     ps.[Sch_By],
    //     ps.[Sch_Type_Id],
    //     ps.[Sch_Est_Start_Date],
    //     ps.[Sch_Est_End_Date],
    //     p.[Project_Name],
    //     p.[Project_Desc],

    //     (
    //         SELECT DISTINCT
    //             tt.[Sch_Type_Id] AS SchTypeId,
    //             tt.[Sch_Type] AS SchType,

    //             -- Task Counts for each SchType
    //             (
    //                 SELECT 
    //                     COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
    //                     COALESCE(
    //                         (SELECT COUNT(CONCAT(wm.Task_Id, wm.Task_Levl_Id, wm.AN_No))
    //                          FROM dbo.Work_Details_Today_Fn() wm
    //                          WHERE wm.Sch_Type = tt.Sch_Type_Id
    //                          AND wm.Project_Id = ps.Project_Id),
    //                         0
    //                     ) AS CompletedTasks
    //                 FROM tbl_Project_Sch_Task_DT pt
    //                 LEFT JOIN tbl_Work_Master wm ON wm.Task_Id = pt.Task_Id 
    //                                                 AND wm.Task_Levl_Id = pt.Task_Levl_Id
    //                 WHERE pt.Sch_Project_Id = p.Project_Id
    //                 AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                 AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
    //                 FOR JSON PATH
    //             ) AS TaskCountsInSchType,

    //             -- Task Type Groups for each SchType
    //             (
    //                 SELECT DISTINCT
    //                     ttt.[Task_Type_Id],
    //                     ttt.[Task_Type] AS Task_Type,


    //                  (
    //                 SELECT 
    //                     COUNT(DISTINCT CONCAT(pt_inner.Task_Id, pt_inner.Sch_Project_Id)) AS TotalTasks, 
    //                     COALESCE(
    //                         (
    //                     SELECT COUNT( CONCAT( wm.Task_Id,wm.Sch_Type,wm.Task_Levl_Id,wm.AN_No,wm.Emp_Id))
    //                     FROM dbo.Work_Details_Today_Fn() wm
    //                          WHERE wm.Sch_Type = tt.Sch_Type_Id
    //                          AND wm.Project_Id = ps.Project_Id),
    //                         0
    //                     ) AS CompletedTasks
    //                 FROM tbl_Project_Sch_Task_DT pt_inner
    //                 LEFT JOIN tbl_Work_Master wm 
    //                     ON wm.Task_Id = pt_inner.Task_Id AND wm.Task_Levl_Id = pt_inner.Task_Levl_Id
    //                 WHERE pt_inner.Sch_Id = ps.Sch_Id
    //                 AND pt_inner.Sch_Type_Id = tt.Sch_Type_Id
    //                 AND pt_inner.Task_Id IN (
    //                     SELECT t.Task_Id
    //                     FROM tbl_Task t
    //                     WHERE t.Task_Group_Id = ttt.Task_Type_Id
    //                 )
    //                 GROUP BY pt_inner.Sch_Id, pt_inner.Sch_Type_Id
    //                 FOR JSON PATH
    //             ) AS TaskMetrics,


    //                     -- Task Details for each task within the task type group
    //                     (
    //                         SELECT DISTINCT
    //                             pt.[A_Id],
    //                             pt.[Sch_Project_Id],
    //                             pt.[Task_Levl_Id],
    //                             pt.[Task_Id],
    //                             pt.[Task_Sch_Duaration],
    //                             pt.[Task_Start_Time],
    //                             pt.[Task_End_Time],
    //                             pt.[Task_Est_Start_Date],
    //                             pt.[Task_Est_End_Date],
    //                             pt.[Task_Sch_Status] AS TaskSchStatus_Id,
    //                             pt.[Levl_Id],
    //                             pt.[Task_Sch_Del_Flag],
    //                             t.[Task_Name],
    //                             t.[Task_Desc],
    //                             pt.[Sch_Id] AS TaskSchId,
    //                             s.[Status] AS TaskSchStatus,
    //                             pt.[Sch_Type_Id],

    //                             -- Employee assignment details for each task
    //                             (
    //                                 SELECT DISTINCT
    //                                     td.Emp_Id AS User_Id, 
    //                                     u.Name
    //                                 FROM  dbo.Task_Details_Today_Fn() td
    //                                 JOIN tbl_Users u ON td.Emp_Id = u.UserId
    //                                 WHERE td.Task_Id = pt.Task_Id
    //                                     AND td.Task_Levl_Id = pt.Task_Levl_Id
    //                                     AND td.Project_Id = pt.Sch_Project_Id
    //                                 FOR JSON PATH
    //                             ) AS AssignedEmployees
    //                         FROM tbl_Project_Sch_Task_DT pt
    //                         JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
    //                         JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
    //                         WHERE pt.Sch_Id = ps.Sch_Id
    //                         AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                         AND t.Task_Group_Id = ttt.Task_Type_Id
    //                         FOR JSON PATH
    //                     ) AS Tasks
    //                 FROM tbl_Task_Type ttt
    //                 WHERE EXISTS (
    //                     SELECT 1 
    //                     FROM tbl_Project_Sch_Task_DT pt
    //                     WHERE pt.Sch_Id = ps.Sch_Id
    //                     AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //                     AND pt.Task_Id IN (
    //                         SELECT t.Task_Id
    //                         FROM tbl_Task t
    //                         WHERE t.Task_Group_Id = ttt.Task_Type_Id
    //                     )
    //                 )
    //                 FOR JSON PATH
    //             ) AS TaskTypeGroups
    //         FROM tbl_Project_Sch_Type tt
    //         LEFT JOIN tbl_Project_Sch_Task_DT pt 
    //             ON pt.Sch_Id = ps.Sch_Id
    //             AND pt.Sch_Type_Id = tt.Sch_Type_Id
    //         WHERE tt.Sch_Type_Id IS NOT NULL
    //         AND tt.Sch_Type_Id NOT IN (4, 5, 6, 0)
    //         FOR JSON PATH
    //     ) AS SchTypes

    // FROM tbl_Project_Schedule ps
    // JOIN tbl_Project_Master p ON ps.Project_Id = p.Project_Id
    // JOIN tbl_Status s ON ps.Sch_Status = s.Status_Id
    // WHERE ps.Project_Id =@proid
    // ORDER BY ps.Sch_Id
    // `



    const projectScheduleTaskdetails = async (req, res) => {
        const { Sch_Project_Id, Sch_Id, Task_Id } = req.query;

        if (!checkIsNumber(Sch_Project_Id) || !checkIsNumber(Sch_Id) || !checkIsNumber(Task_Id)) {
            return invalidInput(res, 'Sch_Project_Id, Sch_Id, and Task_Id are required and must be numbers');
        }

        const getProjectScheduleQuery = `
            SELECT * 
            FROM tbl_project_Sch_Task_DT 
            WHERE Sch_Project_Id = @proid 
            AND Sch_Id = @schid 
            AND Task_Id = @taskid
        `;

        try {
            const request = new sql.Request();
            request.input('proid', sql.BigInt, Sch_Project_Id);
            request.input('schid', sql.BigInt, Sch_Id);
            request.input('taskid', sql.BigInt, Task_Id);

            const result = await request.query(getProjectScheduleQuery);

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (error) {
            console.error('Error fetching project schedule task details:', error);
            return servError(error, res);
        }
    };

    const projectScheduleTaskupdate = async (req, res) => {
        const { Sch_Project_Id, Sch_Id, Task_Id, schtypeid } = req.body;

        if (
            !checkIsNumber(Sch_Project_Id) ||
            !checkIsNumber(Sch_Id) ||
            !checkIsNumber(Task_Id) ||
            !checkIsNumber(schtypeid)
        ) {
            return invalidInput(res, 'Sch_Project_Id, Sch_Id, Task_Id, and schtypeid are required and must be numbers');
        }

        const updateProjectScheduleQuery = `
            UPDATE tbl_project_Sch_Task_DT 
            SET Sch_Type_Id = @schtypeid
            WHERE Sch_Project_Id = @proid 
            AND Sch_Id = @schid 
            AND Task_Id = @taskid
        `;

        try {
            const request = new sql.Request();
            request.input('proid', sql.BigInt, Sch_Project_Id);
            request.input('schid', sql.BigInt, Sch_Id);
            request.input('taskid', sql.BigInt, Task_Id);
            request.input('schtypeid', sql.BigInt, schtypeid);

            const result = await request.query(updateProjectScheduleQuery);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Task updated successfully');
            } else {
                return noData(res, 'No task found to update');
            }
        } catch (error) {
            console.error('Error updating project schedule task:', error);
            return servError(error, res);
        }
    };


    const newgetScheduleType = async (req, res) => {
        try {
            const result = (await sql.query(`SELECT * FROM tbl_Project_Sch_Type WHERE Sch_Type_Id NOT IN (0, 4, 5, 6)`)).recordset;


            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }


    const projectDetailsforReport = async (req, res) => {
        const { Project_Id, StartDate } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required');
        }

        let formattedStartDate;

        if (StartDate) {
            try {
                formattedStartDate = ISOString(StartDate);
            } catch (error) {

                return res.status(400).json({ message: "Error formatting StartDate" });
            }
        }

        if (!formattedStartDate) {
            return res.status(400).json({ message: "StartDate is required" });
        }


        const getProjectScheduleQuery = `SELECT 
        ps.[Sch_Id],
        ps.[Sch_No],
        ps.[Sch_Date],
        ps.[Project_Id],
        ps.[Sch_By],
        ps.[Sch_Type_Id],
        ps.[Sch_Est_Start_Date],
        ps.[Sch_Est_End_Date],
        p.[Project_Name],
        p.[Project_Desc],
    
        -- Existing column for SchTypes with task counts and details
        (
            SELECT DISTINCT
                tt.[Sch_Type_Id] AS SchTypeId,
                tt.[Sch_Type] AS SchType,
    
                -- Task Counts for each SchType
                (
                    SELECT 
                        COUNT(DISTINCT CONCAT(pt.Task_Id, pt.Sch_Type_Id, pt.Sch_Project_Id)) AS TotalTasks,
                        COALESCE(
                            (SELECT COUNT(CONCAT(wm.Task_Id, wm.Task_Levl_Id, wm.AN_No))
                              FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) wm
                             WHERE wm.Sch_Type = tt.Sch_Type_Id
                             AND wm.Project_Id = ps.Project_Id),
                            0
                        ) AS CompletedTasks
                    FROM tbl_Project_Sch_Task_DT pt
                    LEFT JOIN tbl_Work_Master wm ON wm.Task_Id = pt.Task_Id 
                                                     AND wm.Task_Levl_Id = pt.Task_Levl_Id
                    WHERE pt.Sch_Project_Id = p.Project_Id
                    AND pt.Sch_Type_Id = tt.Sch_Type_Id
                    AND pt.Sch_Type_Id NOT IN (4, 5, 6, 0)
                    FOR JSON PATH
                ) AS TaskCountsInSchType,
    
                (
                    SELECT DISTINCT
                        pt.[A_Id],
                        pt.[Sch_Project_Id],
                        pt.[Task_Levl_Id],
                        pt.[Task_Id],
                        pt.[Task_Sch_Duaration],
                        pt.[Task_Start_Time],
                        pt.[Task_End_Time],
                        pt.[Task_Est_Start_Date],
                        pt.[Task_Est_End_Date],
                        pt.[Task_Sch_Status] AS TaskSchStatus_Id,
                        pt.[Levl_Id],
                        pt.[Task_Sch_Del_Flag],
                        t.[Task_Name],
                        t.[Task_Desc],
                        pt.[Sch_Id] AS TaskSchId,
                        s.[Status] AS TaskSchStatus,
                        pt.[Sch_Type_Id],
    
                        -- Employee assignment details for each task
                        (
                            SELECT DISTINCT
                                td.Emp_Id AS User_Id, 
                                u.Name
                             FROM dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) td
                            JOIN tbl_Users u ON td.Emp_Id = u.UserId
                            WHERE td.Task_Id = pt.Task_Id
                                AND td.Task_Levl_Id = pt.Task_Levl_Id
                                AND td.Project_Id = pt.Sch_Project_Id
                            FOR JSON PATH
                        ) AS AssignedEmployees
                    FROM tbl_Project_Sch_Task_DT pt
                    JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
                    JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
                    WHERE pt.Sch_Id = ps.Sch_Id
                    AND pt.Sch_Type_Id = tt.Sch_Type_Id
                    FOR JSON PATH
                ) AS Tasks
            FROM tbl_Project_Sch_Type tt
            LEFT JOIN tbl_Project_Sch_Task_DT pt 
                ON pt.Sch_Id = ps.Sch_Id
                AND pt.Sch_Type_Id = tt.Sch_Type_Id
            WHERE tt.Sch_Type_Id IS NOT NULL
            AND tt.Sch_Type_Id NOT IN (4, 5, 0)
            FOR JSON PATH
        ) AS SchTypes,
     COALESCE(( 
        SELECT COUNT(t.Task_Id) 
        FROM tbl_Project_Schedule AS s
        JOIN tbl_Project_Sch_Task_DT AS t 
        ON s.Sch_Id = t.Sch_Id
        WHERE s.Project_Id = p.Project_Id
        AND t.Sch_Project_Id = p.Project_Id
        AND s.Sch_Del_Flag = 0
        AND t.Task_Sch_Del_Flag = 0
    ), 0) AS TotalTaskCount,
    
        COALESCE(
            (
                SELECT COUNT(DISTINCT t.Task_Id) 
                FROM dbo.Work_Details_Today_Fn(CAST(@StartDate AS DATE)) t
                WHERE t.Project_Id = p.Project_Id
            ), 0
        ) AS CompletedTasks,
        -- New column for Task Details only (without SchType grouping)
        (
            SELECT DISTINCT
                pt.[A_Id],
                pt.[Sch_Project_Id],
                pt.[Task_Levl_Id],
                pt.[Task_Id],
                pt.[Task_Sch_Duaration],
                pt.[Task_Start_Time],
                pt.[Task_End_Time],
                pt.[Task_Est_Start_Date],
                pt.[Task_Est_End_Date],
                pt.[Task_Sch_Status] AS TaskSchStatus_Id,
                pt.[Levl_Id],
                pt.[Task_Sch_Del_Flag],
                t.[Task_Name],
                t.[Task_Desc],
                pt.[Sch_Id] AS TaskSchId,
                s.[Status] AS TaskSchStatus,
                pt.[Sch_Type_Id],
    
                -- Employee assignment details for each task
                (
                    SELECT DISTINCT
                        td.Emp_Id AS User_Id, 
                        u.Name
                    FROM dbo.Task_Details_Today_Fn(CAST(@StartDate AS DATE)) td
                    JOIN tbl_Users u ON td.Emp_Id = u.UserId
                    WHERE td.Task_Id = pt.Task_Id
                        AND td.Task_Levl_Id = pt.Task_Levl_Id
                        AND td.Project_Id = pt.Sch_Project_Id
                    FOR JSON PATH
                ) AS AssignedEmployees
            FROM tbl_Project_Sch_Task_DT pt
            JOIN tbl_Task t ON pt.Task_Id = t.Task_Id
            JOIN tbl_Status s ON s.Status_Id = pt.Task_Sch_Status
            WHERE pt.Sch_Id = ps.Sch_Id
            FOR JSON PATH
        ) AS TaskDetails
  
    
    FROM tbl_Project_Schedule ps
    JOIN tbl_Project_Master p ON ps.Project_Id = p.Project_Id
    JOIN tbl_Status s ON ps.Sch_Status = s.Status_Id
    WHERE ps.Project_Id = @proid
    ORDER BY ps.Sch_Id;
`


        try {
            const request = new sql.Request();
            request.input('proid', sql.BigInt, Project_Id);
            request.input('startDate', sql.Date, formattedStartDate);

            const result = await request.query(getProjectScheduleQuery);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    };



    const taskTypebyProjectId = async (req, res) => {

        const { Project_Id } = req.query;

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required');
        }


        try {

            const query = `select * from tbl_Task_Type where Project_Id=@proid`;


            const request = new sql.Request();
            request.input('proid', sql.BigInt, Project_Id);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        }
        catch (error) {
            servError(error, res)
        }

    }


    const projectScheduleAbstart = async (req, res) => {


        const getProjectScheduleQuery = `SELECT 
    pm.*,
    (
        SELECT 
            pst.*,
            ta.Task_Name,
            tt.Task_Type,
            pm.Project_Name
        FROM tbl_Project_Sch_Task_DT pst
        LEFT JOIN tbl_Task ta 
            ON ta.Task_Id = pst.Task_Id
        LEFT JOIN tbl_Task_Type tt 
            ON tt.Task_Type_Id = pst.Type_Task_Id
            
        WHERE pst.Sch_Project_Id = pm.Project_Id
        FOR JSON PATH
    ) AS Tasks
FROM tbl_Project_Master pm




`


        try {
            const request = new sql.Request();

            const result = await request.query(getProjectScheduleQuery);



            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => {
                    let Tasks = [];

                    if (o.Tasks) {
                        Tasks = typeof o.Tasks === "string" ? JSON.parse(o.Tasks) : [];
                    }

                    return {
                        ...o,
                        Tasks: Tasks
                    };
                });


                dataFound(res, parsed)
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    }

    const projectScheduleUpdate = async (req, res) => {
        const { sch_Project_Id, Task_Levl_Id, Sch_Id, Type_Task_Id, Task_Sch_Duaration, Task_Start_Time, Task_End_Time, Task_Est_End_Date, Task_Est_Start_Date, Task_Sch_Status } = req.body;

        if (!checkIsNumber(sch_Project_Id)) {
            return invalidInput(res, 'sch_Project_Id is required and must be a number');
        }
        if (!checkIsNumber(Task_Levl_Id)) {
            return invalidInput(res, 'Task_Levl_Id is required and must be a number');
        }
        if (!checkIsNumber(Sch_Id)) {
            return invalidInput(res, 'sch_Id is required and must be a number');
        }

        try {
            const getQuery = `SELECT Sch_Id FROM tbl_Project_Schedule WHERE Project_Id = @sch_Project_Id`;

            const requestGet = new sql.Request();
            requestGet.input('sch_Project_Id', sql.BigInt, sch_Project_Id);

            const resultget = await requestGet.query(getQuery);


            if (resultget.recordset.length === 0) {
                return noData(res, 'No schedule found for the given project ID');
            }

            const Sch_IdNew = resultget.recordset[0].Sch_Id;


            const query1 = `
            UPDATE tbl_Project_Sch_Task_DT
            SET Sch_Project_Id = @Sch_Project_Id, Sch_Id = @Sch_Id, Type_Task_Id = @Type_Task_Id,
            Task_Sch_Duaration=@Task_Sch_Duaration,
            Task_Start_Time=@Task_Start_Time,
            Task_End_Time=@Task_End_Time,
            Task_Est_End_Date=@Task_Est_End_Date,
            Task_Est_Start_Date=@Task_Est_Start_Date,
            Task_Sch_Status=@Task_Sch_Status
            WHERE Task_Levl_Id = @Task_Levl_Id
        `;

            const request1 = new sql.Request();
            request1.input('Sch_Project_Id', sch_Project_Id);
            request1.input('Task_Levl_Id', Task_Levl_Id);
            request1.input('Type_Task_Id', Type_Task_Id);
            request1.input('Sch_Id', Sch_IdNew);
            request1.input('Task_Sch_Duaration', Task_Sch_Duaration);
            request1.input('Task_Start_Time', Task_Start_Time);
            request1.input('Task_End_Time', Task_End_Time);
            request1.input('Task_Est_End_Date', Task_Est_End_Date);
            request1.input('Task_Sch_Status', Task_Sch_Status);
            request1.input('Task_Est_Start_Date', Task_Est_Start_Date);

            const result1 = await request1.query(query1);


            const query2 = `
            UPDATE [tbl_Task_Details]
            SET Project_Id = @Project_Id, Sch_Id = @Sch_Id 
            WHERE Task_Levl_Id = @Task_Levl_Id
        `;

            const request2 = new sql.Request();
            request2.input('Project_Id', sql.BigInt, sch_Project_Id);
            request2.input('Sch_Id', sql.BigInt, Sch_IdNew);
            request2.input('Task_Levl_Id', sql.BigInt, Task_Levl_Id);

            const result2 = await request2.query(query2);


            const query3 = `
            UPDATE [tbl_Work_Master] 
            SET Project_Id = @Project_Id, Sch_Id = @Sch_Id
            WHERE AN_No IN (
                SELECT AN_No FROM [tbl_Task_Details] WHERE Task_Levl_Id = @Task_Levl_Id
            )
        `;

            const request3 = new sql.Request();
            request3.input('Project_Id', sql.BigInt, sch_Project_Id);
            request3.input('Sch_Id', sql.BigInt, Sch_IdNew);
            request3.input('Task_Levl_Id', sql.BigInt, Task_Levl_Id);

            const result3 = await request3.query(query3);

            if (result1.rowsAffected[0] > 0 || result2.rowsAffected[0] > 0 || result3.rowsAffected[0] > 0) {
                dataFound(res, {
                    message: 'Project schedule updated successfully'
                });
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getSchedule,
        getScheduleType,
        createSchedule,
        putSchedule,
        deleteSchedule,
        assignTaskInSchedule,
        modifyTaskInSchedule,
        deleteTaskInSchedule,
        createNewTaskwithSchedule,
        getScheduleProjectid,
        projectScheduleTaskdetails,
        projectScheduleTaskupdate,
        newgetScheduleType,
        projectDetailsforReport,
        getScheduleProjectidActivity,
        projectScheduleAbstart,
        taskTypebyProjectId,
        projectScheduleUpdate
    }
}


export default ProjectScheduler();