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

const getAccountNumber=async(req,res)=>{
    try{
             const request=new sql.Request()
             .query(`
             select bd.Id as value,  bd.Account_No as label,am.Account_name,bd.Acc_Id
             from tbl_Bank_Details bd
             LEFT JOIN tbl_Account_Master am ON am.Acc_Id=bd.Acc_Id
             where Bank_Name='TMB BANK'`)
                const result=await request;
                sentData(res,result.recordset)
    }
    catch(e){
        servError(e,res)
    }
}


export default {
    getdefaultBanks,
    getAccountNumber
}