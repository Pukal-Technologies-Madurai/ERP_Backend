import sql from 'mssql';
import { dataFound, noData, servError, invalidInput, failed, success } from '../../res.mjs';
import { encryptPasswordFun } from '../../helper_functions.mjs';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

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
            return res.status(400).json({ success: false, message: 'Missing required fields' });
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
                return res.status(200).json({ success: true, message: 'Location data received successfully' });
            } else {
                return res.status(400).json({ success: false, message: 'Failed to insert location data' });
            }
        } catch (error) {
            console.error('Error processing data:', error);
            return res.status(500).json({ success: false, message: 'Server Error' });
        }
    };



    const employeeGetActivity = async (req, res) => {
        const { Company_id } = req.query;

        if (!Company_id) {
            return res.status(400).json({ success: false, message: 'Company ID is required' });
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
                return res.status(200).json({ success: true, data: result.recordset });
            } else {
                return res.status(404).json({ success: false, message: 'No data found for the given company_id' });
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    };




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
    
        // Check if UserId is valid
        try {
            if (!checkIsNumber(UserId)) {
                return res.status(400).json({ data: [], success: false, message: 'UserId is required and must be a valid number', isCustomer: false });
            }
    
            // Define the SQL query
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
                return res.status(200).json({ success: true, data: result.recordset });
            } else {
                return res.status(404).json({ success: false, message: 'No data found for the given company_id' });
            }
    
        } catch (error) {
            console.error('Error fetching data:', error);
            return res.status(500).json({ success: false, message: 'Server error' });
        }
    };



    const employeeAttendanceModule = async (req, res) => {
        const { FromDate, ToDate, UserId } = req.query;
    
        try {
            let query = `
            WITH RankedLogs AS (
                SELECT 
                    em.User_Mgt_Id,          
                    u.Name AS username,  
                    pd.EmployeeCode,        
                    pd.LogDateTime,           
                    CAST(pd.LogDateTime AS DATE) AS LogDate,  -- LogDate (Date-only version)
                    ROW_NUMBER() OVER (PARTITION BY em.fingerPrintEmpId, CAST(pd.LogDateTime AS DATE) ORDER BY pd.LogDateTime) AS rn, 
                    COUNT(*) OVER (PARTITION BY em.fingerPrintEmpId, CAST(pd.LogDateTime AS DATE)) AS record_count  
                FROM 
                    tbl_Employee_Master em
                LEFT JOIN 
                    tbl_Users u ON u.UserId = em.User_Mgt_Id
                LEFT JOIN 
                    [ESSl_Attendance].dbo.Paralleldatabase pd 
                    ON CAST(pd.EmployeeCode AS NVARCHAR(50)) = em.fingerPrintEmpId
                WHERE 
                    pd.LogDate >= CAST(@FromDate AS DATETIME) AND 
                    pd.LogDate <= CAST(@ToDate AS DATETIME)
            )
            SELECT 
                e.User_Mgt_Id, 
                COALESCE(d.Designation, 'NOT FOUND') AS Designation_Name, 
                rl.username,  
                rl.LogDate,
              
                STRING_AGG(
                    FORMAT(rl.LogDateTime, 'yyyy-MM-dd HH:mm:ss') + ' (' +
                    CAST(rl.rn AS VARCHAR(10)) + ')',  
                    ', ') AS AttendanceDetails,
                
                CASE 
                    WHEN rl.record_count >= 1  THEN 'Present'  
                    ELSE 'Absent'  
                END AS AttendanceStatus,
                
                rl.record_count  -- Total count of attendance records for each LogDate
            FROM 
                tbl_Employee_Master AS e
            LEFT JOIN 
                tbl_Employee_Designation AS d ON e.Designation = d.Designation_Id
            LEFT JOIN 
                tbl_Users AS u ON e.User_Mgt_Id = u.UserId
            LEFT JOIN 
                RankedLogs AS rl ON e.User_Mgt_Id = rl.User_Mgt_Id
            WHERE 
                rl.LogDate >= CAST(@FromDate AS DATETIME) AND rl.LogDate <= CAST(@ToDate AS DATETIME)
                AND rl.LogDateTime IS NOT NULL 
            `;
    
            if (UserId) {
                query += ` AND e.User_Mgt_Id = @UserId `;
            }
    
            query += `
            GROUP BY 
                e.User_Mgt_Id, 
                e.Designation, 
                d.Designation, 
                rl.username,  
                rl.LogDate, 
                rl.record_count  -- Grouping by record_count to aggregate correctly
            `;
    
            query += `
            ORDER BY 
                rl.LogDate DESC
            `;
    
            const request = new sql.Request();
    
            request.input('FromDate', sql.DateTime, FromDate || '1900-01-01'); 
            request.input('ToDate', sql.DateTime, ToDate || '2100-01-01'); 
            if (UserId) request.input('UserId', sql.Int, UserId); 
    
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
        employeeAttendanceModule
    }
}


export default EmployeeController();