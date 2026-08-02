import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const unitMasterMeasurementController = () => {

    const getMeasurements = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        m.UnitId,
                        m.CategoryId,
                        c.CategoryName,
                        m.UnitName,
                        m.UnitCode,
                        m.BaseFactor,
                        m.BaseUnitId,
                        b.UnitName AS BaseUnitName,
                        m.AllowDecimal,
                        m.IsBaseUnit,
                        m.IsSystem,
                        m.IsActive,
                        m.DisplayOrder
                    FROM 
                        tbl_Unit_Master_Measurement_Unit m
                    LEFT JOIN tbl_Unit_Master_Category c ON m.CategoryId = c.CategoryId
                    LEFT JOIN tbl_Unit_Master_Measurement_Unit b ON m.BaseUnitId = b.UnitId
                    ORDER BY 
                        m.DisplayOrder ASC, m.UnitName ASC
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

    const getActiveMeasurements = async (req, res) => {
        const { CategoryId } = req.query;

        try {
            const request = new sql.Request();
            let query = `
                SELECT 
                    UnitId,
                    UnitName,
                    UnitCode,
                    IsBaseUnit
                FROM 
                    tbl_Unit_Master_Measurement_Unit
                WHERE IsActive = 1
            `;

            if (CategoryId) {
                query += ` AND CategoryId = @CategoryId`;
                request.input('CategoryId', CategoryId);
            }

            query += ` ORDER BY DisplayOrder ASC, UnitName ASC`;

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const postMeasurement = async (req, res) => {
        const { 
            CategoryId, UnitName, UnitCode, BaseFactor, BaseUnitId, 
            AllowDecimal = 1, IsBaseUnit = 0, IsSystem = 0, IsActive = 1, DisplayOrder = 1 
        } = req.body;

        if (!CategoryId || !UnitName || !UnitCode || BaseFactor === undefined || BaseFactor === null) {
            return invalidInput(res, 'CategoryId, UnitName, UnitCode, and BaseFactor are required');
        }

        try {
            const request = new sql.Request();
            request.input('CategoryId', CategoryId);
            request.input('UnitName', UnitName);
            request.input('UnitCode', UnitCode);
            request.input('BaseFactor', BaseFactor);
            request.input('BaseUnitId', BaseUnitId || null);
            request.input('AllowDecimal', AllowDecimal);
            request.input('IsBaseUnit', IsBaseUnit);
            request.input('IsSystem', IsSystem);
            request.input('IsActive', IsActive);
            request.input('DisplayOrder', DisplayOrder);

            const query = `
                INSERT INTO tbl_Unit_Master_Measurement_Unit 
                (CategoryId, UnitName, UnitCode, BaseFactor, BaseUnitId, AllowDecimal, IsBaseUnit, IsSystem, IsActive, DisplayOrder) 
                VALUES 
                (@CategoryId, @UnitName, @UnitCode, @BaseFactor, @BaseUnitId, @AllowDecimal, @IsBaseUnit, @IsSystem, @IsActive, @DisplayOrder)
            `;

            const result = await request.query(query);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Measurement unit created successfully');
            } else {
                failed(res, 'Failed to create measurement unit');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const putMeasurement = async (req, res) => {
        const { 
            UnitId, CategoryId, UnitName, UnitCode, BaseFactor, BaseUnitId, 
            AllowDecimal, IsBaseUnit, IsSystem, IsActive, DisplayOrder 
        } = req.body;

        if (!UnitId || !CategoryId || !UnitName || !UnitCode || BaseFactor === undefined || BaseFactor === null) {
            return invalidInput(res, 'UnitId, CategoryId, UnitName, UnitCode, and BaseFactor are required')
        }

        try {
            const request = new sql.Request();
            request.input('UnitId', UnitId);
            request.input('CategoryId', CategoryId);
            request.input('UnitName', UnitName);
            request.input('UnitCode', UnitCode);
            request.input('BaseFactor', BaseFactor);
            request.input('BaseUnitId', BaseUnitId || null);
            request.input('AllowDecimal', AllowDecimal);
            request.input('IsBaseUnit', IsBaseUnit);
            request.input('IsSystem', IsSystem);
            request.input('IsActive', IsActive);
            request.input('DisplayOrder', DisplayOrder);

            const result = await request.query(`
                UPDATE tbl_Unit_Master_Measurement_Unit
                SET 
                    CategoryId = @CategoryId,
                    UnitName = @UnitName,
                    UnitCode = @UnitCode,
                    BaseFactor = @BaseFactor,
                    BaseUnitId = @BaseUnitId,
                    AllowDecimal = @AllowDecimal,
                    IsBaseUnit = @IsBaseUnit,
                    IsSystem = @IsSystem,
                    IsActive = @IsActive,
                    DisplayOrder = @DisplayOrder
                WHERE UnitId = @UnitId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Measurement unit updated successfully');
            } else {
                return failed(res, 'No changes were made, the Unit might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    const deleteMeasurement = async (req, res) => {
        const { UnitId } = req.body;

        if (!UnitId) {
            return invalidInput(res, 'UnitId is required')
        }

        try {
            const request = new sql.Request();
            request.input('UnitId', UnitId);

            // First check if this unit is used as a BaseUnitId by any other unit
            const checkQuery = `SELECT COUNT(*) as count FROM tbl_Unit_Master_Measurement_Unit WHERE BaseUnitId = @UnitId`;
            const checkResult = await request.query(checkQuery);
            if (checkResult.recordset[0].count > 0) {
                return failed(res, 'Cannot delete unit: It is used as a base unit for other measurement units.');
            }

            const result = await request.query(`
                DELETE FROM tbl_Unit_Master_Measurement_Unit WHERE UnitId = @UnitId
            `);

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Measurement unit deleted successfully');
            } else {
                return failed(res, 'No changes were made, the Unit might not exist');
            }
        } catch (e) {
            console.error('Database error:', e);
            return servError(e, res);
        }
    };

    return {
        getMeasurements,
        getActiveMeasurements,
        postMeasurement,
        putMeasurement,
        deleteMeasurement
    }
}

export default unitMasterMeasurementController();
