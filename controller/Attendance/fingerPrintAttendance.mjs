import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, success, failed } from '../../res.mjs';
import { checkIsNumber, firstDayOfMonth, ISOString } from '../../helper_functions.mjs';


const FingerPrintAttendance = () => {

    const getAttendance = async (req, res) => {
        const { 
            Fromdate = firstDayOfMonth(), 
            Todate = ISOString()
        } = req.query;

        try {
            const result = await new sql.Request()
                .input('from', Fromdate)
                .input('todate', Todate)
                .query(`
                    WITH ATTENDANCE AS (
                        SELECT 
                            EmployeeId AS fingerPrintEmpId,
                            AttendanceDate,
                            InTime,
                            OutTime,
	                    	Status AS AttendanceStatus
                        FROM
                            AttendanceLogs
                        WHERE
                            EmployeeId IN (
                                SELECT 
                                    fingerPrintEmpId 
                                FROM
                                    tbl_Employee_Master
                                WHERE
                                    fingerPrintEmpId IS NOT NULL
                            )
	                    	AND
	                    	(Status = 'Present' OR Status = ' ½Present ')
                            AND
                            CONVERT(DATE, AttendanceDate) >= CONVERT(DATE, @from)
                            AND
                            CONVERT(DATE, AttendanceDate) <= CONVERT(DATE, @todate)
                    )
                    SELECT
                        E.Emp_Id,
                    	E.Emp_Name,
                    	E.Mobile_No,
                    	A.*,
                        COALESCE((
                            SELECT DepartmentFName FROM tbl_Attendance_Departments WHERE DepartmentId = E.Department_ID
                        ), 'Not Found') AS Salary_Type
                    FROM 
                        tbl_Employee_Master AS E,
                    	ATTENDANCE AS A
                    WHERE
                    	E.fingerPrintEmpId IS NOT NULL
                    	AND
                    	A.fingerPrintEmpId = E.fingerPrintEmpId;    `
                );
            
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
        getAttendance,
    }
}


export default FingerPrintAttendance();