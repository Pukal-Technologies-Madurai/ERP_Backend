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
            SELECT 
                am.Acc_Id, 
                am.Account_Name,
                CASE 
                    WHEN ag.parent_Ac_id = 16 THEN 'Creditor'
                    WHEN ag.parent_Ac_id = 20 THEN 'Debtor'
                    ELSE 'Other'
                END AS account_type
            FROM tbl_Account_Master am
            INNER JOIN tbl_Accounting_Group ag 
                ON am.Group_Id = ag.group_id
            WHERE ag.parent_Ac_id IN (16, 20)
        `;

            const result = await request.query(query);

            if (!result.recordset || result.recordset.length === 0) {
                return invalidInput(res, 'Enter Required Fields');
            }

            const response = {
                success: true,
                data: {
                    debtors: result.recordset.filter(acc => acc.account_type === 'Debtor'),
                    creditors: result.recordset.filter(acc => acc.account_type === 'Creditor')
                }
            };

            dataFound(res, response);

        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getDebtorsCrditors,
        getDebtorsCreditorsId
    }
}

export default DebitorsCreditors();