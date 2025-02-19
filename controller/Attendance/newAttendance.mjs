import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, success, failed } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getUserType } from '../../middleware/miniAPIs.mjs';
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import getImageIfExist from '../../middleware/getImageIfExist.mjs';
import fileRemoverMiddleware from '../../middleware/unSyncFile.mjs'

const newAttendance = () => {

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

    return {
        addAttendance,
        getMyLastAttendance,
        closeAttendance,
        getAttendanceHistory,
    }
}

export default newAttendance()