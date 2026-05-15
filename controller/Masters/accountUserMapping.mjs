import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, success, failed } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const accountUserMapping = () => {

    const getMappings = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        m.id, 
                        m.Acc_Id, 
                        m.UserId, 
                        a.Account_name, 
                        u.Name AS UserName
                    FROM tbl_Acc_User_Mapping m
                    JOIN tbl_Account_Master a ON a.Acc_Id = m.Acc_Id
                    JOIN tbl_Users u ON u.UserId = m.UserId
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

    const addMapping = async (req, res) => {
        try {
            const { Acc_Id, UserId } = req.body;
            if (!checkIsNumber(Acc_Id) || !checkIsNumber(UserId)) {
                return invalidInput(res, 'Acc_Id and UserId are required');
            }

            const checkReq = new sql.Request()
                .input('Acc_Id', Acc_Id)
                .input('UserId', UserId)
                .query(`SELECT id FROM tbl_Acc_User_Mapping WHERE Acc_Id = @Acc_Id AND UserId = @UserId`);
            
            const checkRes = await checkReq;
            if (checkRes.recordset.length > 0) {
                return failed(res, 'Mapping already exists');
            }

            const request = new sql.Request()
                .input('Acc_Id', Acc_Id)
                .input('UserId', UserId)
                .query(`
                    INSERT INTO tbl_Acc_User_Mapping (Acc_Id, UserId) 
                    VALUES (@Acc_Id, @UserId)
                `);
            await request;
            success(res, 'Mapping created successfully');
        } catch (e) {
            servError(e, res);
        }
    };

    const editMapping = async (req, res) => {
        try {
            const { id, Acc_Id, UserId } = req.body;
            if (!id || !checkIsNumber(Acc_Id) || !checkIsNumber(UserId)) {
                return invalidInput(res, 'id, Acc_Id and UserId are required');
            }

            const checkReq = new sql.Request()
                .input('id', id)
                .input('Acc_Id', Acc_Id)
                .input('UserId', UserId)
                .query(`SELECT id FROM tbl_Acc_User_Mapping WHERE Acc_Id = @Acc_Id AND UserId = @UserId AND id != @id`);
            
            const checkRes = await checkReq;
            if (checkRes.recordset.length > 0) {
                return failed(res, 'Mapping already exists');
            }

            const request = new sql.Request()
                .input('id', id)
                .input('Acc_Id', Acc_Id)
                .input('UserId', UserId)
                .query(`
                    UPDATE tbl_Acc_User_Mapping 
                    SET Acc_Id = @Acc_Id, UserId = @UserId 
                    WHERE id = @id
                `);
            const result = await request;
            if (result.rowsAffected[0] > 0) {
                success(res, 'Mapping updated successfully');
            } else {
                failed(res, 'Mapping not found');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteMapping = async (req, res) => {
        try {
            const { id } = req.body;
            if (!id) {
                return invalidInput(res, 'id is required');
            }

            const request = new sql.Request()
                .input('id', id)
                .query(`DELETE FROM tbl_Acc_User_Mapping WHERE id = @id`);
            const result = await request;
            if (result.rowsAffected[0] > 0) {
                success(res, 'Mapping deleted successfully');
            } else {
                failed(res, 'Mapping not found');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getMappings,
        addMapping,
        editMapping,
        deleteMapping
    };
};

export default accountUserMapping();
