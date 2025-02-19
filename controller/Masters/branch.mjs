import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const branchController = () => {

    const getBranchDrowDown = async (req, res) => {

        try {
            const branch = (await new sql.Request()
                .query(`
                    SELECT 
                        BranchId, 
                        BranchName 
                    FROM 
                        tbl_Branch_Master 
                    WHERE 
                        Del_Flag = 0
                        `)
                    ).recordset;
                    // AND
                    // Company_id = @Comp

            if (branch.length > 0) {
                dataFound(res, branch)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getBranch = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        B.BranchId, 
                        B.Company_id, 
                        B.BranchCode, 
                        B.BranchName, 
                        B.Tele_Code, 
                        B.BranchTel1, 
                        B.Tele1_Code, 
                        B.BranchTel, 
                        B.BranchAddress, 
                        B.E_Mail,
                        B.BranchIncharge,
                        B.BranchIncMobile,
                        B.BranchCity,
                        B.Pin_Code,
                        B.State,
                        B.BranchCountry,
                        B.Entry_By,
                        B.Entry_Date,
                        B.Modified_By, 
                        B.Modified_Date,
                        B.Del_Flag,
                        B.Deleted_By,
                        B.Deleted_Date,
                        CM.Company_Code,
                        CM.Company_Name
                    FROM 
                        tbl_Branch_Master B,
                        tbl_Company_Master CM
                    WHERE 
                        B.Del_Flag = 0
                        AND
                        CM.Company_id = B.Company_id
                    `);
                // B.Company_id = CM.Company_id
                //     AND 

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const postBranch = async (req, res) => {
        const { Company_id, BranchCode, BranchName, Tele_Code, BranchTel1, Tele1_Code, BranchTel,
            BranchAddress, E_Mail, BranchIncharge, BranchIncMobile, BranchCity, Pin_Code, State, BranchCountry, Entry_By } = req.body;

        if (!BranchName || !Company_id) {
            return invalidInput(res, 'Branch_Name, Company_id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1);
            request.input('BranchId', 0);
            request.input('Company_id', Company_id);
            request.input('BranchCode', BranchCode);
            request.input('BranchName', BranchName);
            request.input('Tele_Code', Tele_Code);
            request.input('BranchTel1', BranchTel1);
            request.input('Tele1_Code', Tele1_Code);
            request.input('BranchTel', BranchTel);
            request.input('BranchAddress', BranchAddress);
            request.input('E_Mail', E_Mail);
            request.input('BranchIncharge', BranchIncharge);
            request.input('BranchIncMobile', BranchIncMobile);
            request.input('BranchCity', BranchCity);
            request.input('Pin_Code', Pin_Code);
            request.input('State', State);
            request.input('BranchCountry', BranchCountry);
            request.input('Entry_By', Entry_By);

            const result = await request.execute('Branch_Master_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Branch created successfully')
            } else {
                failed(res, 'Failed to create branch')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const putBranch = async (req, res) => {
        const { BranchId, Company_id, BranchCode, BranchName, Tele_Code, BranchTel1, Tele1_Code, BranchTel,
            BranchAddress, E_Mail, BranchIncharge, BranchIncMobile, BranchCity, Pin_Code, State, BranchCountry, Entry_By } = req.body;

        if (!BranchName || !Company_id || !BranchId) {
            return invalidInput(res, 'BranchName, BranchId, Company_id is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('BranchId', BranchId);
            request.input('Company_id', Company_id);
            request.input('BranchCode', BranchCode);
            request.input('BranchName', BranchName);
            request.input('Tele_Code', Tele_Code);
            request.input('BranchTel1', BranchTel1);
            request.input('Tele1_Code', Tele1_Code);
            request.input('BranchTel', BranchTel);
            request.input('BranchAddress', BranchAddress);
            request.input('E_Mail', E_Mail);
            request.input('BranchIncharge', BranchIncharge);
            request.input('BranchIncMobile', BranchIncMobile);
            request.input('BranchCity', BranchCity);
            request.input('Pin_Code', Pin_Code);
            request.input('State', State);
            request.input('BranchCountry', BranchCountry);
            request.input('Entry_By', Entry_By);

            const result = await request.execute('Branch_Master_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Branch updated successfully')
            } else {
                failed(res, 'Failed to save changes')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const deleteBranch = async (req, res) => {
        const { BranchID } = req.body;

        if (!BranchID) {
            return invalidInput(res, 'BranchID is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('BranchId', BranchID);
            request.input('Company_id', 0);
            request.input('BranchCode', 0);
            request.input('BranchName', 0);
            request.input('Tele_Code', 0);
            request.input('BranchTel1', 0);
            request.input('Tele1_Code', 0);
            request.input('BranchTel', 0);
            request.input('BranchAddress', 0);
            request.input('E_Mail', 0);
            request.input('BranchIncharge', 0);
            request.input('BranchIncMobile', 0);
            request.input('BranchCity', 0);
            request.input('Pin_Code', 0);
            request.input('State', 0);
            request.input('BranchCountry', 0);
            request.input('Entry_By', 0);

            const result = await request.execute('Branch_Master_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Branch deleted')
            } else {
                failed(res, 'Failed to delete branch')
            }
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getBranchDrowDown,
        getBranch,
        postBranch,
        putBranch,
        deleteBranch,
    }
}

export default branchController();