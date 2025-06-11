import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber } from '../../helper_functions.mjs';

const leaveType = () => {

    const getLeaveTypeDropdown = async (req, res) => {

        try {
            const leaveType = (await new sql.Request()
                .query(`
                    SELECT 
                        Id, 
                        LeaveType 
                    FROM 
                        tbl_LeaveType 
                        `)
            ).recordset;

            if (leaveType.length > 0) {
                dataFound(res, leaveType)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getLeaveType = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT * 
                    FROM tbl_LeaveType vt`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res)
        }
    }

    const addLeaveType = async (req, res) => {
        const { LeaveType } = req.body;

        if (!LeaveType) {
            return invalidInput(res, 'LeaveType is required');
        }

        try {
            const request = new sql.Request()
                .input('LeaveType', sql.VarChar, LeaveType)
                .query(`
                    INSERT INTO dbo.tbl_LeaveType (LeaveType)
                    VALUES (@LeaveType)`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Leave Type Added');
            } else {
                failed(res, 'Failed to create Leave Type');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const editLeaveType = async (req, res) => {
        const { Id, LeaveType } = req.body;

        if (!checkIsNumber(Id) || !LeaveType) {
            return invalidInput(res, 'LeaveType is required')
        }

        try {

            const request = new sql.Request()
                .input('Id', Id)
                .input('LeaveType', LeaveType)
                .query(`
                    UPDATE tbl_LeaveType 
                    SET LeaveType = @LeaveType
                    WHERE Id = @Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                failed(res, 'Failed to save changes')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteLeaveType = async (req, res) => {
        try {
            const { Id } = req.body;

            if (!checkIsNumber(Id)) {
                return invalidInput(res, 'Id is required')
            }

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

    return {
        getLeaveType,
        addLeaveType,
        editLeaveType,
        deleteLeaveType,
        getLeaveTypeDropdown
    }
}

export default leaveType();