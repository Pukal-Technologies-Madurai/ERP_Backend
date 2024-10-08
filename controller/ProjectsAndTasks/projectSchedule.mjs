import sql from 'mssql';
import { dataFound, noData, success, failed, servError, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

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

    return {
        getSchedule,
        getScheduleType,
        createSchedule,
        putSchedule,
        deleteSchedule,
        assignTaskInSchedule,
        modifyTaskInSchedule,
        deleteTaskInSchedule,
    }
}


export default ProjectScheduler();