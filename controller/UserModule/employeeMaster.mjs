import sql from 'mssql';
import { dataFound, noData, servError, invalidInput, failed, success } from '../../res.mjs';
import { encryptPasswordFun } from '../../helper_functions.mjs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { getUserIdByAuth, getUserType, getUserTypeByAuth } from '../../middleware/miniAPIs.mjs'
dotenv.config();

const domain = process.env.domain;

const EmployeeController = () => {

    const emp_designation = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT 
                    Designation_Id as id, 
                    Designation 
                FROM 
                    tbl_Employee_Designation 
                WHERE 
                    Designation_Id != 0`);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const employeeDepartmentGet = async (req, res) => {
        try {
            const result = (await sql.query(`SELECT * FROM tbl_Attendance_Departments`)).recordset;

            if (result.length > 0) {
                dataFound(res, result);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const employeeGet = async (req, res) => {
        try {
            const getEmp = `
            SELECT 
                e.*, 
                COALESCE(d.Designation, 'NOT FOUND') AS Designation_Name, 
                COALESCE(b.BranchName, 'NOT FOUND') AS BranchName, 
                COALESCE(u.Name, 'NOT FOUND') AS CreaterName
            FROM 
                tbl_Employee_Master AS e
            LEFT JOIN 
                tbl_Employee_Designation as d
                ON e.Designation = d.Designation_Id
            LEFT JOIN 
                tbl_Users as u
                ON e.Entry_By = u.UserId
            LEFT JOIN 
                tbl_Branch_Master as b
                ON e.Branch = b.BranchId
            ORDER BY 
                e.Emp_Id`;

            const result = await sql.query(getEmp);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const employeePost = async (req, res) => {
        const {
            branch, mobile, empname, designation, dob, doj,
            address1, address2, city, pincode, education,
            father, mother, spouse, gender, religion, salary, total_loan,
            salary_advance, due_loan, enter_by, fingerPrintEmpId, Department_ID, createAsUser, department, location
        } = req.body.data;
        let userId = '';
        let empcode = '';
        let zeros = 0;
        let maxId = 0;

        try {

            const getBranchCode = new sql.Request()
                .input('branch', branch)
                .query(`SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @branch`);

            const branchResult = await getBranchCode;

            if (branchResult.recordset.length > 0) {
                empcode = branchResult.recordset[0]?.BranchCode;
            } else {
                return invalidInput(res, 'Branch not Found')
            }

            const getEmpId = await sql.query('SELECT COALESCE(MAX(Emp_Id), 0) AS MaxValue FROM tbl_Employee_Master');
            maxId = parseInt(getEmpId.recordset[0]['MaxValue']) + 1;
            zeros = String(maxId).padStart(4, '0');

            if (Boolean(createAsUser)) {
                const userExixtCheck = (await new sql.Request()
                    .input('mobile', mobile)
                    .query(`SELECT UserName FROM tbl_Users WHERE UserName = @mobile AND UDel_Flag = 0`)).recordset

                if (userExixtCheck.length > 0) {
                    return invalidInput(res, 'Mobile or UserName is Already Exists')
                }

                const request = await fetch(`${domain}api/masters/users`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        Name: empname,
                        UserName: mobile,
                        UserTypeId: 3,
                        Password: encryptPasswordFun('123456'),
                        BranchId: parseInt(branch)
                    })
                });

                const response = await request.json();

                if (response.success) {
                    userId = Number(response?.others?.UserId)
                } else {
                    return failed(res, 'Error while Creating User', response);
                }

            }

            const empCreation = await new sql.Request()
                .input('Emp_Id', maxId)
                .input('Branch', branch)
                .input('fingerPrintEmpId', fingerPrintEmpId)
                .input('Emp_Code', `${empcode}${zeros}`)
                .input('Emp_Name', empname)
                .input('Designation', designation)
                .input('DOB', dob ? new Date(dob) : '')
                .input('DOJ', doj ? new Date(doj) : '')
                .input('Department_ID', Department_ID)
                .input('Address_1', address1)
                .input('Address_2', address2)
                .input('City', city)
                .input('Country', 'India')
                .input('Pincode', pincode)
                .input('Mobile_No', mobile)
                .input('Education', education)
                .input('Fathers_Name', father)
                .input('Mothers_Name', mother)
                .input('Spouse_Name', spouse)
                .input('Sex', gender)
                .input('Emp_Religion', religion)
                .input('Salary', salary)
                .input('Total_Loan', total_loan)
                .input('Salary_Advance', salary_advance)
                .input('Due_Loan', due_loan)
                .input('User_Mgt_Id', userId)
                .input('Entry_By', enter_by)
                .input('Department', department)
                .input('Location', location)
                .query(`
                    INSERT INTO tbl_Employee_Master (
                        Emp_Id, fingerPrintEmpId, Branch, Emp_Code, Emp_Name, Designation, DOB, DOJ, Department_ID, Address_1, Address_2, City,
                        Country, Pincode, Mobile_No, Education, Fathers_Name, Mothers_Name, Spouse_Name,
                        Sex, Emp_Religion, Salary, Total_Loan, Salary_Advance, Due_Loan, User_Mgt_Id, Entry_By, Entry_Date,Department,location
                    ) VALUES(
                        @Emp_Id, @fingerPrintEmpId, @Branch, @Emp_Code, @Emp_Name, @Designation, @DOB, @DOJ, @Department_ID, @Address_1, @Address_2, @City,
                        @Country, @Pincode, @Mobile_No, @Education, @Fathers_Name, @Mothers_Name, @Spouse_Name,
                        @Sex, @Emp_Religion, @Salary, @Total_Loan, @Salary_Advance, @Due_Loan, @User_Mgt_Id, @Entry_By, GETDATE(),@Department,@Location
                    ) `
                )

            if (empCreation.rowsAffected[0] > 0) {
                return success(res, 'New Employee Created')
            } else {
                return failed(res, 'Employee Creation Failed')
            }

        } catch (e) {
            return servError(e, res)
        }
    }

    const employeePut = async (req, res) => {
        const { data, ID } = req.body;
        const {
            branch, mobile, empname, designation,
            address1, address2, city, pincode, education,
            father, mother, spouse, gender, religion, salary, total_loan,
            salary_advance, due_loan, enter_by, fingerPrintEmpId, user_manage_id, Department_ID, createAsUser, department, location
        } = data;
        const dob = data.dob ? data.dob : null;
        const doj = data.doj ? data.doj : null;

        try {
            const getBranchCode = new sql.Request()
                .input('branch', branch)
                .query(`SELECT BranchCode FROM tbl_Branch_Master WHERE BranchId = @branch`);
            const branchResult = await getBranchCode;

            if (branchResult.recordset.length === 0) {
                return invalidInput(res, 'Branch not Found')
            }

            if (Boolean(createAsUser)) {
                const checkResult = new sql.Request()
                    .input('mobile', mobile)
                    .input('empId', user_manage_id)
                    .query(`SELECT UserName FROM tbl_Users WHERE UserName = @mobile AND UDel_Flag = 0 AND UserId != @empId`);

                if ((await checkResult).recordset.length > 0) {
                    return invalidInput(res, 'Mobile or UserName is Already Exists')
                }

                const currentPassword = (await new sql.Request()
                    .input('UserId', user_manage_id)
                    .query(`SELECT TOP (1) Password FROM tbl_Users WHERE UserId = @UserId`)).recordset[0].Password;

                const request = await fetch(`${domain}api/masters/users`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        UserId: user_manage_id,
                        Name: empname,
                        UserName: mobile,
                        UserTypeId: 3,
                        Password: encryptPasswordFun(currentPassword ?? '123456'),
                        BranchId: parseInt(branch)
                    })
                });

                const response = await request.json();

                if (!response.success) {
                    return failed(res, 'Error while Update User', response);
                }
            }

            const empUpdate = await new sql.Request()
                .input('Emp_Id', ID)
                .input('Branch', branch)
                .input('Emp_Name', empname)
                .input('Designation', designation)
                .input('DOB', dob ? new Date(dob) : new Date())
                .input('DOJ', doj ? new Date(doj) : new Date())
                .input('Department_ID', Department_ID)
                .input('Address_1', address1)
                .input('Address_2', address2)
                .input('City', city)
                .input('Pincode', pincode)
                .input('Mobile_No', mobile)
                .input('Education', education)
                .input('Total_Loan', total_loan)
                .input('Salary_Advance', salary_advance)
                .input('Due_Loan', due_loan)
                .input('Father_Name', father)
                .input('Mother_Name', mother)
                .input('Spouse_Name', spouse)
                .input('Sex', gender)
                .input('Emp_Religion', religion)
                .input('Salary', salary)
                .input('Entry_By', enter_by)
                .input('fingerPrintEmpId', fingerPrintEmpId)
                .input('Department', department)
                .input('Location', location)
                .query(`
                    UPDATE 
                        tbl_Employee_Master 
                    SET 
                        Branch = @Branch,
                        Emp_Name = @Emp_Name,
                        Designation = @Designation,
                        ${dob ? 'DOB = CONVERT(DATE, @DOB),' : ''}
                        ${doj ? 'DOJ = CONVERT(DATE, @DOJ),' : ''}  
                        Department_ID = @Department_ID,
                        Address_1 = @Address_1, 
                        Address_2 = @Address_2, 
                        City = @City, 
                        Pincode = @Pincode,
                        Mobile_No = @Mobile_No, 
                        Education = @Education,
                        Total_Loan = @Total_Loan,
                        Salary_Advance = @Salary_Advance,
                        Due_Loan = @Due_Loan, 
                        Fathers_Name = @Father_Name, 
                        Mothers_Name = @Mother_Name,
                        Spouse_Name = @Spouse_Name, 
                        Sex = @Sex, 
                        Emp_Religion = @Emp_Religion, 
                        Salary = @Salary,
                        Entry_By = @Entry_By,
                        fingerPrintEmpId = @fingerPrintEmpId,
                        Department=@Department,
                        Location=@location
                    WHERE 
                        Emp_Id = @Emp_Id`
                )

            if (empUpdate.rowsAffected[0] > 0) {
                return success(res, 'Changes Saved')
            } else {
                return failed(res, 'Failed to save in user')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const employeeActivity = async (req, res) => {
        const { UserId, UserTypeId, Timing, Work_Date, Latitude, Longitude, Company_id } = req.body;

        if (!UserId || !UserTypeId || !Timing || !Work_Date || !Latitude || !Longitude || !Company_id) {

            return invalidInput(res, 'Missing required fields');
        }

        try {

            const result = await new sql.Request()
                .input('UserId', sql.Int, UserId)
                .input('UserTypeId', sql.Int, UserTypeId)
                .input('Timing', sql.DateTime, Timing)
                .input('Work_Date', sql.DateTime, Work_Date)
                .input('Latitude', sql.Float, Latitude)
                .input('Longitude', sql.Float, Longitude)
                .input('Company_id', sql.Int, Company_id)

                .query(`
        INSERT INTO tbl_Sales_Person_Movement (UserId, UserTypeId, Timing, Work_Date, Latitude, Longitude,Company_id)
        VALUES (@UserId, @UserTypeId, @Timing, @Work_Date, @Latitude, @Longitude,@Company_id)
      `);




            if (result.rowsAffected[0] > 0) {
                return success(res, 'Location data received successfully')
            } else {
                return failed(res, 'Failed to insert location data')
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const employeeGetActivity = async (req, res) => {
        const { Company_id } = req.query;

        if (!Company_id) {
            return invalidInput(res, 'Company ID is required');
        }

        try {
            const getEmp = `
                SELECT 
                    * 
                FROM 
                    [tbl_Sales_Person_Movement] spm
                WHERE 
                    company_id = @company_id 
                ORDER BY 
                    spm.Id DESC
            `;

            const request = new sql.Request();
            request.input('company_id', sql.Int, Company_id);

            const result = await request.query(getEmp);


            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const employeeGetActivityLogin = async (req, res) => {


        try {
            const getEmp = `
                WITH LastLogin AS (
                    SELECT 
                        ul.UserId,
                        ul.APP_Type,
                        ul.InTime,
                        ul.OutTime,
                        ROW_NUMBER() OVER (PARTITION BY ul.UserId, ul.APP_Type ORDER BY ul.InTime DESC) AS rn
                    FROM 
                        dbo.UserLog AS ul
                ),
                RankedLogs AS (
                    SELECT 
                        em.User_Mgt_Id,          
                        u.Name,                  
                        pd.EmployeeCode,        
                        pd.LogDateTime,           
                        CAST(pd.LogDateTime AS DATE) AS LogDate, 
                        ROW_NUMBER() OVER (PARTITION BY em.fingerPrintEmpId ORDER BY pd.LogDateTime DESC) AS rn,  -- Rank by LogDateTime for each user
                        COUNT(*) OVER (PARTITION BY em.fingerPrintEmpId, CAST(pd.LogDateTime AS DATE)) AS record_count  -- Count of records per user per date
                    FROM 
                        tbl_Employee_Master em
                    LEFT JOIN 
                        tbl_Users u ON u.UserId = em.User_Mgt_Id
                    LEFT JOIN 
                        [ESSl_Attendance].dbo.Paralleldatabase pd 
                        ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                )
                SELECT 
                    e.Designation,
                    e.User_Mgt_Id, 
                    COALESCE(d.Designation, 'NOT FOUND') AS Designation_Name, 
                    COALESCE(b.BranchName, 'NOT FOUND') AS BranchName, 
                    COALESCE(u.Name, 'NOT FOUND') AS username,

                    MAX(CASE WHEN ll.APP_Type = 1 THEN ll.InTime ELSE NULL END) AS WebLogin_InTime,
                    MAX(CASE WHEN ll.APP_Type = 1 THEN ll.OutTime ELSE NULL END) AS WebLogin_OutTime,

                    MAX(CASE WHEN ll.APP_Type = 2 THEN ll.InTime ELSE NULL END) AS MobileLogin_InTime,
                    MAX(CASE WHEN ll.APP_Type = 2 THEN ll.OutTime ELSE NULL END) AS MobileLogin_OutTime,

                    -- Attendance information from RankedLogs (only the most recent record for each user)
                    rl.LogDate,
                    rl.LogDateTime,

                    -- Calculating the Attendance Status based on record_count and rn
                    CASE 
                        WHEN rl.record_count = 1 THEN 'In'   
                        WHEN rl.record_count = 2 THEN 
                            CASE 
                                WHEN rl.rn = 1 THEN 'Out'  
                                ELSE 'In'
                            END
                        WHEN rl.record_count = 3 THEN 
                            CASE 
                                WHEN rl.rn = 1 THEN 'In' 
                                WHEN rl.rn = 2 THEN 'Out'
                                ELSE 'In'
                            END
                        WHEN rl.record_count = 4 THEN 
                            CASE 
                                WHEN rl.rn = 1 THEN 'Out'  
                                WHEN rl.rn = 2 THEN 'In'
                                WHEN rl.rn = 3 THEN 'Out'
                                ELSE 'In'
                            END
                        ELSE '-' 
                    END AS AttendanceStatus

                FROM 
                    tbl_Employee_Master AS e
                LEFT JOIN 
                    tbl_Employee_Designation AS d ON e.Designation = d.Designation_Id
                LEFT JOIN 
                    tbl_Users AS u ON e.User_Mgt_Id = u.UserId
                LEFT JOIN 
                    tbl_Branch_Master AS b ON e.Branch = b.BranchId
                LEFT JOIN 
                    LastLogin AS ll ON u.UserId = ll.UserId 
                                      AND ll.rn = 1  -- Latest login for each user
                LEFT JOIN 
                    RankedLogs AS rl ON e.User_Mgt_Id = rl.User_Mgt_Id 
                                     AND rl.rn = 1  -- Only the latest attendance record for each user

                GROUP BY
                    e.Designation,
                    e.User_Mgt_Id,
                    d.Designation,
                    b.BranchName,
                    u.Name,
                    rl.LogDate,
                    rl.LogDateTime,
                    rl.record_count,
                    rl.rn

                ORDER BY 
                    e.User_Mgt_Id DESC`;


            const result = await sql.query(getEmp);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    };

    const employeeGetActivityLoginMobile = async (req, res) => {
        const { UserId } = req.query;


        try {
            if (!checkIsNumber(UserId)) {
                return invalidInput(res, 'UserId is required');
            }


            const getEmp = `
                WITH RankedLogs AS (
                    SELECT 
                        em.User_Mgt_Id,          
                        u.Name,                  
                        pd.EmployeeCode,        
                        pd.LogDateTime,
                        CAST(pd.LogDate AS DATE) AS LogDate,
                        CAST(pd.LogDateTime AS datetime) AS LogDatetimes, 
                        ROW_NUMBER() OVER (PARTITION BY em.fingerPrintEmpId ORDER BY pd.LogDateTime DESC) AS rn, 
                        COUNT(*) OVER (PARTITION BY em.fingerPrintEmpId, CAST(pd.LogDateTime AS DATE)) AS record_count 
                    FROM 
                        tbl_Employee_Master em
                    LEFT JOIN 
                        tbl_Users u ON u.UserId = em.User_Mgt_Id
                    LEFT JOIN 
                        [ESSl_Attendance].dbo.Paralleldatabase pd 
                        ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                )
                SELECT 
                    e.User_Mgt_Id, 
                    u.Name AS username,
                    rl.LogDate,
                    rl.LogDatetimes 
                FROM 
                    tbl_Employee_Master AS e
                LEFT JOIN 
                    tbl_Users AS u ON e.User_Mgt_Id = u.UserId
                LEFT JOIN 
                    RankedLogs AS rl ON e.User_Mgt_Id = rl.User_Mgt_Id 
                                     AND rl.rn = 1  -- Get the latest record (row number 1)
                WHERE 
                    u.UserId = @UserId
                ORDER BY 
                    e.User_Mgt_Id DESC
            `;

            const request = new sql.Request();
            request.input('UserId', sql.Int, UserId);

            const result = await request.query(getEmp);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    };

    const employeeAttendanceModule = async (req, res) => {
        const { FromDate, ToDate, UserId } = req.query;

        try {
            if (!FromDate || !ToDate) {
                return invalidInput(res, "FromDate is required and must be a valid number");
            }
            const adjustedToDate = new Date(ToDate);
            adjustedToDate.setDate(adjustedToDate.getDate() + 1);
            const adjustedToDateStr = adjustedToDate.toISOString();

            const userTypeId = await getUserType(UserId);

            let condition = "";
            if (UserId == "" || UserId == "0") {
                condition = ``;
            } else {
                condition = `AND rl.User_Mgt_Id = @UserId`;
            }

            let query = `WITH RankedLogs AS (
                         SELECT 
                             em.User_Mgt_Id,          
                             COALESCE(u.Name, '') AS username,  
                             u.UDel_Flag,
                             pd.EmployeeCode,        
                             al.AttendanceDate AS LogDateTime,           
                             CAST(al.AttendanceDate AS DATE) AS LogDate,  
                             ROW_NUMBER() OVER (
                                 PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE) 
                                 ORDER BY al.AttendanceDate
                             ) AS rn, 
                             COUNT(*) OVER (
                                 PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE)
                             ) AS record_count  
                         FROM tbl_Employee_Master em
                         LEFT JOIN tbl_Users u ON u.UserId = em.User_Mgt_Id
                         LEFT JOIN etimetracklite1.dbo.Employees pd 
                             ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                         LEFT JOIN etimetracklite1.dbo.AttendanceLogs al 
                             ON al.EmployeeId = pd.EmployeeId
                         WHERE 
                             COALESCE(u.UDel_Flag, 0) != 1 
                             AND al.status != 'Resigned'
                     ),
                     DefaultLeaves AS (
                         SELECT 
                             CAST(Date AS DATE) AS DefaultLeaveDate
                         FROM tbl_Default_Leave
                         WHERE 
                             Date >= CAST(@FromDate AS DATE)
                             AND Date < CAST(@ToDate AS DATE)
                     ),
                     PunchDetails AS (
                         SELECT 
                             pd.EmployeeCode, 
                             CAST(al.AttendanceDate AS DATE) AS LogDate,
                             COALESCE(
                                 STRING_AGG(SUBSTRING(al.PunchRecords, 1, 5000), ', '), 
                                 '[]'
                             ) AS PunchDateTimes
                         FROM etimetracklite1.dbo.Employees pd 
                         LEFT JOIN etimetracklite1.dbo.AttendanceLogs al 
                             ON al.EmployeeId = pd.EmployeeId
                         WHERE 
                             al.status != 'Resigned'
                             AND ISNULL(CAST(al.PunchRecords AS NVARCHAR(MAX)), '') <> ''
                         GROUP BY pd.EmployeeCode, CAST(al.AttendanceDate AS DATE)
                     ),
                     LeaveDays AS (
                         SELECT 
                             lm.User_Id,
                             DATEADD(DAY, n.number, CAST(lm.FromDate AS DATE)) AS LeaveDate
                         FROM tbl_Leave_Master lm
                         CROSS JOIN (
                             SELECT number FROM master.dbo.spt_values 
                             WHERE type = 'P' 
                             AND number BETWEEN 0 AND 1000 
                         ) n
                         WHERE 
                             lm.Status = 'Approved'
                             AND DATEADD(DAY, n.number, CAST(lm.FromDate AS DATE)) <= CAST(lm.ToDate AS DATE)
                     )
                     SELECT 
                         e.User_Mgt_Id, 
                         COALESCE(d.Designation, 'NOT FOUND') AS Designation_Name, 
                         COALESCE(rl.username, '') AS username,  
                         rl.LogDate,
                         COALESCE(ag.PunchDateTimes, '[]') AS AttendanceDetails, 
                         COALESCE(MAX(rl.record_count), 0) AS TotalRecords,
                         CASE 
                             WHEN DATEPART(WEEKDAY, rl.LogDate) = 1 THEN 'H'
                             WHEN EXISTS (
                                 SELECT 1 FROM LeaveDays ld
                                 WHERE COALESCE(ld.User_Id, -1) = e.User_Mgt_Id 
                                   AND ld.LeaveDate = rl.LogDate
                             ) THEN 'L'
                             WHEN EXISTS (
                                 SELECT 1 FROM DefaultLeaves dl
                                 WHERE dl.DefaultLeaveDate = rl.LogDate
                             ) THEN 'DL'
                             WHEN COALESCE(ag.PunchDateTimes, '') <> '' THEN 'P' 
                             ELSE 'A' 
                         END AS AttendanceStatus
                     FROM tbl_Employee_Master AS e
                     LEFT JOIN tbl_Employee_Designation AS d ON e.Designation = d.Designation_Id
                     LEFT JOIN tbl_Users AS u ON e.User_Mgt_Id = u.UserId
                     LEFT JOIN RankedLogs AS rl ON e.User_Mgt_Id = rl.User_Mgt_Id
                     LEFT JOIN PunchDetails AS ag 
                         ON ag.EmployeeCode = rl.EmployeeCode 
                         AND ag.LogDate = rl.LogDate
                     WHERE 
                         rl.LogDate IS NOT NULL 
                         AND rl.LogDate >= CAST(@FromDate AS DATETIME) 
                         AND rl.LogDate < CAST(@ToDate AS DATETIME)
                         AND (@UserId IS NULL OR rl.User_Mgt_Id = @UserId)
                         AND COALESCE(u.UDel_Flag, 0) != 1
                     GROUP BY 
                         e.User_Mgt_Id, 
                         d.Designation, 
                         rl.username,  
                         rl.LogDate, 
                         ag.PunchDateTimes
                     ORDER BY rl.LogDate DESC;
                     `;

            const request = new sql.Request();
            request.input("FromDate", sql.DateTime, FromDate || "1900-01-01");
            request.input("ToDate", sql.DateTime, adjustedToDateStr);

            if (UserId == "" || UserId == "0") {
                request.input("UserId", sql.Int, null);
            } else {
                request.input("UserId", sql.Int, UserId);
            }

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const employeeOverallAttendance = async (req, res) => {
        const { FromDate, ToDate } = req.query;

        try {

            if (!FromDate || !ToDate) {
                return invalidInput(res, "FromDate and ToDate are required and must be valid dates");
            }

            const query = `
                WITH RankedLogs AS (  SELECT 
                        em.User_Mgt_Id,          
                        u.Name AS username,  
                        pd.EmployeeCode,        
                        al.AttendanceDate AS LogDateTime,           
                        CAST(al.AttendanceDate AS DATE) AS LogDate,  
                        ROW_NUMBER() OVER (PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE) ORDER BY al.AttendanceDate) AS rn, 
                        COUNT(*) OVER (PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE)) AS record_count  
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
                        al.AttendanceDate BETWEEN @FromDate AND @ToDate 
                        AND CAST(al.PunchRecords AS NVARCHAR(MAX)) IS NOT NULL  
                        AND LTRIM(RTRIM(CAST(al.PunchRecords AS NVARCHAR(MAX)))) <> ''

                ), AttendanceSummary AS (
                    SELECT 
                        rl.username,
                        rl.User_Mgt_Id,
                        rl.LogDate,
                        'P' AS AttendanceStatus
                    FROM 
                        RankedLogs rl
                    GROUP BY 
                        rl.username, rl.User_Mgt_Id, rl.LogDate
                )  SELECT 
                    outerEA.username AS Name,
                    COUNT(outerEA.AttendanceStatus) AS TotalPresent,
                    ( SELECT 
                            sub.LogDate AS Date,
                            sub.AttendanceStatus
                        FROM 
                            AttendanceSummary AS sub
                        WHERE 
                            sub.username = outerEA.username
                        FOR JSON PATH
                    ) AS AttendanceDetails
                FROM 
                    AttendanceSummary AS outerEA
                GROUP BY 
                    outerEA.username
                ORDER BY 
                    outerEA.username;
            `;

            const request = new sql.Request();
            request.input("FromDate", sql.DateTime, FromDate);
            request.input("ToDate", sql.DateTime, ToDate);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const summaryLeave = async (req, res) => {
        const { FromDate, ToDate } = req.query;

        try {
            if (!FromDate || !ToDate) {
                return invalidInput(res, "FromDate and ToDate are required");
            }

            const query = `
                WITH RankedLogs AS (
                    SELECT 
                    em.User_Mgt_Id,          
                    u.Name AS username,  
                    pd.EmployeeCode,        
                    al.AttendanceDate AS LogDateTime,           
                    CAST(al.AttendanceDate AS DATE) AS LogDate,  
                    ROW_NUMBER() OVER (PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE) ORDER BY al.AttendanceDate) AS rn, 
                    COUNT(*) OVER (PARTITION BY em.fingerPrintEmpId, CAST(al.AttendanceDate AS DATE)) AS record_count  
                FROM tbl_Employee_Master em
                LEFT JOIN 
                    tbl_Users u 
                    ON u.UserId = em.User_Mgt_Id
                LEFT JOIN 
                    etimetracklite1.dbo.Employees pd 
                    ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                LEFT JOIN 
                    etimetracklite1.dbo.AttendanceLogs al 
                    ON al.EmployeeId = pd.EmployeeId 
                WHERE 
                    al.AttendanceDate BETWEEN @FromDate AND @ToDate 
                    AND CAST(al.PunchRecords AS NVARCHAR(MAX)) IS NOT NULL  
                    AND LTRIM(RTRIM(CAST(al.PunchRecords AS NVARCHAR(MAX)))) <> ''
                ), AttendanceSummary AS (
                    SELECT 
                        rl.username,
                        rl.User_Mgt_Id,
                        rl.LogDate,
                        'P' AS AttendanceStatus
                    FROM RankedLogs rl
                    GROUP BY rl.username, rl.User_Mgt_Id, rl.LogDate
                ), ApprovedLeaves AS (
                    SELECT 
                        u.Name AS username,
                        lm.User_Id AS User_Mgt_Id,
                        DATEADD(DAY, v.number, lm.FromDate) AS LogDate,
                        'L' AS AttendanceStatus
                    FROM tbl_Leave_Master lm
                    JOIN 
                        tbl_Users u 
                        ON u.UserId = lm.User_Id
                    JOIN 
                        master.dbo.spt_values v 
                        ON v.type = 'P' AND v.number <= DATEDIFF(DAY, lm.FromDate, lm.ToDate)
                    WHERE 
                        lm.Status = 'Approved' 
                        AND lm.FromDate <= @ToDate AND lm.ToDate >= @FromDate
                ), PendingLeaves AS (
                    SELECT 
                        u.Name AS username,
                        lm.User_Id AS User_Mgt_Id,
                        DATEADD(DAY, v.number, lm.FromDate) AS LogDate,
                        'PL' AS AttendanceStatus
                    FROM tbl_Leave_Master lm
                    JOIN 
                        tbl_Users u 
                        ON u.UserId = lm.User_Id
                    JOIN 
                        master.dbo.spt_values v 
                        ON v.type = 'P' AND v.number <= DATEDIFF(DAY, lm.FromDate, lm.ToDate)
                    WHERE 
                        lm.Status != 'Approved' 
                        AND lm.FromDate <= @ToDate AND lm.ToDate >= @FromDate
                    ), DefaultLeave AS ( 
                        SELECT 
                        u.Name AS username,
                        em.User_Mgt_Id,
                        dl.Date AS LogDate,
                        'H' AS AttendanceStatus
                    FROM tbl_Default_Leave dl
                    CROSS JOIN 
                        tbl_Employee_Master em
                    JOIN 
                        tbl_Users u 
                        ON u.UserId = em.User_Mgt_Id
                    WHERE 
                        dl.Date BETWEEN @FromDate AND @ToDate
                    ), CombinedAttendance AS (
                        SELECT * FROM AttendanceSummary
                        UNION ALL
                        SELECT * FROM ApprovedLeaves
                        UNION ALL
                        SELECT * FROM PendingLeaves
                        UNION ALL
                        SELECT * FROM DefaultLeave
                    )
                    SELECT outerEA.username AS Name,
                        COALESCE(COUNT(CASE WHEN outerEA.AttendanceStatus = 'P' THEN 1 END), 0) AS TotalPresent,
                        COALESCE(COUNT(CASE WHEN outerEA.AttendanceStatus = 'L' THEN 1 END), 0) AS ApprovedLeave,
                        COALESCE(COUNT(CASE WHEN outerEA.AttendanceStatus = 'PL' THEN 1 END), 0) AS PendingLeave,
                        COALESCE(COUNT(CASE WHEN outerEA.AttendanceStatus = 'H' THEN 1 END), 0) AS CompanyHoliday,
                    COALESCE((
                        SELECT 
                            sub.LogDate AS Date,
                            sub.AttendanceStatus
                        FROM 
                            CombinedAttendance AS sub
                        WHERE 
                            sub.username = outerEA.username
                        FOR JSON PATH
                    ), '[]') AS AttendanceDetails
                    FROM 
                        CombinedAttendance AS outerEA
                    GROUP BY 
                        outerEA.username
                    ORDER BY 
                        outerEA.username`;

            const request = new sql.Request();
            request.input("FromDate", sql.DateTime, FromDate);
            request.input("ToDate", sql.DateTime, ToDate);

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const maplatitudelongitude = async (req, res) => {
        try {

            const query = `
                              SELECT 
                   rtm.Retailer_Name,
                   rl.latitude AS latitude,
                   rl.longitude AS longitude,
                   COALESCE(u.Name, 'unknown') AS EntryByGet
               FROM 
                   tbl_Retailers_Locations rl
               LEFT JOIN 
                   tbl_Users u ON u.UserId = rl.EntryBy
               LEFT JOIN 
                   tbl_Retailers_Master rtm ON rtm.Retailer_Id = rl.Retailer_Id
               ORDER BY 
                   rl.EntryAt DESC

            `;

            const request = new sql.Request();
            const result = await request.query(query);


            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        emp_designation,
        employeeDepartmentGet,
        employeeGet,
        employeePost,
        employeePut,
        employeeActivity,
        employeeGetActivity,
        employeeGetActivityLogin,
        employeeGetActivityLoginMobile,
        employeeAttendanceModule,
        employeeOverallAttendance,
        maplatitudelongitude,
        summaryLeave
    }
}


export default EmployeeController();