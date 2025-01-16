import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const CostCenter = () => {

    const getCostCenter = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT 
                    c.*,
                    COALESCE(cc.Cost_Category, 'Not found') AS UserTypeGet,
                    COALESCE(u.Name, 'Not found') AS UserGet
                FROM tbl_ERP_Cost_Center AS c
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = c.User_Type
                LEFT JOIN tbl_Users AS u
                    ON u.UserId = c.User_Id;

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
            if (finalUserId !== '' || finalUserId !== null) {
                const request = new sql.Request()

                    .input('User_Type', User_Type)
                    .input('User_Id', finalUserId)

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
        const { Cost_Center_Id, Cost_Center_Name, User_Type } = req.body;

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

    const createCostCategory = async (req, res) => {
        const { Cost_Category } = req.body;

        if (!Cost_Category) {
            return invalidInput(res, 'Cost_Category are required');
        }

        try {
            const getMaxIdResult = await new sql.Request()
                .query(`
                    SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Cost_Category_Id) ELSE 0 END AS MaxCategoryId 
                    FROM tbl_ERP_Cost_Category;
                `);

            const newCostCenterId = Number(getMaxIdResult.recordset[0].MaxCategoryId) + 1;

            const request = new sql.Request()
                .input('Cost_Category_Id', newCostCenterId)
                .input('Cost_Category', Cost_Category)
                .query(`
                    INSERT INTO tbl_ERP_Cost_Category (
                        Cost_Category_Id, Cost_Category
                    ) VALUES (
                        @Cost_Category_Id, @Cost_Category
                    );
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Cost Category Created Successfully');
            } else {
                failed(res, 'Failed to create Cost Category');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteCostCategory = async (req, res) => {
        const { Cost_Category_Id } = req.body;

        if (!checkIsNumber(Cost_Category_Id)) {
            return invalidInput(res, 'Cost_Category_Id must be a valid number');
        }

        try {
            const request = new sql.Request();
            request.input('Cost_Category_Id', sql.Int, Cost_Category_Id);

            const result = await request.query(`
            DELETE FROM tbl_ERP_Cost_Category 
            WHERE Cost_Category_Id = @Cost_Category_Id;
        `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Cost_Category deleted successfully');
            } else {
                failed(res, 'No Cost_Category found to delete');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const updateCostCategory = async (req, res) => {
        const { Cost_Category_Id, Cost_Category } = req.body;

        if (!checkIsNumber(Cost_Category_Id)) {
            return invalidInput(res, 'Cost_Category_Id required');
        }

        try {
            const request = new sql.Request()
                .input('Cost_Category_Id', Cost_Category_Id)
                .input('Cost_Category', Cost_Category)
                .query(`
                UPDATE tbl_ERP_Cost_Category
                SET
                    Cost_Category = @Cost_Category
                WHERE
                    Cost_Category_Id = @Cost_Category_Id;
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

    const costCategoryDropDown = async (req, res) => {
        try {
            const result = await sql.query(`
             SELECT Cost_Category_Id as value, Cost_Category as label FROM tbl_ERP_Cost_Category
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

    return {
        getCostCenter,
        createCostCenter,
        updateCostCenter,
        getCostCenterCategory,
        createCostCategory,
        deleteCostCategory,
        updateCostCategory,
        costCategoryDropDown,
    }
}


export default CostCenter()