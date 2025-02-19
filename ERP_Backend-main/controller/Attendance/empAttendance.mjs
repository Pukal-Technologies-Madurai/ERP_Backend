import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, success, failed } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';;

const AttendanceController = () => {

    const addAttendance = async (req, res) => {
        const { UserId, Latitude, Longitude } = req.body;
        
        try {

            if (!UserId || !Latitude || !Longitude) {
                return invalidInput(res, 'UserId, Latitude, Longitude is required');
            }

            const query = `
            INSERT INTO 
                tbl_Attendance (UserId, Start_Date, Latitude, Longitude, Active_Status)
            VALUES 
                (@user, @date, @latitude, @longitude, @status)`;

            const request = new sql.Request();
            request.input('user', UserId);
            request.input('date', new Date());
            request.input('latitude', Latitude);
            request.input('longitude', Longitude);
            request.input('status', 1);

            const result = await request.query(query);

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Attendance Noted!')
            } else {
                failed(res, 'Failed to Add Attendance')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getMyTodayAttendance = async (req, res) => {
        const { UserId } = req.query;

        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required')
        }

        try {
            const query = `
            SELECT 
                * 
            FROM 
                tbl_Attendance 
            WHERE 
                UserId = @user
                AND
                CONVERT(DATE, Start_Date) = CONVERT(DATE, GETDATE())`;

            const request = new sql.Request();
            request.input('user', UserId)

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getMyLastAttendance = async (req, res) => {
        const { UserId } = req.query;

        if (isNaN(UserId)) {
            return invalidInput(res, 'UserId is required')
        }

        try {
            const query = `
            SELECT 
                TOP (1)
                * 
            FROM 
                tbl_Attendance 
            WHERE 
                UserId = @user
            ORDER BY
                CONVERT(DATETIME, Start_Date) DESC`;

            const request = new sql.Request();
            request.input('user', UserId)

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const closeAttendance = async (req, res) => {
        const { Id, Description } = req.body;

        try {

            if (isNaN(Id) || !Id) {
                return invalidInput(res, 'Id is required, Description is optional')
            }

            const query = `
            UPDATE 
                tbl_Attendance 
            SET
                End_Date = @enddate,
                Active_Status = @status,
                Work_Summary = @desc
            WHERE
                Id = @id`;

            const request = new sql.Request();
            request.input('enddate', new Date())
            request.input('status', 0)
            request.input('id', Id);
            request.input('desc', Description ? Description : '')

            const result = await request.query(query);

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
        const { From, To, UserId } = req.query;

        if (!From || !To) {
            return invalidInput(res, 'From and To is required');
        }

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
            if (checkIsNumber(UserId)) {
                query += `
                AND
                a.UserId = @userid`;
            }

            const request = new sql.Request();
            request.input('from', From);
            request.input('to', To);
            request.input('userid', UserId);

            const result = await request.query(query);

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
        addAttendance,
        getMyTodayAttendance,
        getMyLastAttendance,
        closeAttendance,
        getAttendanceHistory,
    }
}

export default AttendanceController()