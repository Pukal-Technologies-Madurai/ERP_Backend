import sql from 'mssql';
import { servError, sentData, invalidInput, dataFound } from '../../res.mjs';


const DebitorsCreditors = () => {

    const getDebtorsCrditors = async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;

            if (!fromDate || !toDate) {
                return invalidInput(res, 'Enter Required Fields');
            }

            const result = await new sql.Request()
                .input("fromDate", sql.Date, fromDate)
                .input("toDate", sql.Date, toDate)
                .execute("Transaction_Debtors_Creditors_Reort_VW");

            if (result.recordset && result.recordset.length > 0) {
                return sentData(res, result.recordset);
            } else {
                return noData(res);
            }
        } catch (err) {
            servError(err, res);
        }
    };

    const getDebtorsCreditorsId = async (req, res) => {
        try {
            const request = new sql.Request();

            const query = `
            WITH RecursiveGroups AS (
                SELECT group_id, parent_Ac_id
                FROM tbl_Accounting_Group
                WHERE parent_Ac_id IN (16, 20)
                
                UNION ALL
                
                SELECT g.group_id, rg.parent_Ac_id
                FROM tbl_Accounting_Group g
                INNER JOIN RecursiveGroups rg 
                    ON g.parent_Ac_id = rg.group_id
                WHERE rg.parent_Ac_id IN (16, 20)
            )
            SELECT DISTINCT
                am.Acc_Id,
                am.Account_Name,
                CASE 
                    WHEN rg.parent_Ac_id = 16 THEN 'Creditor'
                    WHEN rg.parent_Ac_id = 20 THEN 'Debtor'
                END AS Account_Types
            FROM tbl_Account_Master am
            INNER JOIN RecursiveGroups rg 
                ON am.Group_Id = rg.group_id
            WHERE rg.parent_Ac_id IN (16, 20)
        `;

            const result = await request.query(query);

            if (!result.recordset || result.recordset.length === 0) {
                return invalidInput(res, 'No debtors or creditors found');
            }

            const response = {
                success: true,
                data: result.recordset
            };

            dataFound(res, response);

        } catch (e) {
            servError(e, res);
        }
    };

    const getDebtorsCreditorsAll = async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;

            if (!fromDate || !toDate) {
                return invalidInput(res, "Enter Required Fields");
            }

            const result1 = await new sql.Request()
                .input("fromDate", sql.Date, fromDate)
                .input("toDate", sql.Date, toDate)
                .execute("Transaction_Debtors_Creditors_Reort_VW");

            const balances = result1.recordset;

            if (!balances || balances.length === 0) {
                return noData(res);
            }


            const query2 = `
                WITH RecursiveGroups AS (
                    SELECT group_id, parent_Ac_id, 'Creditor' as Account_Types
                    FROM tbl_Accounting_Group
                    WHERE Group_Id IN (16)
			    UNION
                    SELECT group_id, parent_Ac_id, 'Debtor' as Account_Types
                    FROM tbl_Accounting_Group
                    WHERE Group_Id IN (20)
                UNION ALL
                    SELECT rg.group_id, rg.Parent_AC_id, Account_Types
                    FROM RecursiveGroups AS yd
                    JOIN tbl_Accounting_Group AS rg ON rg.Parent_AC_id = yd.Group_Id
                )
	            SELECT DISTINCT am.Acc_Id, am.Account_Name,  rg1.Account_Types
                FROM tbl_Account_Master am, tbl_Accounting_Group G, RecursiveGroups rg1 
		        WHERE 
                    am.Group_Id =G.Group_Id 
		            AND g.Group_Id = rg1 .Group_Id 
		            AND am.Group_Id IN (select Group_Id from RecursiveGroups rg)`;

            const result2 = await new sql.Request().query(query2);
            const accountTypes = result2.recordset;


            const merged = balances.map((bal) => {
                const accType = accountTypes.find(
                    (at) => String(at.Acc_Id) === String(bal.Acc_Id)
                );
                return {
                    ...bal,
                    Account_Types: accType ? accType.Account_Types : null,
                    Account_Name: accType ? accType.Account_Name : bal.Account_name,
                };
            });

            return sentData(res, merged);
        } catch (err) {
            servError(err, res);
        }
    };

    const getDebtors = async (req, res) => {
        try {

            const result = await new sql.Request().query(`
                SELECT * FROM dbo.Acc_SD_Fn_2()`);

            if (!result.recordset || result.recordset.length === 0) {
                return failed(res, "No data found");
            }

            sentData(res, result.recordset);
        } catch (err) {
            servError(err, res);
        }
    }
    
    return {
        getDebtorsCrditors,
        getDebtorsCreditorsId,
        getDebtorsCreditorsAll,
        getDebtors
    }
}

export default DebitorsCreditors();