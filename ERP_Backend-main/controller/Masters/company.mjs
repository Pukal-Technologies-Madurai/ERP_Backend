import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const companyControl = () => {

    const getCompanyDrowDown = async (req, res) => {
        const query = `SELECT Company_id AS ID, Company_Name AS Name FROM tbl_Company_Master WHERE Del_Flag = 0`;
        try {
            const result = await sql.query(query);
            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset);
            } else {
                return noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getCompany = async (req, res) => {
        const { Company_id } = req.query;
        
        try {
            let query = 'SELECT * FROM tbl_Company_Master WHERE Del_Flag = 0 ';

            if (checkIsNumber(Company_id)) {
                query += ' AND Company_id = @Company_id ';
            }
            const request = new sql.Request()
                .input('Company_id', Company_id)
                .query(query)

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const postCompany = async (req, res) => {
        const { Company_Code, Company_Name, Company_Address, State, Region, Pincode, Country, VAT_TIN_Number, PAN_Number, CST_Number, CIN_Number,
            Service_Tax_Number, MSME_Number, NSIC_Number, Account_Number, IFC_Code, Bank_Branch_Name, Bank_Name, Telephone_Number,
            Support_Number, Mail, Website, Gst_number, State_Code, State_No, Entry_By } = req.body;

        try {
            const request = new sql.Request();
            request.input('Mode', 1);
            request.input('Company_id', 0);
            request.input('Company_Code', Company_Code || null);
            request.input('Company_Name', Company_Name || null);
            request.input('Company_Address', Company_Address || null);
            request.input('State', State || null);
            request.input('Region', Region || null);
            request.input('Pincode', Pincode || null);
            request.input('Country', Country || null);
            request.input('VAT_TIN_Number', VAT_TIN_Number || null);
            request.input('PAN_Number', PAN_Number || null);
            request.input('CST_Number', CST_Number || null);
            request.input('CIN_Number', CIN_Number || null);
            request.input('Service_Tax_Number', Service_Tax_Number || null);
            request.input('MSME_Number', MSME_Number || null);
            request.input('NSIC_Number', NSIC_Number || null);
            request.input('Account_Number', Account_Number || null);
            request.input('IFC_Code', IFC_Code || null);
            request.input('Bank_Branch_Name', Bank_Branch_Name || null);
            request.input('Bank_Name', Bank_Name || null);
            request.input('Telephone_Number', Telephone_Number || null);
            request.input('Support_Number', Support_Number || null);
            request.input('Mail', Mail || null);
            request.input('Website', Website || null);
            request.input('Gst_number', Gst_number || null);
            request.input('State_Code', State_Code || null);
            request.input('State_No', State_No || null);
            request.input('Entry_By', Entry_By || null);

            const result = await request.execute('Company_SP');

            if (result.rowsAffected.length > 0) {
                success(res, 'Company added successfully');
            } else {
                failed(res, 'Failed to add company');
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const putCompany = async (req, res) => {
        const { Company_id, Company_Code, Company_Name, Company_Address, State, Region, Pincode, Country, VAT_TIN_Number, PAN_Number, CST_Number, CIN_Number,
            Service_Tax_Number, MSME_Number, NSIC_Number, Account_Number, IFC_Code, Bank_Branch_Name, Bank_Name, Telephone_Number,
            Support_Number, Mail, Website, Gst_number, State_Code, State_No, Entry_By } = req.body;

        if (!Company_id) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('Company_id', Company_id);
            request.input('Company_Code', Company_Code || null);
            request.input('Company_Name', Company_Name || null);
            request.input('Company_Address', Company_Address || null);
            request.input('State', State || null);
            request.input('Region', Region || null);
            request.input('Pincode', Pincode || null);
            request.input('Country', Country || null);
            request.input('VAT_TIN_Number', VAT_TIN_Number || null);
            request.input('PAN_Number', PAN_Number || null);
            request.input('CST_Number', CST_Number || null);
            request.input('CIN_Number', CIN_Number || null);
            request.input('Service_Tax_Number', Service_Tax_Number || null);
            request.input('MSME_Number', MSME_Number || null);
            request.input('NSIC_Number', NSIC_Number || null);
            request.input('Account_Number', Account_Number || null);
            request.input('IFC_Code', IFC_Code || null);
            request.input('Bank_Branch_Name', Bank_Branch_Name || null);
            request.input('Bank_Name', Bank_Name || null);
            request.input('Telephone_Number', Telephone_Number || null);
            request.input('Support_Number', Support_Number || null);
            request.input('Mail', Mail || null);
            request.input('Website', Website || null);
            request.input('Gst_number', Gst_number || null);
            request.input('State_Code', State_Code || null);
            request.input('State_No', State_No || null);
            request.input('Entry_By', Entry_By || null);

            const result = await request.execute('Company_SP');

            if (result.rowsAffected.length > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const deleteCompany = async (req, res) => {
        const { Company_id } = req.body;

        if (isNaN(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Company_id', Company_id);
            request.input('Company_Code', 0);
            request.input('Company_Name', 0);
            request.input('Company_Address', 0);
            request.input('State', 0);
            request.input('Region', 0);
            request.input('Pincode', 0);
            request.input('Country', 0);
            request.input('VAT_TIN_Number', 0);
            request.input('PAN_Number', 0);
            request.input('CST_Number', 0);
            request.input('CIN_Number', 0);
            request.input('Service_Tax_Number', 0);
            request.input('MSME_Number', 0);
            request.input('NSIC_Number', 0);
            request.input('Account_Number', 0);
            request.input('IFC_Code', 0);
            request.input('Bank_Branch_Name', 0);
            request.input('Bank_Name', 0);
            request.input('Telephone_Number', 0);
            request.input('Support_Number', 0);
            request.input('Mail', 0);
            request.input('Website', 0);
            request.input('Gst_number', 0);
            request.input('State_Code', 0);
            request.input('State_No', 0);
            request.input('Entry_By', 0);

            const result = await request.execute('Company_SP');

            if (result.rowsAffected.length > 0) {
                success(res, 'Company deleted')
            } else {
                failed(res, 'Failed to delete company')
            }
        } catch (e) {
            servError(e, res)
        }
    }

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
        getCompanyDrowDown,
        getCompany,
        postCompany,
        putCompany,
        deleteCompany,
        getMYCompanyAccess,
        postCompanyAccess,
    }
}



export default companyControl()