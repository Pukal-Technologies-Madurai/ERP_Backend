import sql from 'mssql';
import dotenv from 'dotenv';
import { dataFound, invalidInput, servError, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';
import { getUserIdByAuth } from '../../middleware/miniAPIs.mjs';
import userController from '../../controller/Masters/user.mjs';

dotenv.config();
const DATABASE = "ERP_DB_SMT_TEST";

const branchRight = () => {

    const getUserBranches = async (req, res) => {
        try {
            const { UserId } = req.query;
            if (!UserId) return invalidInput(res, 'UserId is required');
            if (!checkIsNumber(UserId)) return invalidInput(res, 'UserId must be a number');

            const query = `
                SELECT
                    b.BranchId AS id,
                    b.BranchName,
                    CASE WHEN ubr.User_Id IS NULL THEN 0 ELSE 1 END AS HasAccess,
                    ISNULL(ubr.Created_by, 0) AS Created_by,
                    ubr.Created_at
                FROM [${DATABASE}].[dbo].[tbl_Branch_Master] b
                LEFT JOIN [${DATABASE}].[dbo].[tbl_userbranchrights] ubr
                    ON ubr.Branch_Id = b.BranchId AND ubr.User_Id = @UserId
                ORDER BY b.BranchName
            `;

            const request = new sql.Request();
            request.input('UserId', sql.Int, Number(UserId));
            const result = await request.query(query);

            dataFound(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    /**
     * POST modify branch access for a single user/branch
     */
    const modifyUserBranch = async (req, res) => {
        const { UserId, BranchId, HasAccess } = req.body;
        const Auth = req.header('Authorization');

        if (UserId === undefined || BranchId === undefined || HasAccess === undefined) {
            return invalidInput(res, 'UserId, BranchId and HasAccess are required');
        }
        if (!checkIsNumber(UserId) || !checkIsNumber(BranchId)) {
            return invalidInput(res, 'UserId and BranchId must be numbers');
        }

        const accessFlag = Number(HasAccess) === 1 ? 1 : 0;
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const performingUserId = await getUserIdByAuth(Auth) || 0;

            if (accessFlag === 1) {
                const existsReq = new sql.Request(transaction);
                existsReq.input('UserId', sql.Int, Number(UserId));
                existsReq.input('BranchId', sql.Int, Number(BranchId));

                const existsQ = `
                    SELECT TOP 1 1 as ExistsFlag
                    FROM [${DATABASE}].[dbo].[tbl_userbranchrights]
                    WHERE User_Id = @UserId AND Branch_Id = @BranchId
                `;
                const existsRes = await existsReq.query(existsQ);

                if (existsRes.recordset.length === 0) {
                    const ins = new sql.Request(transaction);
                    ins.input('UserId', sql.Int, Number(UserId));
                    ins.input('BranchId', sql.Int, Number(BranchId));
                    ins.input('Created_by', sql.Int, Number(performingUserId));

                    const insertQ = `
                        INSERT INTO [${DATABASE}].[dbo].[tbl_userbranchrights]
                            (Branch_Id, User_Id, Created_by, Created_at)
                        VALUES
                            (@BranchId, @UserId, @Created_by, GETDATE())
                    `;
                    const insertResult = await ins.query(insertQ);

                    if (insertResult.rowsAffected[0] > 0) {
                        await transaction.commit();
                        return success(res, 'Branch access granted.');
                    } else {
                        throw new Error('Failed to grant branch access.');
                    }
                } else {
                    await transaction.commit();
                    return success(res, 'Branch access already granted.');
                }
            } else {
                const delReq = new sql.Request(transaction);
                delReq.input('UserId', sql.Int, Number(UserId));
                delReq.input('BranchId', sql.Int, Number(BranchId));

                const deleteQ = `
                    DELETE FROM [${DATABASE}].[dbo].[tbl_userbranchrights]
                    WHERE User_Id = @UserId AND Branch_Id = @BranchId
                `;
                await delReq.query(deleteQ);

                await transaction.commit();
                return success(res, 'Branch access removed.');
            }
        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    };

    /**
     * POST save all branch accesses in bulk
     */
    const saveAllUserBranches = async (req, res) => {
        const { UserId, Branches } = req.body;
        const Auth = req.header('Authorization');

        if (!UserId || !Array.isArray(Branches)) {
            return invalidInput(res, 'UserId and Branches array are required');
        }
        if (!checkIsNumber(UserId)) {
            return invalidInput(res, 'UserId must be a number');
        }

        const transaction = new sql.Transaction();
        try {
            await transaction.begin();
            const performingUserId = await getUserIdByAuth(Auth) || 0;

            for (const branch of Branches) {
                if (!checkIsNumber(branch.BranchId)) continue;
                const accessFlag = Number(branch.HasAccess) === 1 ? 1 : 0;

                if (accessFlag === 1) {
                    const existsReq = new sql.Request(transaction);
                    existsReq.input('UserId', sql.Int, Number(UserId));
                    existsReq.input('BranchId', sql.Int, Number(branch.BranchId));
                    const existsQ = `
                        SELECT TOP 1 1 as ExistsFlag
                        FROM [${DATABASE}].[dbo].[tbl_userbranchrights]
                        WHERE User_Id = @UserId AND Branch_Id = @BranchId
                    `;
                    const existsRes = await existsReq.query(existsQ);

                    if (existsRes.recordset.length === 0) {
                        const ins = new sql.Request(transaction);
                        ins.input('UserId', sql.Int, Number(UserId));
                        ins.input('BranchId', sql.Int, Number(branch.BranchId));
                        ins.input('Created_by', sql.Int, Number(performingUserId));

                        const insertQ = `
                            INSERT INTO [${DATABASE}].[dbo].[tbl_userbranchrights]
                                (Branch_Id, User_Id, Created_by, Created_at)
                            VALUES
                                (@BranchId, @UserId, @Created_by, GETDATE())
                        `;
                        await ins.query(insertQ);
                    }
                } else {
                    const delReq = new sql.Request(transaction);
                    delReq.input('UserId', sql.Int, Number(UserId));
                    delReq.input('BranchId', sql.Int, Number(branch.BranchId));
                    const deleteQ = `
                        DELETE FROM [${DATABASE}].[dbo].[tbl_userbranchrights]
                        WHERE User_Id = @UserId AND Branch_Id = @BranchId
                    `;
                    await delReq.query(deleteQ);
                }
            }

            await transaction.commit();
            return success(res, 'Branch access updated successfully.');
        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    };

    return {
        getUsers: userController.getUsers,
        getUserBranches,
        modifyUserBranch,
        saveAllUserBranches
    };
};

export default branchRight();
