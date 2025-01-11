import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const CostCenter = () => {

    const getCostCenter = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT 
                    c.*,
                    COALESCE((
                        SELECT UserType FROM tbl_User_Type WHERE Id = c.User_Type
                    ), 'Not found') AS UserTypeGet,
                    COALESCE((
                        SELECT Name FROM tbl_Users WHERE UserId = c.User_Id 
                    ), 'Not found') AS UserGet
                FROM tbl_ERP_Cost_Center AS c
            `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const createCostCenter = async (req, res) => {
        const { Cost_Center_Name, User_Type, Is_Converted_To_User, User_Id } = req.body;
    
        if (!Cost_Center_Name || !User_Type) {
            return invalidInput(res, 'Cost_Center_Name, User_Type are required');
        }
    
        try {
            const getMaxIdResult = await new sql.Request()
                .query(`
                    SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Cost_Center_Id) ELSE 0 END AS MaxUserId 
                    FROM tbl_ERP_Cost_Center;
                `);
    
            const newCostCenterId = Number(getMaxIdResult.recordset[0].MaxUserId) + 1;
    
            
            let finalIsConvertedToUser = (Is_Converted_To_User == '' || Is_Converted_To_User == null) ? 0 : 1;
            
         
            let finalUserId = (User_Id == '' || User_Id == null) ? 0 : User_Id;
            if(finalUserId !=='' || finalUserId !==null){
                const request = new sql.Request()
               
                .input('User_Type', User_Type)
                .input('User_Id',finalUserId)
    
                .query(`
                    UPDATE tbl_Users SET UserTypeId=@User_Type WHERE UserId=@User_Id
                `);
               
            }
            const request = new sql.Request()
                .input('Cost_Center_Id', newCostCenterId) 
                .input('Cost_Center_Name', Cost_Center_Name)
                .input('User_Type', User_Type)
                .input('Is_Converted_To_User', finalIsConvertedToUser)
                .input('User_Id', finalUserId) 
    
                .query(`
                    INSERT INTO tbl_ERP_Cost_Center (
                        Cost_Center_Id, Cost_Center_Name, User_Type, Is_Converted_To_User, User_Id
                    ) VALUES (
                        @Cost_Center_Id, @Cost_Center_Name, @User_Type, @Is_Converted_To_User, @User_Id
                    );
                `);
    
            const result = await request;
    
            if (result.rowsAffected[0] > 0) {
                success(res, 'New Cost Center Created Successfully');
            } else {
                failed(res, 'Failed to create Cost Center');
            }
        } catch (e) {
            servError(e, res);
        }
    };
    
    const updateCostCenter = async (req, res) => {
        const { Cost_Center_Id,  Cost_Center_Name, User_Type } = req.body;

        if (!checkIsNumber(Cost_Center_Id) || !Cost_Center_Name || !User_Type) {
            return invalidInput(res, 'Cost_Center_Name, User_Type is required');
        }

        try {
            const request = new sql.Request()
                .input('Cost_Center_Id', Cost_Center_Id)
                .input('Cost_Center_Name', Cost_Center_Name)
                .input('User_Type', User_Type)
                .input('Is_Converted_To_User', 0)
                .query(`
                    UPDATE tbl_ERP_Cost_Center
                    SET
                        Cost_Center_Name = @Cost_Center_Name,
                        User_Type = @User_Type
                    WHERE
                        Cost_Center_Id = @Cost_Center_Id;
                    `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res, 'Failed to save changes')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getCostCenterCategory = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT *
                FROM tbl_ERP_Cost_Category
            `);

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }
    
    return {
        getCostCenter,
        createCostCenter,
        updateCostCenter,
        getCostCenterCategory
    }
}


export default CostCenter()