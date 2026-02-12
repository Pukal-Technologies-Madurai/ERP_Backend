import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, randomNumber } from '../../helper_functions.mjs';


const accountMaster = () => {

    const getAccountGroups = async (req, res) => {
        try {
            const { excludeNotMaped = 0 } = req.query;
            const request = new sql.Request()
                .query(`
                    SELECT * 
                    FROM tbl_Accounting_Group
                    ${isEqualNumber(excludeNotMaped, 1) ? ' WHERE Group_Id IN (SELECT DISTINCT Group_Id FROM tbl_Account_Master) ' : ''}
                    ORDER BY Group_Name;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res)
        }
    }

    const getAccounts = async (req, res) => {

        try {
            const { Acc_Id, Group_Id } = req.query;

            const request = new sql.Request()
                .input('Acc_Id', Acc_Id)
                .input('Group_Id', Group_Id)
                .query(`
                    SELECT 
                        a.Acc_Id,
                        a.Account_name,
                        a.Group_Id,
                        COALESCE(ag.Group_Name, 'Not found') AS Group_Name,
                        a.creditLimit,
                        a.creditDays,
                        a.percentageValue
                    FROM tbl_Account_Master AS a 
                    LEFT JOIN tbl_Accounting_Group AS ag ON ag.Group_Id = a.Group_Id
                    WHERE a.Acc_Id IS NOT NULL
                    ${checkIsNumber(Acc_Id) ? ' AND a.Acc_Id = @Acc_Id ' : ' '}
                    ${checkIsNumber(Group_Id) ? ' AND a.Group_Id = @Group_Id ' : ' '}
                    ORDER BY a.Account_name;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res)
        }
    }

    const getAccountDetails = async (req, res) => {
        try {

            const request = new sql.Request()
                .query(`
                    SELECT 
                        a.Acc_Id,
                        a.Account_name,
                        a.Account_Alias_Name,
                        a.Group_Id,
                        a.creditLimit,
                        a.creditDays,
                        a.percentageValue,
                        COALESCE(ag.Group_Name, 'Not found') AS Group_Name
                    FROM tbl_Account_Master AS a 
                    LEFT JOIN tbl_Accounting_Group AS ag
                        ON ag.Group_Id = a.Group_Id
                  WHERE Acc_Id IS NOT NULL
                    ORDER BY a.Account_name`
                );

            const result = await request;

            sentData(res, result.recordset);

        }
        catch (error) {
            servError(error, res)
        }
    }

    const getAccountsByGroups = async (req, res) => {
        try {
            const csv = String(
                req.query.groupIds ??
                (req.query.recursiveGroup ? String(req.query.recursiveGroup) : '')
            ).trim();

            if (!csv) return invalidInput(res, 'groupIds or recursiveGroup is required');

            const request = new sql.Request().input('GroupIds', sql.VarChar, csv);

            const result = await request.query(`
            -- Parse seeds
                DECLARE @ids TABLE (Group_Id INT PRIMARY KEY);
                INSERT INTO @ids (Group_Id)
                SELECT DISTINCT TRY_CAST(value AS INT)
                FROM STRING_SPLIT(@GroupIds, ',')
                WHERE TRY_CAST(value AS INT) IS NOT NULL;
            -- Cycle-safe recursive CTE with path tracking
                ;WITH GroupTree AS (
                    SELECT 
                        g.Group_Id,
                        g.Parent_AC_id,
                        CAST(CONCAT('/', g.Group_Id, '/') AS varchar(4000)) AS Path,
                        0 AS Lvl
                    FROM dbo.tbl_Accounting_Group g
                    WHERE g.Group_Id IN (SELECT Group_Id FROM @ids)
                    UNION ALL
                    SELECT 
                        cg.Group_Id,
                        cg.Parent_AC_id,
                        CAST(gt.Path + CAST(cg.Group_Id AS varchar(20)) + '/' AS varchar(4000)) AS Path,
                        gt.Lvl + 1
                    FROM dbo.tbl_Accounting_Group cg
                    JOIN GroupTree gt ON cg.Parent_AC_id = gt.Group_Id
                    WHERE CHARINDEX('/' + CAST(cg.Group_Id AS varchar(20)) + '/', gt.Path) = 0
                -- prevent cycles: don't revisit a node already in the current path
                )
                SELECT 
                    DISTINCT a.Acc_Id, 
                    a.Account_name, 
                    a.Account_Alias_name, 
                    a.Group_Id,
                    a.ERP_Id, 
                    a.Alter_Id, 
                    a.Created_By, 
                    a.Created_Time, 
                    a.Alter_By, 
                    a.Alter_Time
                FROM GroupTree gt
                JOIN dbo.tbl_Account_Master a ON a.Group_Id = gt.Group_Id
                ORDER BY a.Account_name
                OPTION (MAXRECURSION 32767); -- allow deep but finite trees`);

            return sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    const createAccount = async (req, res) => {
        try {
            const {
                Account_name,
                Account_Alias_Name,
                Group_Id,
                Created_By,
                creditLimit,
                creditDays,
                percentageValue
            } = req.body;
            if (!Account_name || !Group_Id) {
                return invalidInput(res, 'Account_name, Group_Id, and Created_By are required');
            }

            const getMaxIdRequest = new sql.Request();
            const maxIdResult = await getMaxIdRequest.query(`
                SELECT ISNULL(MAX(Acc_Id), 0) + 1 AS NextAccId FROM tbl_Account_Master`
            );

            const Acc_Id = maxIdResult.recordset[0].NextAccId;
            const Alter_Id = randomNumber();
            const Created_Time = new Date();
            const insertRequest = new sql.Request()
                .input('Acc_Id', sql.Int, Acc_Id)
                .input('Account_name', sql.VarChar, Account_name)
                .input('Account_Alias_Name', sql.VarChar, Account_Alias_Name)
                .input('Group_Id', sql.Int, Group_Id)
                .input('creditLimit', sql.Decimal(18, 2), parseFloat(creditLimit) || 0) 
                .input('percentageValue', sql.Decimal(5, 2), parseFloat(percentageValue) || 0) 
                .input('creditDays', sql.Int, parseInt(creditDays) || 0)
                .input('Alter_Id', sql.Int, Alter_Id)
                .input('Created_By', sql.VarChar, Created_By)
                .input('Created_Time', sql.DateTime, Created_Time)

            await insertRequest.query(`
                INSERT INTO tbl_Account_Master (
                    Acc_Id, Account_name, Account_Alias_Name, Group_Id,creditLimit,percentageValue,creditDays
                    Alter_Id, Created_By, Created_Time
                ) VALUES (
                    @Acc_Id, @Account_name, @Account_Alias_Name, @Group_Id,@creditLimit,@percentageValue,@creditDays
                    @Alter_Id, @Created_By, @Created_Time
                );`
            );

            success(res, 'Account created successfully.');

        } catch (error) {
            servError(error, res);
        }
    };

    const updateAccountDetails = async (req, res) => {
        try {
            const {
                Acc_Id,
                Account_name,
                Account_Alias_Name,
                Group_Id,
                Alter_By,
                   creditLimit,
                creditDays,
                percentageValue
            } = req.body;



            if (!Acc_Id || !Account_name || !Group_Id) {
                return invalidInput(res, 'Acc_Id, Account_name, and Group_Id are required');
            }

            const Alter_Id = randomNumber();
            const request = new sql.Request()
                .input('Acc_Id', sql.Int, Acc_Id)
                .input('Account_name', sql.NVarChar, Account_name)
                .input('Account_Alias_Name', sql.NVarChar, Account_Alias_Name)
                .input('Group_Id', sql.Int, Number(Group_Id))
                .input('creditLimit', sql.Decimal(18, 2), parseFloat(creditLimit) || 0) 
                .input('creditDays', sql.Int, parseInt(creditDays) || 0) 
                .input('percentageValue', sql.Decimal(5, 2), parseFloat(percentageValue) || 0)
                .input('Alter_Id', sql.Int, Alter_Id)
                .input('Alter_By', sql.Int, Number(Alter_By))
                .input('Alter_Time', sql.DateTime, new Date());

            await request.query(`
            UPDATE tbl_Account_Master
            SET 
                Account_name = @Account_name,
                Account_Alias_Name = @Account_Alias_Name,
                Group_Id = @Group_Id,
                creditLimit=@creditLimit,
                creditDays=@creditDays,
                percentageValue=@percentageValue,
                Alter_Id = @Alter_Id,
                Alter_By = @Alter_By,
                Alter_Time = @Alter_Time
            WHERE Acc_Id = @Acc_Id`
            );

            success(res, 'Account details updated successfully');

        } catch (error) {

            servError(error, res);
        }
    };

    const deleteAccountDetails = async (req, res) => {
        try {
            const { Acc_Id } = req.body;

            if (!Acc_Id) {
                return invalidInput(res, "Acc_Id is Required");
            }

            const request = new sql.Request()
                .input('Acc_Id', sql.Int, Acc_Id);

            const result = await request.query(`
                DELETE FROM tbl_Account_Master
                WHERE Acc_Id = @Acc_Id`
            );

            if (result.rowsAffected[0] === 0) {
                return failed(res, 'No data');
            }

            success(res, { message: 'Account deleted successfully.' });

        } catch (error) {
            servError(error, res);
        }

    }

    const accountingGroupDropDown = async (req, res) => {
        try {
            const request = new sql.Request();
            const result = await request.query(`SELECT Group_Id AS value, Group_Name AS label FROM tbl_Accounting_Group`);

            sentData(res, result.recordset);

        } catch (error) {

            servError(error, res);
        }
    };

    return {
        getAccountGroups,
        getAccounts,
        getAccountDetails,
        getAccountsByGroups,
        updateAccountDetails,
        deleteAccountDetails,
        createAccount,
        accountingGroupDropDown
    }
}

export default accountMaster()