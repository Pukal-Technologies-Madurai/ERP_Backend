import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const unitMasterCategoryController = () => {

    const getCategories = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        CategoryId,
                        CategoryName,
                        Description,
                        IsSystem,
                        IsActive,
                        CreatedDate
                    FROM 
                        tbl_Unit_Master_Category
                    ORDER BY 
                        CategoryName ASC
                `);

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

    const getActiveCategories = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        CategoryId,
                        CategoryName
                    FROM 
                        tbl_Unit_Master_Category
                    WHERE IsActive = 1
                    ORDER BY CategoryName ASC
                `);

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

    const postCategory = async (req, res) => {
        const { CategoryName, Description, IsSystem = 0, IsActive = 1 } = req.body;

        if (!CategoryName) {
            return invalidInput(res, 'CategoryName is required');
        }

        try {
            const request = new sql.Request();
            request.input('CategoryName', CategoryName);
            request.input('Description', Description || null);
            request.input('IsSystem', IsSystem);
            request.input('IsActive', IsActive);

            const query = `
                INSERT INTO tbl_Unit_Master_Category 
                (CategoryName, Description, IsSystem, IsActive, CreatedDate) 
                VALUES 
                (@CategoryName, @Description, @IsSystem, @IsActive, GETDATE())
            `;

            const result = await request.query(query);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Category created successfully');
            } else {
                failed(res, 'Failed to create Category');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putCategory = async (req, res) => {
        const { CategoryId, CategoryName, Description, IsSystem, IsActive } = req.body;

        if (!CategoryId || !CategoryName) {
            return invalidInput(res, 'CategoryId and CategoryName are required')
        }

        try {
            const request = new sql.Request();
            request.input('CategoryId', CategoryId);
            request.input('CategoryName', CategoryName);
            request.input('Description', Description || null);
            request.input('IsSystem', IsSystem);
            request.input('IsActive', IsActive);

            const result = await request.query(`
                UPDATE tbl_Unit_Master_Category
                SET 
                    CategoryName = @CategoryName,
                    Description = @Description,
                    IsSystem = @IsSystem,
                    IsActive = @IsActive
                WHERE CategoryId = @CategoryId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Category updated successfully');
            } else {
                return failed(res, 'No changes were made, the Category might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    const deleteCategory = async (req, res) => {
        const { CategoryId } = req.body;

        if (!CategoryId) {
            return invalidInput(res, 'CategoryId is required')
        }

        try {
            const request = new sql.Request();
            request.input('CategoryId', CategoryId);

            const checkQuery = `SELECT COUNT(*) as count FROM tbl_Unit_Master_Measurement_Unit WHERE CategoryId = @CategoryId`;
            const checkResult = await request.query(checkQuery);
            if (checkResult.recordset[0].count > 0) {
                return failed(res, 'Cannot delete category: Measurement units are associated with it.');
            }

            const result = await request.query(`
                DELETE FROM tbl_Unit_Master_Category WHERE CategoryId = @CategoryId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Category deleted successfully');
            } else {
                return failed(res, 'No changes were made, the Category might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    return {
        getCategories,
        getActiveCategories,
        postCategory,
        putCategory,
        deleteCategory
    }
}

export default unitMasterCategoryController();
