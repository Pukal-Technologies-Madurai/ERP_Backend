import sql from 'mssql'
import { servError, sentData } from '../../res.mjs';



const getdefaultBanks = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                SELECT 
                    Bank_Id AS value, 
                    Bank_Name AS label 
                FROM tbl_Default_Bank
                WHERE Bank_Id <> 0
                ORDER BY Bank_Name;`
            )

        const result = await request;

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res);
    }
}


export default {
    getdefaultBanks
}