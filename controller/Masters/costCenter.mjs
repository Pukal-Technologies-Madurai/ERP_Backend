import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';


const costCenter = () => {

    const getCostDropDown = async (req, res) => {
        const query = `SELECT Cost_Center_Id AS value, Cost_Center_Name AS label FROM tbl_ERP_Cost_Center`;
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

    const getCostCenter = async (req, res) => {


        try {
            let query = `
SELECT 
    cc.*,
	ecc.Cost_Center_Name,
	ecc.Cost_Center_Id as value
FROM 
    tbl_Cost_Center_Master cc
LEFT JOIN 
    tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = cc.ERP_Cost_Center_Id
LEFT JOIN 
    tbl_User_Type ut ON ut.Id = ecc.User_Type  -- Join to UserType table`;


            const request = new sql.Request()
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

    const putCostcenter = async (req, res) => {
        const { CO_Id, value } = req.body;

        if (!CO_Id) {
            return invalidInput(res, 'CO_Id is required');
        }

        try {
            const request = new sql.Request();
            request.input('CO_Id', CO_Id);
            request.input('value', value);
            let query = `update tbl_Cost_Center_Master set ERP_Cost_Center_Id=@value where CO_Id=@Co_Id`

            const result = await request.query(query);

            if (result.rowsAffected.length > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    return {
        getCostDropDown,
        getCostCenter,
        putCostcenter

    }
}



export default costCenter()