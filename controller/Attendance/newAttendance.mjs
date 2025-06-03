import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, success, failed } from '../../res.mjs';
import { checkIsNumber, ISOString } from '../../helper_functions.mjs';
import { getUserType } from '../../middleware/miniAPIs.mjs';
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import getImageIfExist from '../../middleware/getImageIfExist.mjs';
import fileRemoverMiddleware from '../../middleware/unSyncFile.mjs';

const newAttendance = () => {
    const toArr = (arr) => Array.isArray(arr) ? arr : []

    const addAttendance = async (req, res) => {

        try {
            await uploadFile(req, res, 2, 'Start_KM_Pic');

            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;

            const { UserId, Start_KM, Latitude, Longitude } = req.body;

            if (!checkIsNumber(UserId)) {
                return invalidInput(res, 'UserId is required');
            }

            const isSalesPerson = (await getUserType(UserId)) == 6 ? 1 : 0;

            const request = new sql.Request()
                .input('user', UserId)
                .input('date', new Date())
                .input('startkm', Start_KM)
                .input('latitude', Latitude)
                .input('longitude', Longitude)
                .input('imgname', fileName)
                .input('imgpath', filePath)
                .input('salesPerson', isSalesPerson)
                .input('status', 1)
                .query(`
                    INSERT INTO tbl_Attendance 
                        (UserId, Start_Date, Start_KM, Latitude, Longitude, Start_KM_ImageName, Start_KM_ImagePath, IsSalesPerson, Active_Status)
                    VALUES 
                        (@user, @date, @startkm, @latitude, @longitude, @imgname, @imgpath, @salesPerson, @status)`)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Attendance Noted!')
            } else {
                failed(res, 'Failed to Add Attendance')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getMyLastAttendance = async (req, res) => {
        const { UserId } = req.query;

        if (!checkIsNumber(UserId)) {
            return invalidInput(res, 'UserId is required')
        }

        try {
            const request = new sql.Request()
                .input('user', UserId)
                .query(`
                    SELECT 
                        TOP (1) * 
                    FROM 
                        tbl_Attendance 
                    WHERE 
                        UserId = @user
                    ORDER BY Start_Date DESC; `);

            const result = await request;

            if (result.recordset.length > 0) {
                const withImg = result.recordset.map(o => ({
                    ...o,
                    startKmImageUrl: getImageIfExist('attendance', o?.Start_KM_ImageName),
                    endKmImageUrl: getImageIfExist('attendance', o?.End_KM_ImageName)
                }));
                dataFound(res, withImg)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const closeAttendance = async (req, res) => {

        try {
            await uploadFile(req, res, 2, 'End_KM_Pic');

            const fileName = req?.file?.filename;
            const filePath = req?.file?.path;

            const { Id, End_KM, Description } = req.body;

            if (!checkIsNumber(Id)) {
                if (filePath) {
                    await fileRemoverMiddleware(filePath);
                }
                return invalidInput(res, 'Id is required')
            }

            const request = new sql.Request()
                .input('enddate', new Date())
                .input('endkm', End_KM ?? null)
                .input('imgname', fileName ?? null)
                .input('imgpath', filePath ?? null)
                .input('Description', Description ?? null)
                .input('status', 0)
                .input('id', Id)
                .query(`
                    UPDATE 
                        tbl_Attendance 
                    SET
                        End_Date = @enddate,
                        End_KM = @endkm,
                        End_KM_ImageName = @imgname,
                        End_KM_ImagePath = @imgpath,
                        WorkSummary = @Description,
                        Active_Status = @status
                    WHERE
                        Id = @id`)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Attendance Closed')
            } else {
                failed(res, 'Failed to Close Attendance')
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getAttendanceHistory = async (req, res) => {
        const { From, To, UserId, UserTypeID } = req.query;

        if (!From || !To || !checkIsNumber(UserTypeID)) {
            return invalidInput(res, 'From, To, UserTypeID is required')
        }

        const isSalesPerson = Number(UserTypeID) === 6

        try {
            let query = `
            SELECT
            	a.*,
            	u.Name AS User_Name
            FROM
            	tbl_Attendance AS a
            	LEFT JOIN tbl_Users AS u
            	ON u.UserId = a.UserId
            WHERE
            	CONVERT(DATE, a.Start_Date) >= CONVERT(DATE, @from)
            	AND
            	CONVERT(DATE, a.Start_Date) <= CONVERT(DATE, @to)`;

            if (Number(UserId)) {
                query += `
                AND
                a.UserId = @userid`;
            }

            if (UserTypeID == 3 || UserTypeID == 6) {
                query += `
                AND
                a.IsSalesPerson = @isSalesPerson`;
            }

            query += `
            ORDER BY CONVERT(DATETIME, a.Start_Date), a.UserId`

            const request = new sql.Request()
                .input('from', From)
                .input('to', To)
                .input('userid', UserId)
                .input('isSalesPerson', isSalesPerson)
                .query(query)

            const result = await request;

            if (result.recordset.length > 0) {
                const withImg = result.recordset.map(o => ({
                    ...o,
                    startKmImageUrl: getImageIfExist('attendance', o?.Start_KM_ImageName),
                    endKmImageUrl: getImageIfExist('attendance', o?.End_KM_ImageName)
                }));
                dataFound(res, withImg)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getDepartment = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                  
                    SELECT DISTINCT Department AS value, Department AS label
                    FROM tbl_Employee_Master
                     
                    
                    `
                );

            const result = await request;

            dataFound(res, [], 'data found', {
                department: toArr(result.recordsets[0])
            });
        } catch (e) {
            servError(e, res);
        }
    }

    const employeewise = async (req, res) => {
        const FromDate = req.query?.FromDate
            ? ISOString(req.query?.FromDate)
            : ISOString();
        const ToDate = req.query?.ToDate
            ? ISOString(req.query?.ToDate)
            : ISOString();

        try {

            if (!FromDate || !ToDate) {
                return invalidInput(res, "FromDate and ToDate are required");
            }

            const request = new sql.Request();
            request.input("FromDate", sql.DateTime, FromDate);
            request.input("ToDate", sql.DateTime, ToDate);

            let query = `
                    WITH RankedLogs AS (
                        SELECT 
                            em.User_Mgt_Id,          
                            u.Name AS username,
                            ISNULL(NULLIF(em.Department, ''), 'Unassigned') AS Department,
                            em.Sex,
                            pd.EmployeeCode,        
                            al.AttendanceDate AS LogDateTime,           
                            CAST(al.AttendanceDate AS DATE) AS LogDate
                        FROM 
                            tbl_Employee_Master em
                        LEFT JOIN 
                            tbl_Users u ON u.UserId = em.User_Mgt_Id
                        LEFT JOIN 
                            etimetracklite1.dbo.Employees pd 
                            ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                        LEFT JOIN 
                            etimetracklite1.dbo.AttendanceLogs al 
                            ON al.EmployeeId = pd.EmployeeId 
                        WHERE 
                            CAST(al.AttendanceDate AS DATE) BETWEEN @FromDate AND @ToDate
                            AND CAST(al.PunchRecords AS NVARCHAR(MAX)) IS NOT NULL  
                            AND LTRIM(RTRIM(CAST(al.PunchRecords AS NVARCHAR(MAX)))) <> ''
                    ), EmployeeCounts AS (
                        SELECT
                            SUM(CASE WHEN Sex = 'Male' THEN 1 ELSE 0 END) AS TotalMaleEmployees,
                            SUM(CASE WHEN Sex = 'Female' THEN 1 ELSE 0 END) AS TotalFemaleEmployees,
                            COUNT(*) AS TotalEmployees
                        FROM
                            tbl_Employee_Master
                    ), PresentCounts AS (
                        SELECT
                            COUNT(DISTINCT ISNULL(NULLIF(Department, ''), 'Unassigned')) AS TotalDepartmentsPresentToday,
                            SUM(CASE WHEN Sex = 'Male' THEN 1 ELSE 0 END) AS TotalMalePresentToday,
                            SUM(CASE WHEN Sex = 'Female' THEN 1 ELSE 0 END) AS TotalFemalePresentToday,
                            COUNT(DISTINCT User_Mgt_Id) AS TotalPresentToday
                        FROM
                            RankedLogs
                    ), DepartmentList AS (
                        SELECT
                            (
                                SELECT COUNT(DISTINCT ISNULL(NULLIF(Department, ''), 'Unassigned')) AS DepartmentCount
                                FROM tbl_Employee_Master
                                FOR JSON PATH
                            ) AS DepartmentsPresentToday
                    ), TotalDepartmentList AS (
                        SELECT 
                            COUNT(DISTINCT ISNULL(NULLIF(Department, ''), 'Unassigned')) AS TotalDepartments
                        FROM 
                            tbl_Employee_Master
                    ), DepartmentDetails AS (
                        SELECT
                            ISNULL(NULLIF(Department, ''), 'Unassigned') AS Department,
                            SUM(CASE WHEN Sex = 'Male' THEN 1 ELSE 0 END) AS TotalMaleEmployees,
                            SUM(CASE WHEN Sex = 'Female' THEN 1 ELSE 0 END) AS TotalFemaleEmployees,
                            COUNT(*) AS TotalEmployees
                        FROM
                            tbl_Employee_Master
                        GROUP BY
                            ISNULL(NULLIF(Department, ''), 'Unassigned')
                    ), DepartmentPresentCounts AS (
                        SELECT
                            ISNULL(NULLIF(Department, ''), 'Unassigned') AS Department,
                            SUM(CASE WHEN Sex = 'Male' THEN 1 ELSE 0 END) AS TotalMalePresentToday,
                            SUM(CASE WHEN Sex = 'Female' THEN 1 ELSE 0 END) AS TotalFemalePresentToday,
                            COUNT(DISTINCT User_Mgt_Id) AS TotalPresentToday
                        FROM
                            RankedLogs
                        GROUP BY
                            ISNULL(NULLIF(Department, ''), 'Unassigned')
                    ), DepartmentEmployeeDetails AS (
                        SELECT
                            ISNULL(NULLIF(Department, ''), 'Unassigned') AS Department,
                            (
                                SELECT
                                    em_inner.Emp_Name,
                                    em_inner.Sex,
                                    em_inner.Designation
                                FROM
                                    tbl_Employee_Master em_inner
                                WHERE
                                    ISNULL(NULLIF(em_inner.Department, ''), 'Unassigned') = ISNULL(NULLIF(em.Department, ''), 'Unassigned')
                                FOR JSON PATH
                            ) AS Employees
                        FROM
                            tbl_Employee_Master em
                        GROUP BY
                            ISNULL(NULLIF(Department, ''), 'Unassigned')
                    ), DepartmentWiseStats AS (
                        SELECT
                            dd.Department,
                            dd.TotalMaleEmployees,
                            dd.TotalFemaleEmployees,
                            dd.TotalEmployees,
                            ISNULL(dpc.TotalMalePresentToday, 0) AS TotalMalePresentToday,
                            ISNULL(dpc.TotalFemalePresentToday, 0) AS TotalFemalePresentToday,
                            ISNULL(dpc.TotalPresentToday, 0) AS TotalPresentToday,
                            ded.Employees
                        FROM
                            DepartmentDetails dd
                        LEFT JOIN
                            DepartmentPresentCounts dpc ON dd.Department = dpc.Department
                        LEFT JOIN
                            DepartmentEmployeeDetails ded ON dd.Department = ded.Department
                    ), FinalData AS (
                        SELECT 
                            em.User_Mgt_Id,
                            ISNULL(NULLIF(em.Department, ''), 'Unassigned') AS Department,
                            u.Name AS username,
                            CAST(al.AttendanceDate AS DATE) AS LogDate,
                            DATENAME(MONTH, al.AttendanceDate) AS MonthName,
                            MONTH(al.AttendanceDate) AS MonthNumber,
                            YEAR(al.AttendanceDate) AS YearNumber
                        FROM 
                            tbl_Employee_Master em
                        LEFT JOIN 
                            tbl_Users u ON u.UserId = em.User_Mgt_Id
                        LEFT JOIN 
                            etimetracklite1.dbo.Employees pd ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                        LEFT JOIN 
                            etimetracklite1.dbo.AttendanceLogs al ON al.EmployeeId = pd.EmployeeId
                        WHERE
                            YEAR(al.AttendanceDate) = YEAR(@FromDate)
                            AND CAST(al.PunchRecords AS NVARCHAR(MAX)) IS NOT NULL  
                            AND LTRIM(RTRIM(CAST(al.PunchRecords AS NVARCHAR(MAX)))) <> ''
                    ), MonthlyData AS (
                        SELECT 
                            Department,
                            MonthName,
                            MonthNumber,
                            YearNumber,
                            COUNT(DISTINCT User_Mgt_Id) AS UniqueEmployeeDays
                        FROM 
                            FinalData
                        GROUP BY
                            Department,
                            MonthName,
                            MonthNumber,
                            YearNumber
                    ), AllMonths AS (
                        SELECT 1 AS MonthNumber, 'January' AS MonthName UNION ALL
                        SELECT 2, 'February' UNION ALL
                        SELECT 3, 'March' UNION ALL
                        SELECT 4, 'April' UNION ALL
                        SELECT 5, 'May' UNION ALL
                        SELECT 6, 'June' UNION ALL
                        SELECT 7, 'July' UNION ALL
                        SELECT 8, 'August' UNION ALL
                        SELECT 9, 'September' UNION ALL
                        SELECT 10, 'October' UNION ALL
                        SELECT 11, 'November' UNION ALL
                        SELECT 12, 'December'
                    ), MonthlyAverageAttendance AS (
                        SELECT
                            d.Department,
                            (
                                SELECT
                                    am.MonthName,
                                    am.MonthNumber,
                                     y.YearNumber, 
                                    ISNULL(md.UniqueEmployeeDays, 0) AS UniqueEmployeeDays
                                FROM 
                                    AllMonths am
                                CROSS JOIN 
                                    (SELECT DISTINCT YearNumber FROM FinalData) y
                                LEFT JOIN 
                                    MonthlyData md ON md.MonthNumber = am.MonthNumber 
                                                  AND md.YearNumber = y.YearNumber 
                                                  AND md.Department = d.Department
                                ORDER BY 
                                    y.YearNumber, am.MonthNumber
                                FOR JSON PATH
                            ) AS MonthlyAveragesJSON
                        FROM
                            (SELECT DISTINCT Department FROM FinalData) d
                    )
                    SELECT
                        ec.TotalMaleEmployees,
                        ec.TotalFemaleEmployees,
                        ec.TotalEmployees,
                        td.TotalDepartments,  
                        pc.TotalDepartmentsPresentToday,
                        pc.TotalMalePresentToday,
                        pc.TotalFemalePresentToday,
                        pc.TotalPresentToday,
                        dl.DepartmentsPresentToday,
                        (
                            SELECT 
                                dws.Department,
                                dws.TotalMaleEmployees,
                                dws.TotalFemaleEmployees,
                                dws.TotalEmployees,
                                dws.TotalMalePresentToday,
                                dws.TotalFemalePresentToday,
                                dws.TotalPresentToday,
                                dws.Employees,
                                ISNULL(maa.MonthlyAveragesJSON, '[]') AS MonthlyAverageAttendance
                            FROM DepartmentWiseStats dws
                            LEFT JOIN MonthlyAverageAttendance maa ON dws.Department = maa.Department
                            FOR JSON PATH
                        ) AS DepartmentWiseCounts
                    FROM
                        EmployeeCounts ec
                    CROSS JOIN
                        PresentCounts pc
                    CROSS JOIN
                        DepartmentList dl
                    CROSS JOIN
                        TotalDepartmentList td;`;

            const result = await request.query(query);

            const parsedData = result.recordset.map((row) => ({
                ...row,
                AttendanceDetails: row.AttendanceDetails
                    ? JSON.parse(row.AttendanceDetails)
                    : [],
                DepartmentList: row.DepartmentList
                    ? JSON.parse(row.DepartmentList)
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

    const getEmployeesByDepartment = async (req, res) => {
        try {
            const { department } = req.body;

            if (!department) {
                return res.status(400).json({ error: "Department is required" });
            }

            const request = new sql.Request()
                .input("Department", sql.VarChar, department)
                .query(`
                    SELECT Emp_Name AS label, Emp_Id AS value
                    FROM tbl_Employee_Master
                    WHERE Department = @Department`
                );

            const result = await request;
            dataFound(res, [], "data found", {
                employees: toArr(result.recordsets[0]),
            });

        } catch (e) {
            servError(e, res);
        }
    };

    return {
        addAttendance,
        getMyLastAttendance,
        closeAttendance,
        getAttendanceHistory,
        getDepartment,
        employeewise,
        getEmployeesByDepartment,
    }
}

export default newAttendance()