import sql from 'mssql';
import { invalidInput, dataFound, failed, servError } from '../../res.mjs';

const CompanyAccess = () => {

    
    const getMYCompanyAccess = async (req, res) => {
        const { Auth } = req.query;
    
        if (!Auth) {
            return invalidInput(res, 'Auth is required');
        }
    
        try {
            const request = new sql.Request();
            request.input('Autheticate_Id', Auth);
    
            const result = await request.execute('DB_Name_Rights');
    
            if (result.recordset.length) {
                return dataFound(res, result.recordset)
            } else {
                return failed(res, 'No permission to access the company')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const postCompanyAccess =  async (req, res) => {
        const { UserId, Company_Id, View_Rights } = req.body;
    
        if (!UserId || !Company_Id || isNaN(View_Rights)) {
            return invalidInput(res, 'UserId, Company_Id, View_Rights is required')
        }
    
        try {
            const deleteQuery = `DELETE FROM tbl_DB_Name_Rights WHERE User_Id = '${UserId}' AND Company_Id = '${Company_Id}'`;
            await sql.query(deleteQuery);
            const insertQuery = `INSERT INTO tbl_DB_Name_Rights (User_Id, Company_Id, View_Rights) VALUES ('${UserId}', '${Company_Id}', '${View_Rights}')`;
            const result = await sql.query(insertQuery)
    
            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                return dataFound(res, [], 'Changes saved')
            } else {
                return failed(res, 'Failed to save changes')
            }
            
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getMYCompanyAccess,
        postCompanyAccess
    }
}

export default CompanyAccess()