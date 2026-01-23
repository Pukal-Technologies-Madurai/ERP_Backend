import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, groupData, ISOString, toArray } from '../../helper_functions.mjs';
import SPCall from '../../middleware/SPcall.mjs';
import dotenv from 'dotenv';

dotenv.config();
const Company = process.env.COMPANY;

const DashboardController = () => {

    const getDashboardData = async (req, res) => {
        const { UserType, Emp_Id } = req.query;

        if ((isNaN(UserType) && !UserType) || !Emp_Id) {
            return invalidInput(res, 'UserType, Emp_Id is required');
        }

        try {
            const isAdmin = (Number(UserType) === 1 || Number(UserType) === 0 || Number(UserType) === 2);

            const adminQuery = `
                SELECT 

                (
                    SELECT 
                        COUNT(UserId) 
                    FROM 
                        tbl_Users 
                    WHERE 
                        UserId != 0 AND UDel_Flag = 0 AND UserTypeId = 3
                ) AS EmployeeCounts,
                
                (
                    SELECT 
                        COUNT(UserId) 
                    FROM 
                        tbl_Users 
                    WHERE 
                        UserId != 0 AND UDel_Flag = 0 AND UserTypeId != 3
                ) AS OtherUsers,
                
                (
                    SELECT
                        COUNT(Project_Id)
                    FROM 
                        tbl_Project_Master
                    WHERE 
                        Project_Status != 3 AND Project_Status != 4 
                ) AS ActiveProjects,
                
                (
                    SELECT
                        COUNT(Project_Id)
                    FROM 
                        tbl_Project_Master
                ) AS AllProjects,
                
                (
                    SELECT 
                        COUNT(Sch_Id)
                    FROM 
                        tbl_Project_Schedule
                    WHERE 
                        Sch_Status != 3 AND Sch_Status != 4 AND Sch_Del_Flag = 0
                ) AS ActiveSchedule,
                
                (
                    SELECT 
                        COUNT(Sch_Id)
                    FROM 
                        tbl_Project_Schedule
                    WHERE
                        Sch_Del_Flag = 0
                ) AS AllSchedule,
                
                (
                    SELECT 
                        COUNT(A_Id)
                    FROM 
                        tbl_Project_Sch_Task_DT
                    WHERE
                        Task_Sch_Del_Flag = 0
                ) AS TaskInvolved,
                
                (
                    SELECT
                        DISTINCT(COUNT(Task_Levl_Id))
                    FROM 
                        tbl_Task_Details
                    WHERE
                        Invovled_Stat = 1
                ) AS TaskAssigned,
                
                (
                    SELECT
                        DISTINCT(COUNT(Task_Levl_Id))
                    FROM
                        tbl_Work_Master
                    WHERE
                        Work_Status = 3
                        AND
                        Project_Id != 1
                ) AS TaskCompleted,
                
                (
                    SELECT
                        SUM(Tot_Minutes)
                    FROM 
                        tbl_Work_Master
                    WHERE
                        Work_Status = 3
                        AND
                        Project_Id != 1
                ) AS TotalMinutes,

                (
                    SELECT
                        COUNT(Task_Levl_Id)
                    FROM 
                        tbl_Task_Details
                    WHERE 
                        CONVERT(DATE, Est_Start_Dt) <= CONVERT(DATE, GETDATE())
                        AND
                        CONVERT(DATE, Est_End_Dt) >= CONVERT(DATE, GETDATE())
                ) AS TodayTasks,

                (
                    SELECT
                        COUNT(Task_Levl_Id)
                    FROM 
                        tbl_Work_Master
                    WHERE
                        CONVERT(DATE, Work_Dt) = CONVERT(DATE, GETDATE())
                        AND
                        Work_Status = 3
                ) AS TodayTaskCompleted`;

            const employeeQuery = `
            SELECT 
	
	            (
	            	SELECT
	            		DISTINCT(COUNT(Task_Levl_Id))
	            	FROM 
	            		tbl_Task_Details
	            	WHERE
	            		Invovled_Stat = 1
	            		AND
	            		Emp_Id = ${Emp_Id}
	            ) AS TotalTasks,
                
	             (
	            	SELECT
	            		DISTINCT(COUNT(Task_Levl_Id))
                    FROM
	            		tbl_Work_Master
	            	WHERE
	            		Work_Status = 3
	            		AND
	            		Emp_Id = ${Emp_Id}
	            ) AS TaskCompleted,

                (
	            	SELECT
	            		SUM(Tot_Minutes)
                    FROM 
	            		tbl_Work_Master
	            	WHERE
	            		Work_Status = 3
	            	AND
	            		Emp_Id = ${Emp_Id}
	            ) AS WorkedMinutes,
                
	            (
	            	SELECT
	            		COUNT(Task_Levl_Id)
	            	FROM 
	            		tbl_Task_Details
	            	WHERE 
	            		CONVERT(DATE, Est_Start_Dt) <= CONVERT(DATE, GETDATE())
	            		AND
                        CONVERT(DATE, Est_End_Dt) >= CONVERT(DATE, GETDATE())
	            		AND
	            		Emp_Id = ${Emp_Id}
	            ) AS TodayTasks,
                
	            (
	            	SELECT
	            		COUNT(Task_Levl_Id)
	            	FROM 
	            		tbl_Work_Master
                    WHERE
	            		CONVERT(DATE, Work_Dt) = CONVERT(DATE, GETDATE())
                        AND
                        Work_Status = 3
	            		AND
	            		Emp_Id = ${Emp_Id}
	            ) AS TodayTaskCompleted`

            const result = await sql.query(isAdmin ? adminQuery : employeeQuery)

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getTallyWorkDetails = async (req, res) => {
        const { UserId, From, To } = req.query;

        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required');
        }

        try {
            const request = new sql.Request();
            request.input('User_Mgt_Id', UserId);
            request.input('Fromdate', From ? new Date(From).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
            request.input('Todate', To ? new Date(To).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

            const result = await request.execute('Transaction_User_Count_List_By_Emp_Id');

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getEmployeeAbstract = async (req, res) => {
        const { UserId, fromDate, toDate } = req.query;

        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required');
        }

        if (!fromDate || !toDate) {
            return invalidInput(res, 'fromDate and toDate are required');
        }

        try {
            const query = `
        SELECT 
            u.UserId,
            u.Name,
            u.UserTypeId,
            ut.UserType,
            u.BranchId,
            b.BranchName,

            COALESCE((
                SELECT DISTINCT 
                    td.Project_Id,
                    p.Project_Name
                FROM tbl_Task_Details AS td
                LEFT JOIN tbl_Project_Master AS p
                    ON p.Project_Id = td.Project_Id
                WHERE td.Emp_Id = u.UserId
                  AND (
                        (CONVERT(DATE, td.Est_Start_Dt) >= @fromDate AND CONVERT(DATE, td.Est_Start_Dt) <= @toDate)
                        OR (CONVERT(DATE, td.Est_End_Dt) >= @fromDate AND CONVERT(DATE, td.Est_End_Dt) <= @toDate)
                        OR (CONVERT(DATE, td.Est_Start_Dt) <= @fromDate AND CONVERT(DATE, td.Est_End_Dt) >= @toDate)
                  )
                FOR JSON PATH
            ), '[]') AS Projects,

            COALESCE((
                SELECT 
                    td.Task_Id,
                    t.Task_Name,
                    t.Task_Desc,
                    td.AN_No,
                    td.Project_Id,
                    p.Project_Name,  -- Added Project_Name here
                    CONVERT(DATE, td.Est_Start_Dt) AS Est_Start_Dt,
                    CONVERT(DATE, td.Est_End_Dt) AS Est_End_Dt,
                    td.Sch_Time,
                    td.EN_Time,
                    td.Sch_Period,
                    td.Timer_Based,

                    COALESCE((
                        SELECT 
                            tpd.*,
                            tpdtpm.Paramet_Name,
                            tpdtpm.Paramet_Data_Type
                        FROM tbl_Task_Paramet_DT AS tpd
                        LEFT JOIN tbl_Paramet_Master AS tpdtpm
                            ON tpdtpm.Paramet_Id = tpd.Param_Id
                        WHERE tpd.Task_Id = td.Task_Id
                        FOR JSON PATH
                    ), '[]') AS Task_Param,

                    COALESCE((
                        SELECT
                            wk.Work_Id,
                            wk.Work_Dt,
                            wk.Work_Done,
                            wk.Start_Time,
                            wk.End_Time,
                            wk.Tot_Minutes,
                            wk.Work_Status,
                            s.Status AS StatusGet,

                            COALESCE((
                                SELECT 
                                    wp.Current_Value,
                                    wp.Default_Value,
                                    wp.Param_Id,
                                    pm.Paramet_Name,
                                    pm.Paramet_Data_Type
                                FROM tbl_Work_Paramet_DT AS wp
                                LEFT JOIN tbl_Paramet_Master AS pm
                                    ON pm.Paramet_Id = wp.Param_Id
                                WHERE wp.Work_Id = wk.Work_Id
                                FOR JSON PATH
                            ), '[]') AS Parameter_Details

                        FROM tbl_Work_Master AS wk
                        LEFT JOIN tbl_Status AS s
                            ON s.Status_Id = wk.Work_Status
                        WHERE wk.AN_No = td.AN_No
                          AND CONVERT(DATE, wk.Work_Dt) >= @fromDate 
                          AND CONVERT(DATE, wk.Work_Dt) <= @toDate
                        ORDER BY 
                            wk.Work_Dt ASC, 
                            TRY_CONVERT(TIME, wk.Start_Time) ASC, 
                            TRY_CONVERT(TIME, wk.End_Time) ASC
                        FOR JSON PATH
                    ), '[]') AS Work_Details

                FROM tbl_Task_Details AS td
                LEFT JOIN tbl_Task AS t
                    ON td.Task_Id = t.Task_Id
                LEFT JOIN tbl_Project_Master AS p  -- Added JOIN for project master
                    ON p.Project_Id = td.Project_Id
                WHERE td.Emp_Id = u.UserId
                  AND (
                        (CONVERT(DATE, td.Est_Start_Dt) >= @fromDate AND CONVERT(DATE, td.Est_Start_Dt) <= @toDate)
                        OR (CONVERT(DATE, td.Est_End_Dt) >= @fromDate AND CONVERT(DATE, td.Est_End_Dt) <= @toDate)
                        OR (CONVERT(DATE, td.Est_Start_Dt) <= @fromDate AND CONVERT(DATE, td.Est_End_Dt) >= @toDate)
                  )
                ORDER BY TRY_CONVERT(TIME, td.Sch_Time) ASC
                FOR JSON PATH
            ), '[]') AS AssignedTasks

        FROM tbl_Users AS u
        LEFT JOIN tbl_User_Type AS ut ON ut.Id = u.UserTypeId
        LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = u.BranchId
        WHERE u.UserId = @user;
        `;

            const request = new sql.Request();
            request.input('user', UserId);
            request.input('fromDate', fromDate);
            request.input('toDate', toDate);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const levelOneParsed = result.recordset.map(o => ({
                    ...o,
                    Projects: JSON.parse(o.Projects),
                    AssignedTasks: JSON.parse(o.AssignedTasks),
                    WorkDetails: o?.WorkDetails ? JSON.parse(o?.WorkDetails) : []
                }));

                const levelTwoParsed = levelOneParsed.map(o => ({
                    ...o,
                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: JSON.parse(ao?.Work_Details),
                        Task_Param: JSON.parse(ao?.Task_Param)
                    })),
                    WorkDetails: Array.isArray(o?.WorkDetails) ? o?.WorkDetails.map(wo => ({
                        ...wo,
                        Parameter_Details: JSON.parse(wo?.Parameter_Details)
                    })) : []
                }));

                const levelThreeParsed = levelTwoParsed.map(o => ({
                    ...o,
                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: ao?.Work_Details?.map(wo => ({
                            ...wo,
                            Parameter_Details: JSON.parse(wo?.Parameter_Details)
                        }))
                    }))
                }));

                dataFound(res, levelThreeParsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const getERPDashboardData = async (req, res) => {
        const { Fromdate, Company_Id } = req.query;

        if (!Fromdate || !checkIsNumber(Company_Id)) {
            return invalidInput(res, 'Fromdate, Company_Id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Fromdate', Fromdate);
            request.input('Company_Id', Company_Id);

            const result = await request.execute('Dashboard_Online_Report_VW');

            if (result.recordsets) {
                dataFound(res, result.recordsets)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const getSalesInfo = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);

        try {
            const result = await SPCall({
                SPName: 'Dash_Board_Live_Sales', spParamerters: {
                    Fromdate, Todate
                }, spTransaction: req.db
            });

            if (result && result?.recordset?.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            console.error(e);
        }
    }

    const getPurchaseInfo = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);

        try {
            const result = await SPCall({
                SPName: 'Day_List_Purchase', spParamerters: {
                    Fromdate, Todate, Company_Id: Company ?? 1,
                }, spTransaction: req.db
            });

            dataFound(res, result?.recordsets ?? []);
        } catch (e) {
            servError(e, res);
        }
    }

    const getPurchaseMoreInfo = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);

        try {
            const result = await SPCall({
                SPName: 'Day_List_Purchase_List', spParamerters: {
                    Fromdate, Todate, Company_Id: Company ?? 1,
                }, spTransaction: req.db
            });

            dataFound(res, result?.recordset || []);
        } catch (e) {
            servError(e, res);
        }
    }

    const getnewEmployeeAbstract = async (req, res) => {
        const { UserId } = req.query;

        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required')
        }

        try {
            const query = `
            SELECT 
            	u.UserId,
            	u.Name,
            	u.UserTypeId,
            	ut.UserType,
            	u.BranchId,
            	b.BranchName,

            	        	COALESCE((
            	SELECT 
    DISTINCT td.Project_Id,
    p.Project_Name
FROM
    tbl_Project_Employee AS td
LEFT JOIN 
    tbl_Project_Master AS p
    ON p.Project_Id = td.Project_Id
    WHERE
    td.User_Id = @user
            		FOR JSON PATH
            	), '[]') AS Projects,

            	COALESCE((
            		SELECT 
            			td.Task_Id,
            			t.Task_Name,
                        t.Task_Desc,
            			td.AN_No,
            			CONVERT(DATE, td.Est_Start_Dt) AS Est_Start_Dt,
            			CONVERT(DATE, td.Est_End_Dt) AS Est_End_Dt,
            			td.Sch_Time,
            			td.EN_Time,
            			td.Sch_Period,
            			td.Timer_Based,

                        COALESCE((
							SELECT 
								tpd.*,
								tpdtpm.Paramet_Name,
								tpdtpm.Paramet_Data_Type
							FROM
								tbl_Task_Paramet_DT AS tpd
								LEFT JOIN tbl_Paramet_Master AS tpdtpm
								ON tpdtpm.Paramet_Id = tpd.Param_Id
							WHERE
								tpd.Task_Id = td.Task_Id
							FOR JSON PATH
						), '[]') AS Task_Param,

            			COALESCE((
            				SELECT
            					wk.Work_Id,
            					wk.Work_Dt,
            					wk.Work_Done,
            					wk.Start_Time,
            					wk.End_Time,
            					wk.Tot_Minutes,
            					wk.Work_Status,
            					s.Status AS StatusGet,

								COALESCE((
            						SELECT 
            							wp.Current_Value,
            							wp.Default_Value,
            							wp.Param_Id,
            							pm.Paramet_Name,
										pm.Paramet_Data_Type
            						FROM
            							tbl_Work_Paramet_DT as wp
            							LEFT JOIN tbl_Paramet_Master AS pm
            							ON pm.Paramet_Id = wp.Param_Id
            						WHERE 
            							wp.Work_Id = wk.Work_Id
            						FOR JSON PATH
								), '[]') AS Parameter_Details

            				FROM
            					tbl_Work_Master AS wk
            					LEFT JOIN tbl_Status AS s
            					ON s.Status_Id = wk.Work_Status
            				WHERE
            					wk.AN_No = td.AN_No
            				FOR JSON PATH
            			), '[]') AS Work_Details
                    
            		FROM
            			tbl_Task_Details AS td
            			LEFT JOIN tbl_Task AS t
            			ON td.Task_Id = t.Task_Id
            		WHERE
            			td.Emp_Id = u.UserId
            		FOR JSON PATH
            	), '[]') AS AssignedTasks
            
            FROM
            	tbl_Users AS u
            	LEFT JOIN tbl_User_Type AS ut ON ut.Id = u.UserTypeId
            	LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = u.BranchId
            WHERE
            	u.UserId = @user
            `;

            const request = new sql.Request()
            request.input('user', UserId)

            const result = await request.query(query);

            if (result.recordset.length > 0) {

                const levelOneParsed = result.recordset.map(o => ({
                    ...o,
                    Projects: JSON.parse(o.Projects),
                    AssignedTasks: JSON.parse(o.AssignedTasks),
                    WorkDetails: o?.WorkDetails ? JSON.parse(o?.WorkDetails) : []
                }))

                const levelTwoParsed = levelOneParsed.map(o => ({
                    ...o,

                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: JSON.parse(ao?.Work_Details),
                        Task_Param: JSON.parse(ao?.Task_Param)
                    })),

                    WorkDetails: Array.isArray(o?.WorkDetails) ? o?.WorkDetails?.map(wo => ({
                        ...wo,
                        Parameter_Details: JSON.parse(wo?.Parameter_Details)
                    })) : []

                }))

                const levelThreeParsed = levelTwoParsed.map(o => ({
                    ...o,

                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: ao?.Work_Details?.map(wo => ({
                            ...wo,
                            Parameter_Details: JSON.parse(wo?.Parameter_Details)
                        }))
                    }))
                }))

                dataFound(res, levelThreeParsed)

            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const usergetnewEmployeeAbstract = async (req, res) => {
        const { UserId } = req.query;

        // Validate the UserId
        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required');
        }

        try {
            const query = `
               SELECT 
                p.Project_Id,
                p.Project_Name,
                p.Project_Desc,
                p.Project_Head,
                CONVERT(DATE, p.Est_Start_Dt) AS ProjectStartDate,
                CONVERT(DATE, p.Est_End_Dt) AS ProjectEndDate,
                s.Status AS ProjectStatus,
                u.Name AS HeadName,
                -- Employee involvement from Project_Employee table
                (
                    SELECT 
                        pe.User_Id,
                        e.Name AS EmployeeName,
                        e.UserTypeId,
                        ut.UserType
                    FROM 
                        tbl_Project_Employee AS pe
                    LEFT JOIN 
                        tbl_Users AS e ON e.UserId = pe.User_Id
                    LEFT JOIN 
                        tbl_User_Type AS ut ON ut.Id = e.UserTypeId
                    WHERE 
                        pe.Project_Id = p.Project_Id
                    FOR JSON PATH
                ) AS EmployeeInvolvement,
                -- Task count for the employee in the project
                (SELECT COUNT(*)
                    FROM tbl_Task_Details AS td
                    LEFT JOIN tbl_Task AS t ON td.Task_Id = t.Task_Id
                    WHERE td.Emp_Id = @user
                    AND td.Project_Id = p.Project_Id
                ) AS TaskCount,
                -- Task details assigned to the employee
                COALESCE(( 
                    SELECT 
                        td.Task_Id,
                        t.Task_Name,
                        t.Task_Desc,
                        td.AN_No,
                        CONVERT(DATE, td.Est_Start_Dt) AS Est_Start_Dt,
                        CONVERT(DATE, td.Est_End_Dt) AS Est_End_Dt,
                        td.Sch_Time,
                        td.EN_Time,
                        td.Sch_Period,
                        td.Timer_Based,
                        COALESCE((
                            SELECT 
                                tpd.*,
                                tpdtpm.Paramet_Name,
                                tpdtpm.Paramet_Data_Type
                            FROM
                                tbl_Task_Paramet_DT AS tpd
                            LEFT JOIN 
                                tbl_Paramet_Master AS tpdtpm ON tpdtpm.Paramet_Id = tpd.Param_Id
                            WHERE
                                tpd.Task_Id = td.Task_Id
                            FOR JSON PATH
                        ), '[]') AS Task_Param,
                        COALESCE((
                            SELECT
                                wk.Work_Id,
                                wk.Work_Dt,
                                wk.Work_Done,
                                wk.Start_Time,
                                wk.End_Time,
                                wk.Tot_Minutes,
                                wk.Work_Status,
                                s.Status AS StatusGet,
                                COALESCE((
                                    SELECT 
                                        wp.Current_Value,
                                        wp.Default_Value,
                                        wp.Param_Id,
                                        pm.Paramet_Name,
                                        pm.Paramet_Data_Type
                                    FROM
                                        tbl_Work_Paramet_DT AS wp
                                    LEFT JOIN 
                                        tbl_Paramet_Master AS pm ON pm.Paramet_Id = wp.Param_Id
                                    WHERE 
                                        wp.Work_Id = wk.Work_Id
                                    FOR JSON PATH
                                ), '[]') AS Parameter_Details
                            FROM
                                tbl_Work_Master AS wk
                            LEFT JOIN 
                                tbl_Status AS s ON s.Status_Id = wk.Work_Status
                            WHERE
                                wk.AN_No = td.AN_No AND wk.Emp_Id = @user -- Work details for the employee with UserId 85
                            FOR JSON PATH
                        ), '[]') AS Work_Details
                    FROM
                        tbl_Task_Details AS td
                    LEFT JOIN 
                        tbl_Task AS t ON td.Task_Id = t.Task_Id
                    WHERE
                        td.Emp_Id = @user -- Employee ID (replace 85 with the actual employee ID)
                        AND td.Project_Id = p.Project_Id
                    FOR JSON PATH
                ), '[]') AS Tasks  -- Tasks assigned to the employee
            FROM
                tbl_Project_Master AS p
            LEFT JOIN 
                tbl_Status AS s ON s.Status_Id = p.Project_Status
            LEFT JOIN 
                tbl_Users AS u ON u.UserId = p.Project_Head
            WHERE
                p.Project_Id IN (
                    SELECT td.Project_Id
                    FROM tbl_Project_Employee td
                    WHERE td.User_Id = @user -- Replace with the actual employee ID
                )`;

            const request = new sql.Request();
            request.input('user', UserId);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                // Function to safely parse JSON if exists
                const safeParse = (data) => {
                    try {
                        return JSON.parse(data);
                    } catch (error) {
                        return [];
                    }
                };

                // Level 1 parsing
                const levelOneParsed = result.recordset.map(o => ({
                    ...o,
                    Projects: safeParse(o.Projects),
                    AssignedTasks: safeParse(o.AssignedTasks),
                    WorkDetails: safeParse(o.WorkDetails)
                }));

                // Level 2 parsing
                const levelTwoParsed = levelOneParsed.map(o => ({
                    ...o,
                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: safeParse(ao?.Work_Details),
                        Task_Param: safeParse(ao?.Task_Param)
                    })),
                    WorkDetails: Array.isArray(o?.WorkDetails) ? o?.WorkDetails?.map(wo => ({
                        ...wo,
                        Parameter_Details: safeParse(wo?.Parameter_Details)
                    })) : []
                }));

                // Level 3 parsing
                const levelThreeParsed = levelTwoParsed.map(o => ({
                    ...o,
                    AssignedTasks: o?.AssignedTasks?.map(ao => ({
                        ...ao,
                        Work_Details: ao?.Work_Details?.map(wo => ({
                            ...wo,
                            Parameter_Details: safeParse(wo?.Parameter_Details)
                        }))
                    }))
                }));

                dataFound(res, levelThreeParsed);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const getDayBookOfERP = async (req, res) => {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        try {
            const erpModuleRequest = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH ERP_VOUCHERS AS (
                        SELECT * 
                        FROM tbl_Voucher_Type
                    ), PURCHASE_ORDER_DETAILS AS (
                    	SELECT 
                    		SUM(Weight * Rate) AS OrderAmount,
                    		OrderId
                    	FROM tbl_PurchaseOrderItemDetails
                    	WHERE OrderId IN (
                    		SELECT Sno
                    		FROM tbl_PurchaseOrderGeneralDetails
                    		WHERE TradeConfirmDate BETWEEN @Fromdate AND @Todate
                    	) 
                    	GROUP BY OrderId
                    ), PURCHASE_ORDER AS (
                    	SELECT
                    		COUNT(po.Sno) AS VoucherBreakUpCount,
                    		'ERP_Voucher' AS Voucher_Type,
                    		'PurchaseOrder' AS ModuleName,
                    		SUM(pod.OrderAmount) AS Amount,
                            '/erp/purchase/purchaseOrder' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_PurchaseOrderGeneralDetails AS po
                    	LEFT JOIN PURCHASE_ORDER_DETAILS AS pod
                    	ON pod.OrderId = po.Sno
                    	WHERE 
                    		po.TradeConfirmDate BETWEEN @Fromdate AND @Todate
                    		AND po.OrderStatus <> 'Canceled'
                    ), PURCHASE_INVOICE AS (
                    	SELECT 
                    		COUNT(P.PIN_Id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'PurchaseInvoice' AS ModuleName,
                    		SUM(P.Total_Invoice_value) AS Amount,
                            '/erp/purchase/invoice' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Purchase_Order_Inv_Gen_Info AS P
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  P.Voucher_Type
                    	WHERE 
                    		P.Po_Entry_Date BETWEEN @Fromdate AND @Todate
                    		AND P.Cancel_status = 0
                    	GROUP BY V.Voucher_Type
                    ), SALE_ORDER AS (
                    	SELECT 
                    		COUNT(S.So_Id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'SaleOrder' AS ModuleName,
                    		ISNULL(SUM(Total_Invoice_value), 0) AS Amount,
                            '/erp/sales/saleOrder' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Sales_Order_Gen_Info AS S
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  S.VoucherType
                    	WHERE 
                    		S.So_Date BETWEEN @Fromdate AND @Todate
                    		AND S.Cancel_status = 0
                    	GROUP BY V.Voucher_Type
                    ), SALES_INVOICE AS (
                    	SELECT 
                    		COUNT(S.Do_Id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'SalesInvoice' AS ModuleName,
                    		ISNULL(SUM(Total_Invoice_value), 0) AS Amount,
                            '/erp/sales/salesInvoice' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Sales_Delivery_Gen_Info AS S
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  S.Voucher_Type
                    	WHERE S.Do_Date BETWEEN @Fromdate AND @Todate
                    	AND S.Cancel_status <> 0
                    	GROUP BY V.Voucher_Type
                    ), RECEIPT AS (
                    	SELECT 
                    		COUNT(R.receipt_id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'Receipt' AS ModuleName,
                    		ISNULL(SUM(R.credit_amount), 0) AS Amount,
                            '/erp/receipts/listReceipts' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Receipt_General_Info AS R
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  R.receipt_voucher_type_id
                    	WHERE 
                    		R.receipt_date BETWEEN @Fromdate AND @Todate
                    		AND R.status <> 0
                    	GROUP BY V.Voucher_Type
                    ), PAYMENT AS (
                    	SELECT 
                    		COUNT(P.pay_id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'Payment' AS ModuleName,
                    		ISNULL(SUM(P.debit_amount), 0) AS Amount,
                            '/erp/payments/paymentList' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Payment_General_Info AS P
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  P.payment_voucher_type_id
                    	WHERE 
                    		P.payment_date BETWEEN @Fromdate AND @Todate
                    		AND P.status <> 0
                    	GROUP BY V.Voucher_Type
                    ), STOCK_JOURNAL AS (
                    	SELECT 
                    		COUNT(TM.Trip_Id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'StockJournal' AS ModuleName,
                    		0 AS Amount,
                            '/erp/inventory/tripSheet' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Trip_Master AS TM
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  TM.VoucherType
                    	WHERE 
                    		TM.Trip_Date BETWEEN @Fromdate AND @Todate
                    		AND TM.TripStatus <> 'Canceled'
                    	GROUP BY V.Voucher_Type
                    ), PROCESSING_STOCK_JOURNAL AS (
                    	SELECT 
                    		COUNT(P.PR_Id) AS VoucherBreakUpCount,
                    		V.Voucher_Type AS Voucher_Type,
                    		'StockJournal' AS ModuleName,
                    		0 AS Amount,
                            '/erp/inventory/stockProcessing' AS navLink,
                    		'ERP' AS dataSource
                    	FROM tbl_Processing_Gen_Info AS P
                    	LEFT JOIN ERP_VOUCHERS AS V
                    	ON V.Vocher_Type_Id =  P.VoucherType
                    	WHERE 
                    		P.Process_date BETWEEN @Fromdate AND @Todate
                    		AND P.PR_Status <> 'Canceled'
                    	GROUP BY V.Voucher_Type
                    )
                    SELECT * FROM PURCHASE_ORDER
                    UNION ALL 
                    SELECT * FROM PURCHASE_INVOICE
                    UNION ALL
                    SELECT * FROM SALE_ORDER
                    UNION ALL
                    SELECT * FROM SALES_INVOICE
                    UNION ALL
                    SELECT * FROM RECEIPT
                    UNION ALL
                    SELECT * FROM PAYMENT
                    UNION ALL 
                    SELECT * FROM STOCK_JOURNAL
                    UNION ALL
                    SELECT * FROM PROCESSING_STOCK_JOURNAL;`
                );

            const tallyModuleRequest = new sql.Request(req.db)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH VoucherType AS (
                    	SELECT 
                    		tally_id AS VoucherTypeId,
                    		voucher_name AS Voucher
                    	FROM voucher_type_ob
                    ), PURCHASE_ORDER AS (
                    	SELECT
                    		COUNT(po.po_id) AS VoucherBreakUpCount,
                    		v.Voucher AS Voucher_Type,
                    		'PurchaseOrder' AS ModuleName,
                    		SUM(po.total_invoice_value) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                    	FROM purchase_order_geninfo_ob AS po
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = po.purchase_voucher_type_id
                    	WHERE 
                    		po.po_date BETWEEN @Fromdate AND @Todate
                    		AND po.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), PURCHASE_INVOICE AS (
                    	SELECT
                    		COUNT(pui.pur_id) AS VoucherBreakUpCount,
                    		v.Voucher AS Voucher_Type,
                    		'PurchaseInvoice' AS ModuleName,
                    		SUM(pui.total_invoice_value) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                    	FROM purchase_inv_geninfo_ob AS pui
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = pui.purchase_voucher_type_id
                    	WHERE 
                    		pui.invoice_date BETWEEN @Fromdate AND @Todate
                    		AND pui.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), SALE_ORDER AS (
                    	SELECT
                    		COUNT(so.so_id) AS VoucherBreakUpCount,
                    		v.Voucher AS Voucher_Type,
                    		'SaleOrder' AS ModuleName,
                    		SUM(so.total_invoice_value) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                    	FROM sales_order_geninfo_ob AS so
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = so.sales_voucher_type_id
                    	WHERE 
                    		so.so_date BETWEEN @Fromdate AND @Todate
                    		AND so.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), SALES_INVOICE AS (
                    	SELECT 
                        	COUNT(s.tally_id) AS VoucherBreakUpCount,
                        	Voucher AS Voucher_Type,
                        	'SalesInvoice' AS ModuleName,
                            SUM(total_invoice_value) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM sales_inv_geninfo_ob AS s
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = s.sales_voucher_type_id
                        WHERE 
                    		s.invoice_date BETWEEN @Fromdate AND @Todate
                    		AND s.cancel_status = 'No'
                        GROUP BY Voucher
                    ), PAYMENT AS (
                    	SELECT 
                        	COUNT(distinct p.tally_id) AS VoucherBreakUpCount,
                        	v.Voucher AS Voucher_Type,
                        	'Payment' AS ModuleName,
                            SUM(p.debit_amount) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM payment_geninfo_ob AS p
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = p.payment_type_id
                        WHERE 
                    		p.payment_date BETWEEN @Fromdate AND @Todate
                    		AND p.credit_amount = 0
                    		AND p.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), RECEIPT AS (
                    	SELECT 
                        	COUNT(distinct r.tally_id) AS VoucherBreakUpCount,
                        	v.Voucher AS Voucher_Type,
                        	'Receipt' AS ModuleName,
                            SUM(r.debit_amount) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM receipt_geninfo_ob AS r
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = r.rcpt_type_id
                        WHERE 
                    		r.receipt_date BETWEEN @Fromdate AND @Todate
                    		AND r.credit_amount = 0
                    		AND r.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), JOURNAL AS (
                    	SELECT 
                        	COUNT(distinct j.tally_id) AS VoucherBreakUpCount,
                        	v.Voucher AS Voucher_Type,
                        	'Journal' AS ModuleName,
                            SUM(j.debit_amount) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM journal_geninfo_ob AS j
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = j.journal_type_id
                        WHERE 
                    		j.journal_date BETWEEN @Fromdate AND @Todate
                    		AND j.credit_amount = 0
                    		AND j.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), STOCK_JOURNAL AS (
                    	SELECT 
                        	COUNT(sj.stock_jou_id) AS VoucherBreakUpCount,
                        	v.Voucher AS Voucher_Type,
                        	'StockJournal' AS ModuleName,
                            0 AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM stock_journal_geninfo_ob AS sj
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = sj.stock_journal_type_id
                        WHERE 
                    		sj.stock_journal_date BETWEEN @Fromdate AND @Todate
                    		AND sj.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    ), CONTRA AS (
                    	SELECT 
                        	COUNT(distinct c.tally_id) AS VoucherBreakUpCount,
                        	v.Voucher AS Voucher_Type,
                        	'Contra' AS ModuleName,
                            SUM(c.debit_amount) AS Amount,
                            '/erp/dayBook/details' AS navLink,
                    		'TALLY' AS dataSource
                        FROM contra_geninfo_ob AS c
                        LEFT JOIN VoucherType AS v
                        ON v.VoucherTypeId = c.contra_type_id
                        WHERE 
                    		c.contra_date BETWEEN @Fromdate AND @Todate
                    		AND c.credit_amount = 0
                    		AND c.cancel_status = 'No'
                    	GROUP BY v.Voucher
                    )
                    SELECT * FROM PURCHASE_ORDER
                    UNION ALL
                    SELECT * FROM PURCHASE_INVOICE
                    UNION ALL
                    SELECT * FROM SALE_ORDER
                    UNION ALL
                    SELECT * FROM SALES_INVOICE
                    UNION ALL
                    SELECT * FROM PAYMENT
                    UNION ALL 
                    SELECT * FROM RECEIPT
                    UNION ALL
                    SELECT * FROM JOURNAL
                    UNION ALL
                    SELECT * FROM STOCK_JOURNAL
                    UNION ALL
                    SELECT * FROM CONTRA;`
                );

            const ERP_Modules = await erpModuleRequest;
            const Tally_Modults = await tallyModuleRequest;
            const moduleSortList = ['PurchaseOrder', 'PurchaseInvoice', 'SaleOrder', 'SalesInvoice', 'Payment', 'Receipt', 'Journal', 'StockJournal', 'Contra'];
            const mergedArray = [...ERP_Modules.recordset, ...Tally_Modults.recordset];
            const knownModules = mergedArray.filter(m => moduleSortList.includes(m.ModuleName));
            const unknownModules = mergedArray.filter(m => !moduleSortList.includes(m.ModuleName));

            const sortedArray = [...knownModules.sort((a, b) =>
                moduleSortList.indexOf(a.ModuleName) - moduleSortList.indexOf(b.ModuleName)
            ), ...unknownModules];

            const dataGrouping = groupData(sortedArray, 'ModuleName');

            sentData(res, dataGrouping);
        } catch (e) {
            servError(e, res);
        }
    }

    const getLastSyncedTime = async (req, res) => {
        try {
            const request = new sql.Request(req.db)
                .query(`
                    SELECT Last_Sync_Date_Time FROM tbl_Sync_Time;
                    SELECT MAX(created_On) AS lastSalesSync 
                    FROM sales_inv_geninfo_ob;
                `);

            const result = await request;

            const timeResponse = [{
                Last_Sync_Date_Time: result.recordsets[0][0]?.Last_Sync_Date_Time,
                lastSalesSync: result.recordsets[1][0]?.lastSalesSync
            }]

            sentData(res, timeResponse)
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getDashboardData,
        getTallyWorkDetails,
        getEmployeeAbstract,
        getERPDashboardData,
        getSalesInfo,
        getPurchaseInfo,
        getPurchaseMoreInfo,
        getnewEmployeeAbstract,
        usergetnewEmployeeAbstract,
        getDayBookOfERP,
        getLastSyncedTime
    }
}

export default DashboardController()