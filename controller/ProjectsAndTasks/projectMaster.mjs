import sql from 'mssql';
import { dataFound, noData, invalidInput, servError, success, failed } from '../../res.mjs'
import { checkIsNumber } from '../../helper_functions.mjs';


const projectController = () => {

    const getProjectDropDown = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const result = (await new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT Project_Id, Project_Name
                    FROM tbl_Project_Master
                    WHERE IsActive = 1`)
            ).recordset;
            // WHERE
            // Company_id = @comp

            if (result.length > 0) {
                dataFound(res, result);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getProject = async (req, res) => {

        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const result = (await new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT 
                        p.*,
                        COALESCE(ph.Name, 'NOT FOUND!') AS Project_Head_Name,
                        COALESCE(eby.Name, 'NOT FOUND!') AS CreatedBy,
                        COALESCE(uby.Name, 'NOT FOUND!') AS UpdatedBy,
                        COALESCE(s.Status, 'NOT FOUND!') AS Status
                    FROM 
                        tbl_Project_Master AS p
                        LEFT JOIN tbl_Users AS ph
                            ON ph.UserId = p.Project_Head
                        LEFT JOIN tbl_Users AS eby
                            ON eby.UserId = p.Entry_By
                        LEFT JOIN tbl_Users AS uby
                            ON uby.UserId = p.Update_By
                        LEFT JOIN tbl_Status AS s
                            ON s.Status_Id = p.Project_Status
                    WHERE p.IsActive = 1;
                `)
            ).recordset

            if (result.length > 0) {
                dataFound(res, result);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }




    
    const postProject = async (req, res) => {
        const { Project_Name, Project_Desc, Project_Head, Est_Start_Dt, Est_End_Dt, Project_Status, Entry_By, Company_id } = req.body;

    
        if (!Project_Name || !checkIsNumber(Company_id)) {
            return invalidInput(res, 'Project_Name and Company_id are required');
        }
    
        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const maxProjectIdRequest = await new sql.Request(transaction)
            .query(`SELECT ISNULL(MAX(Project_Id), 0) + 1 AS NewProjectId FROM tbl_Project_Master`);


        const NewProjectId = maxProjectIdRequest.recordset[0].NewProjectId;

            // Remove Project_Id from the insert query
            const request = await new sql.Request(transaction)
                .input('Project_Name', sql.VarChar, Project_Name)
                .input('Project_Desc', sql.Text, Project_Desc)
                .input('Company_id', sql.Int, Company_id)
                .input('Project_Head', sql.VarChar, Project_Head)
                .input('Est_Start_Dt', sql.Date, Est_Start_Dt)
                .input('Est_End_Dt', sql.Date, Est_End_Dt)
                .input('Project_Status', sql.VarChar, Project_Status)
                .input('Entry_By', sql.VarChar, Entry_By)
                .input('Entry_Date', sql.DateTime, new Date())
                .input('Update_By', sql.Int, 1)
                .input('Update_Date', sql.DateTime, new Date())
                .query(`
                    INSERT INTO tbl_Project_Master (
                        Project_Name, Project_Desc, Company_id, Project_Head, Est_Start_Dt, Est_End_Dt, Project_Status, Entry_By, Entry_Date, Update_By, Update_Date
                    ) VALUES (
                        @Project_Name, @Project_Desc, @Company_id, @Project_Head, @Est_Start_Dt, @Est_End_Dt, @Project_Status, @Entry_By, @Entry_Date, @Update_By, @Update_Date
                    );
                `);
                if (request.rowsAffected[0] === 0) {
                    throw new Error('Failed to add project');
                }
        
                // Insert into the Discussion Forum with the same Project_Id
                const DiscussionTopicCreation = await new sql.Request(transaction)
                    .input('Topic', sql.VarChar, Project_Name)
                    .input('Description', sql.Text, 'The Discussion Forum for the project: ' + Project_Name)
                    .input('Company_id', sql.Int, Company_id)
                    .input('CreatedAt', sql.DateTime, new Date())
                    .input('IsActive', sql.Bit, 1)
                    .input('Project_Id', sql.Int, NewProjectId)
                    .query(`
                        INSERT INTO tbl_Discussion_Topics (
                            Topic, Description, Company_id, CreatedAt, IsActive, Project_Id
                        ) VALUES (
                            @Topic, @Description, @Company_id, @CreatedAt, @IsActive, @Project_Id
                        )
                    `);
        
                if (DiscussionTopicCreation.rowsAffected[0] === 0) {
                    throw new Error('Failed to create Discussion Forum');
                }
        
                await transaction.commit();
                return success(res, 'Project and Discussion Forum created successfully');
        
            } catch (error) {
                await transaction.rollback();
                return servError(error, res);
            }
        };

   
    
    const editProject = async (req, res) => {
        const { Project_Id, Project_Name, Project_Desc, Project_Head, Est_Start_Dt, Est_End_Dt, Project_Status, Entry_By } = req.body;

        if (!Project_Id || !Project_Name) {
            return invalidInput(res, 'Project_Id and Project_Name are required');
        }

        const transaction = new sql.Transaction();
        try {
            await transaction.begin();

            const updateProjectRequest = await new sql.Request(transaction)
                .input('Project_Id', sql.Int, Project_Id)
                .input('Project_Name', sql.VarChar, Project_Name)
                .input('Project_Desc', sql.Text, Project_Desc)
                .input('Project_Head', sql.Int, Project_Head)
                .input('Est_Start_Dt', sql.Date, Est_Start_Dt)
                .input('Est_End_Dt', sql.Date, Est_End_Dt)
                .input('Project_Status', sql.Int, Project_Status)
                .input('Update_By', sql.Int, Entry_By)
                .input('Update_Date', sql.DateTime, new Date())
                .query(`
                    UPDATE tbl_Project_Master
                    SET
                        Project_Name = @Project_Name,
                        Project_Desc = @Project_Desc,
                        Project_Head = @Project_Head,
                        Est_Start_Dt = @Est_Start_Dt,
                        Est_End_Dt = @Est_End_Dt,
                        Project_Status = @Project_Status,
                        Update_By = @Update_By,
                        Update_Date = @Update_Date
                    WHERE Project_Id = @Project_Id
                `);

            if (updateProjectRequest.rowsAffected[0] === 0) {
                throw new Error('Failed to update project');
            }

            const updateDiscussionForumRequest = await new sql.Request(transaction)
                .input('Topic', sql.VarChar, Project_Name)
                .input('Description', sql.Text, 'Created Discussion Forum for the project: ' + Project_Name)
                .input('Project_Id', sql.Int, Project_Id)
                .query(`
                    UPDATE tbl_Discussion_Topics
                    SET
                        Topic = @Topic,
                        Description = @Description
                    WHERE Project_Id = @Project_Id
                `);

            // if (updateDiscussionForumRequest.rowsAffected[0] === 0) {
            //     throw new Error('Failed to update Discussion Forum');
            // }

            await transaction.commit();
            return success(res, 'Project and Discussion Forum updated successfully');

        } catch (e) {
            await transaction.rollback();
            return servError(e, res);
        }
    };

    const deleteProject = async (req, res) => {
        const { Project_Id } = req.body;

        if (!Project_Id) {
            return invalidInput(res, 'Invalid Project_Id')
        }

        try {
            const request = new sql.Request()
                .input('Project_Id', Project_Id)
                .query(`
                    UPDATE tbl_Project_Master
                    SET
                        IsActive = 0
                    WHERE Project_Id = @Project_Id;

                    UPDATE tbl_Discussion_Topics
                    SET
                        IsActive = 0
                    WHERE Project_Id = @Project_Id;
                `)

            const result = await request;

            let messageText = 'Project';

            if (result.rowsAffected[0] > 0) {
                if (result.rowsAffected[1] > 0) {
                    messageText += ' and discussion topics are'
                }
                messageText += ' set to inactive'
                success(res, messageText)
            } else {
                failed(res, 'Failed to remove project')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getProjectAbstract = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const request = new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT 
                        p.Project_Id, 
                        p.Project_Name, 
                        p.Est_Start_Dt, 
                        p.Est_End_Dt,

                        COALESCE((
                            SELECT 
                                COUNT(Sch_Id) 
                            FROM 
                                tbl_Project_Schedule 
                            WHERE 
                                Project_Id = p.Project_Id 
                                AND 
                                Sch_Del_Flag = 0
                        ), 0) AS SchedulesCount,

                        COALESCE((
                            SELECT 
                                COUNT(Sch_Id) 
                            FROM 
                                tbl_Project_Schedule 
                            WHERE 
                                Project_Id = p.Project_Id 
                                AND 
                                Sch_Del_Flag = 0
                                AND
                                Sch_Status = 3
                        ), 0) AS SchedulesCompletedCount,

                        COALESCE((
                            SELECT 
                                COUNT(t.Task_Id) 
                            FROM 
                                tbl_Project_Schedule AS s
                                JOIN tbl_Project_Sch_Task_DT AS t 
                                ON s.Sch_Id = t.Sch_Id
                            WHERE 
                                s.Project_Id = p.Project_Id
                                AND 
                                t.Sch_Project_Id = p.Project_Id
                                AND
                                s.Sch_Del_Flag = 0
                                AND
                                t.Task_Sch_Del_Flag = 0
                        ), 0) AS TasksScheduled,

                        COALESCE((
                            SELECT 
                                COUNT(A_Id)
                            FROM
                                tbl_Project_Sch_Task_DT
                            WHERE
                                Sch_Project_Id = p.Project_Id 
                                AND
                                Task_Sch_Status = 3
                        ), 0) AS CompletedTasks,

                        COALESCE((
                            SELECT
                                COUNT(DISTINCT Task_Levl_Id)
                            FROM 
                                tbl_Task_Details
                            WHERE
                                Project_Id = p.Project_Id
                        ), 0) AS TasksAssignedToEmployee,

                        COALESCE((
                            SELECT 
                                COUNT(DISTINCT  Task_Levl_Id)
                            FROM 
                                tbl_Work_Master
                            WHERE
                                Project_Id = p.Project_Id
                        ), 0) AS TasksProgressCount,

                        COALESCE((
                            SELECT
                                  COUNT(DISTINCT Emp_Id)
                            FROM 
                                tbl_Task_Details
                            WHERE 
                                Project_Id = p.Project_Id
                                  AND
                                  Invovled_Stat = 1
                        ), 0) AS EmployeesInvolved
                        
                    FROM 
                        tbl_Project_Master AS p
                    WHERE 
                        p.Project_Status != 3 
                        AND p.Project_Status != 4
                        `)
            // AND p.Company_id = @comp
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

    const getStatusList = async (req, res) => {
        try {
            const result = (await new sql.query(`
                    SELECT Status_Id, Status 
                    FROM tbl_Status 
                    WHERE Status_Id!=0  
                    ORDER BY Status_Id
                `)).recordset;
            if (result.length > 0) {
                return dataFound(res, result)
            } else {
                return noData(res)
            }
        } catch (e) {
            return servError(e, res)
        }
    }

    const getProjectAbstractProjectId = async (req, res) => {
        const { Company_id, Project_Id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required and must be a number');
        }

        if (!checkIsNumber(Project_Id)) {
            return invalidInput(res, 'Project_Id is required and must be a number');
        }

        try {
            const request = new sql.Request()
                .input('comp', Company_id)
                .input('project', Project_Id)
                .query(`
                    SELECT 
                    p.Project_Id, 
                    p.Project_Name, 
                    p.Est_Start_Dt, 
                    p.Est_End_Dt,

                    COALESCE((SELECT COUNT(Sch_Id) 
                              FROM tbl_Project_Schedule 
                              WHERE Project_Id = p.Project_Id 
                              AND Sch_Del_Flag = 0), 0) AS SchedulesCount,

                    COALESCE((SELECT COUNT(Sch_Id) 
                              FROM tbl_Project_Schedule 
                              WHERE Project_Id = p.Project_Id 
                              AND Sch_Del_Flag = 0
                              AND Sch_Status = 3), 0) AS SchedulesCompletedCount,

                    COALESCE((SELECT COUNT(t.Task_Id) 
                              FROM tbl_Project_Schedule AS s
                              JOIN tbl_Project_Sch_Task_DT AS t 
                              ON s.Sch_Id = t.Sch_Id
                              WHERE s.Project_Id = p.Project_Id
                              AND t.Sch_Project_Id = p.Project_Id
                              AND s.Sch_Del_Flag = 0
                              AND t.Task_Sch_Del_Flag = 0), 0) AS TasksScheduled,

                    COALESCE((SELECT COUNT(A_Id)
                              FROM tbl_Project_Sch_Task_DT
                              WHERE Sch_Project_Id = p.Project_Id 
                              AND Task_Sch_Status = 3), 0) AS CompletedTasks,

                    COALESCE((SELECT COUNT(DISTINCT Task_Levl_Id)
                              FROM tbl_Task_Details
                              WHERE Project_Id = p.Project_Id), 0) AS TasksAssignedToEmployee,

                    COALESCE((SELECT COUNT(DISTINCT Task_Levl_Id)
                              FROM tbl_Work_Master
                              WHERE Project_Id = p.Project_Id), 0) AS TasksProgressCount,

                    COALESCE((SELECT COUNT(DISTINCT Emp_Id)
                              FROM tbl_Task_Details
                              WHERE Project_Id = p.Project_Id
                              AND Invovled_Stat = 1), 0) AS EmployeesInvovled
                FROM 
                    tbl_Project_Master AS p
                WHERE 
                    p.Project_Status != 3 
                    AND p.Project_Status != 4
                    AND p.Company_id = @comp
                    AND p.Project_Id = @project


                `);

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };


//     const newProjectAbstract = async (req, res) => {
//         const { Company_id } = req.query;

//         if (!checkIsNumber(Company_id)) {
//             return invalidInput(res, 'Company_id is required');
//         }

      
//         try {
//             const request = new sql.Request()
//                 .input('comp', Company_id)
//                 .query( ` SELECT 
//     p.Project_Id, 
//     p.Project_Name, 
//     p.Est_Start_Dt, 
//     p.Est_End_Dt,
//     p.Project_Desc,
//     p.Project_Status,
//     p.Project_Head  As Project_Head_Id,
//     s.Status, -- Assuming 'Status_Name' is the column storing the status name from tbl_Status
    
//     COALESCE(( 
//         SELECT COUNT(Sch_Id) 
//         FROM tbl_Project_Schedule 
//         WHERE Project_Id = p.Project_Id 
//         AND Sch_Del_Flag = 0
//     ), 0) AS SchedulesCount,

//     -- Existing Count of Completed Schedules
//     COALESCE(( 
//         SELECT COUNT(Sch_Id) 
//         FROM tbl_Project_Schedule 
//         WHERE Project_Id = p.Project_Id 
//         AND Sch_Del_Flag = 0
//         AND Sch_Status = 3
//     ), 0) AS SchedulesCompletedCount,

//     -- Existing Count of Tasks Scheduled
//     COALESCE(( 
//         SELECT COUNT(t.Task_Id) 
//         FROM tbl_Project_Schedule AS s
//         JOIN tbl_Project_Sch_Task_DT AS t 
//         ON s.Sch_Id = t.Sch_Id
//         WHERE s.Project_Id = p.Project_Id
//         AND t.Sch_Project_Id = p.Project_Id
//         AND s.Sch_Del_Flag = 0
//         AND t.Task_Sch_Del_Flag = 0
//     ), 0) AS TodayTaskcounts,
    
//     COALESCE(( 
//     SELECT 
//     COUNT( CONCAT(t.Project_Id, t.Sch_Id, t.Task_Levl_Id, t.Task_Id)) AS TaskCount
// FROM 
//     dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
//         WHERE t.Project_Id =  p.Project_Id
//     ), 0) AS TasksScheduled,
    

// COALESCE(
//     (
//         SELECT COUNT(DISTINCT t.Task_Id) 
//             FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
//         WHERE t.Project_Id = p.Project_Id
//     ), 0
// ) AS CompletedTasks,



//     -- Existing Count of Tasks Assigned to Employees
//     COALESCE(( 
//         SELECT COUNT(DISTINCT Task_Levl_Id)
//         FROM tbl_Task_Details
//         WHERE Project_Id = p.Project_Id
//     ), 0) AS TasksAssignedToEmployee,

//     -- Existing Count of Tasks in Progress
    

//       COALESCE(( 
//         SELECT COUNT(*)
//         FROM tbl_Project_Employee pe
//         WHERE pe.Project_Id = p.Project_Id
//     ), 0) AS EmployeesInvolved
// FROM 
//     tbl_Project_Master AS p
// LEFT JOIN 
//     tbl_Users AS u ON p.Project_Head = u.UserId 
// LEFT JOIN 
//     tbl_Status AS s ON p.Project_Status = s.Status_Id  
// WHERE 
//     p.Project_Status NOT IN (3, 4) AND p.IsActive !=0
//     AND p.Company_id =@comp
// `)
//             // AND p.Company_id = @comp
//             const result = await request;

//             if (result.recordset.length > 0) {
//                 dataFound(res, result.recordset)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res)
//         }
//     }

const newProjectAbstract = async (req, res) => {
    const { Company_id, EmpId } = req.query;

    if (!checkIsNumber(Company_id)) {
        return invalidInput(res, 'Company_id is required');
    }

    try {
        const request = new sql.Request()
            .input('comp', Company_id)
            .input('empId', EmpId || null)
            .query(` 
                SELECT 
                    p.Project_Id, 
                    p.Project_Name, 
                    p.Est_Start_Dt, 
                    p.Est_End_Dt,
                    p.Project_Desc,
                    p.Project_Status,
                    p.Project_Head As Project_Head_Id,
                    s.Status,
                    
                    COALESCE(( 
                        SELECT COUNT(Sch_Id) 
                        FROM tbl_Project_Schedule 
                        WHERE Project_Id = p.Project_Id 
                        AND Sch_Del_Flag = 0
                    ), 0) AS SchedulesCount,

                    COALESCE(( 
                        SELECT COUNT(Sch_Id) 
                        FROM tbl_Project_Schedule 
                        WHERE Project_Id = p.Project_Id 
                        AND Sch_Del_Flag = 0
                        AND Sch_Status = 3
                    ), 0) AS SchedulesCompletedCount,

                    COALESCE(( 
                        SELECT COUNT(t.Task_Id) 
                        FROM tbl_Project_Schedule AS s
                        JOIN tbl_Project_Sch_Task_DT AS t 
                        ON s.Sch_Id = t.Sch_Id
                        WHERE s.Project_Id = p.Project_Id
                        AND t.Sch_Project_Id = p.Project_Id
                        AND s.Sch_Del_Flag = 0
                        AND t.Task_Sch_Del_Flag = 0
                    ), 0) AS TodayTaskcounts,
                    
                    COALESCE(( 
                        SELECT COUNT( CONCAT(t.Project_Id, t.Sch_Id, t.Task_Levl_Id, t.Task_Id)) AS TaskCount
                        FROM dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
                        WHERE t.Project_Id = p.Project_Id
                    ), 0) AS TasksScheduled,
                    
                    COALESCE(
                        (
                            SELECT COUNT(DISTINCT t.Task_Id) 
                            FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
                            WHERE t.Project_Id = p.Project_Id
                        ), 0
                    ) AS CompletedTasks,

                    COALESCE(( 
                        SELECT COUNT(DISTINCT Task_Levl_Id)
                        FROM tbl_Task_Details
                        WHERE Project_Id = p.Project_Id
                    ), 0) AS TasksAssignedToEmployee,

                    COALESCE(( 
                        SELECT COUNT(*)
                        FROM tbl_Project_Employee pe
                        WHERE pe.Project_Id = p.Project_Id
                    ), 0) AS EmployeesInvolved,

                    -- Task Types as JSON array
                    (
                        SELECT 
                           tt.*
                        FROM tbl_Task_Type tt
                        WHERE tt.Project_Id = p.Project_Id
                        AND tt.Status = 1
                        FOR JSON PATH
                    ) AS TaskTypes

                FROM 
                    tbl_Project_Master AS p
                LEFT JOIN 
                    tbl_Users AS u ON p.Project_Head = u.UserId 
                LEFT JOIN 
                    tbl_Status AS s ON p.Project_Status = s.Status_Id  
                WHERE 
                    p.Project_Status NOT IN (3, 4) 
                    AND p.IsActive != 0
                    AND p.Company_id = @comp
                    AND (@empId IS NULL OR p.Project_Id IN (
                        SELECT pe.Project_Id 
                        FROM tbl_Project_Employee pe 
                        WHERE pe.User_Id = @empId
                    ))
            `);

        const result = await request;

        if (result.recordset.length > 0) {
            // Parse the JSON task types for each project and format the response
            const projectsWithTaskTypes = result.recordset.map(project => ({
                Project_Id: project.Project_Id,
                Project_Name: project.Project_Name,
                Est_Start_Dt: project.Est_Start_Dt,
                Est_End_Dt: project.Est_End_Dt,
                Project_Desc: project.Project_Desc,
                Project_Status: project.Project_Status,
                Project_Head_Id: project.Project_Head_Id,
                Status: project.Status,
                SchedulesCount: project.SchedulesCount,
                SchedulesCompletedCount: project.SchedulesCompletedCount,
                TodayTaskcounts: project.TodayTaskcounts,
                TasksScheduled: project.TasksScheduled,
                CompletedTasks: project.CompletedTasks,
                TasksAssignedToEmployee: project.TasksAssignedToEmployee,
                EmployeesInvolved: project.EmployeesInvolved,
                TaskTypes: project.TaskTypes ? JSON.parse(project.TaskTypes) : []
            }));

            // Return as JSON response
           
                dataFound(res, projectsWithTaskTypes)
        }
          else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }




     const projectAbstractTaskNew = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

      
        try {
            const request = new sql.Request()
                .input('comp', Company_id)
                .query( ` SELECT 
    p.Project_Id, 
    p.Project_Name, 
    p.Est_Start_Dt, 
    p.Est_End_Dt,
    p.Project_Desc,
    p.Project_Status,
    p.Project_Head  As Project_Head_Id,
    s.Status, -- Assuming 'Status_Name' is the column storing the status name from tbl_Status
    
    COALESCE(( 
        SELECT COUNT(Sch_Id) 
        FROM tbl_Project_Schedule 
        WHERE Project_Id = p.Project_Id 
        AND Sch_Del_Flag = 0
    ), 0) AS SchedulesCount,

    -- Existing Count of Completed Schedules
    COALESCE(( 
        SELECT COUNT(Sch_Id) 
        FROM tbl_Project_Schedule 
        WHERE Project_Id = p.Project_Id 
        AND Sch_Del_Flag = 0
        AND Sch_Status = 3
    ), 0) AS SchedulesCompletedCount,

    -- Existing Count of Tasks Scheduled
    COALESCE(( 
        SELECT COUNT(t.Task_Id) 
        FROM tbl_Project_Schedule AS s
        JOIN tbl_Project_Sch_Task_DT AS t 
        ON s.Sch_Id = t.Sch_Id
        WHERE s.Project_Id = p.Project_Id
        AND t.Sch_Project_Id = p.Project_Id
        AND s.Sch_Del_Flag = 0
        AND t.Task_Sch_Del_Flag = 0
    ), 0) AS TodayTaskcounts,
    
    COALESCE(( 
    SELECT 
    COUNT( CONCAT(t.Project_Id, t.Sch_Id, t.Task_Levl_Id, t.Task_Id)) AS TaskCount
FROM 
    dbo.Task_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
        WHERE t.Project_Id =  p.Project_Id
    ), 0) AS TasksScheduled,
    

COALESCE(
    (
        SELECT COUNT(DISTINCT t.Task_Id) 
            FROM dbo.Work_Details_Today_Fn(CAST(GETDATE() AS DATE)) t
        WHERE t.Project_Id = p.Project_Id
    ), 0
) AS CompletedTasks,



    -- Existing Count of Tasks Assigned to Employees
    COALESCE(( 
        SELECT COUNT(DISTINCT Task_Levl_Id)
        FROM tbl_Task_Details
        WHERE Project_Id = p.Project_Id
    ), 0) AS TasksAssignedToEmployee,

    -- Existing Count of Tasks in Progress
    

      COALESCE(( 
        SELECT COUNT(*)
        FROM tbl_Project_Employee pe
        WHERE pe.Project_Id = p.Project_Id
    ), 0) AS EmployeesInvolved
FROM 
    tbl_Project_Master AS p
LEFT JOIN 
    tbl_Users AS u ON p.Project_Head = u.UserId 
LEFT JOIN 
    tbl_Status AS s ON p.Project_Status = s.Status_Id  
WHERE 
  --  p.Project_Status NOT IN (3, 4) AND
   p.IsActive !=0 AND
  --  AND 
    p.Company_id =@comp
`)
            // AND p.Company_id = @comp
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
        getProjectDropDown,
        getProject,
        postProject,
        editProject,
        deleteProject,
        getProjectAbstract,
        getStatusList,
        getProjectAbstractProjectId,
        newProjectAbstract,
        projectAbstractTaskNew
    }
}

export default projectController();