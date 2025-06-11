import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber } from '../../helper_functions.mjs';

const leaveMaster = () => {

    const getLeaveList = async (req, res) => {
        try {
            const { UserId, FromDate, ToDate } = req.query;

            const request = new sql.Request()
                .input("FromDate", sql.Date, FromDate)
                .input("ToDate", sql.Date, ToDate)
                .input("UserId", sql.Int, UserId)
                .query(`
                    SELECT 
                        lt.*,
                        u.Name AS UserName,
		                u1.Name AS ApproverName,
                        lty.LeaveType 
                    FROM 
                        tbl_Leave_Master lt
                    LEFT JOIN 
                        tbl_Users u ON u.UserId = lt.User_Id
                    LEFT JOIN 
                        tbl_LeaveType lty ON lty.Id = lt.LeaveType_Id
	                LEFT JOIN
	                	tbl_Users u1 ON u1.UserId =lt.Approved_By
                    WHERE 1 = 1 
                    ${FromDate ? ' AND CAST(lt.FromDate AS DATE) >= @FromDate ' : ''}
                    ${ToDate ? ' AND CAST(lt.ToDate AS DATE) <= @ToDate ' : ''}
                    ${(checkIsNumber(UserId) && UserId !== 0) ? ' AND lt.User_Id = @UserId ' : ''}
                    ORDER BY lt.Id DESC;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    };

    const applyLeave = async (req, res) => {
        const {
            User_Id, FromDate, ToDate, Session, NoOfDays, LeaveType_Id, 
            Department, InCharge, Reason, Created_By,
        } = req.body;

        try {

            if (!User_Id || parseInt(User_Id) === 0) {

                return invalidInput(res, 'select Employee Name')
            }

            const request = new sql.Request()
                .input("User_Id", sql.BigInt, User_Id)
                .input("FromDate", sql.DateTime, FromDate)
                .input("ToDate", sql.DateTime, ToDate)
                .input("Session", sql.NVarChar(50), Session)
                .input("NoOfDays", NoOfDays)
                .input("LeaveType_Id", sql.BigInt, LeaveType_Id)
                .input("Department", sql.NVarChar(50), Department)
                .input("InCharge", sql.BigInt, InCharge)
                .input("Reason", sql.NVarChar(50), Reason)
                .input("Created_By", sql.BigInt, Created_By)
                .input("Status", sql.NVarChar, 'Pending')
                .input("Created_At", sql.DateTime, new Date())
                .query(`
                    INSERT INTO tbl_Leave_Master (
                        User_Id, FromDate, ToDate, Session, NoOfDays, LeaveType_Id, 
                        Department, InCharge, Reason, Created_By,Status, Created_At
                    ) VALUES (
                        @User_Id, @FromDate, @ToDate, @Session, @NoOfDays, @LeaveType_Id, 
                        @Department, @InCharge, @Reason, @Created_By, @Status, @Created_At
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, "New Leave Added");
            } else {
                failed(res, "Failed to create Leave");
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const editLeave = async (req, res) => {
        const {
            Id,
            LeaveType_Id,
            Approver_Reason,
            Approved_By,
            Status,
        } = req.body;

        if (!checkIsNumber(Id)) {
            return invalidInput(res, 'Valid Id is required');
        }
        if (!LeaveType_Id) {
            return invalidInput(res, 'LeaveType_Id is required');
        }

        try {
            const request = new sql.Request()
                .input('Id', sql.Int, Id)
                .input('LeaveType_Id', sql.Int, LeaveType_Id)
                .input('Approver_Reason', sql.VarChar(500), Approver_Reason || null)
                .input('Approved_At', sql.DateTime, new Date())
                .input('Approved_By', Approved_By)
                .input('Status', sql.VarChar(500), Status);
            const result = await request.query(`
                UPDATE tbl_Leave_Master
                SET LeaveType_Id = @LeaveType_Id,
                    Approver_Reason = @Approver_Reason,
                    Approved_At = @Approved_At,
                    Approved_By = @Approved_By,
                    Status=@Status
                WHERE Id = @Id`
            );

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Changes saved successfully');
            } else {
                return failed(res, 'Failed to save changes');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteLeave = async (req, res) => {
        const { Id } = req.body;
        if (!checkIsNumber(Id)) {
            return invalidInput(res, 'Id is required')
        }

        try {

            const request = new sql.Request()
                .input('Id', Id)
                .query(`
                    DELETE 
                    FROM tbl_LeaveType
                    WHERE Id = @Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Id deleted')
            } else {
                failed(res, 'Failed to delete Id')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const lisitingApproveData = async (req, res) => {
        const { userId } = req.query;

        if (!checkIsNumber(userId)) {
            return invalidInput(res, 'userId is required')
        }

        try {
            const request = new sql.Request()
                .input("InCharge", sql.BigInt, userId);

            const result = await request.query(`
                SELECT 
                    l.*,
                    u1.Name AS UserName,
                    u2.Name AS InChargeName,
                    u3.Name AS ApproverName,
                    lt.LeaveType
                FROM tbl_Leave_Master l 
                LEFT JOIN tbl_Users u1 ON l.User_Id = u1.UserId
                LEFT JOIN tbl_Users u2 ON l.InCharge = u2.UserId
                LEFT JOIN tbl_Users u3 ON l.Approved_By  =u3.UserId
                LEFT JOIN tbl_LeaveType lt ON l.LeaveType_Id = lt.Id
                WHERE l.InCharge = @InCharge
                ORDER BY l.Id DESC`
            );

            return sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getLeaveList,
        applyLeave,
        editLeave,
        deleteLeave,
        lisitingApproveData
    }
}

export default leaveMaster();