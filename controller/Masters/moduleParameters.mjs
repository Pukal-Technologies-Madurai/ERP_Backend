import sql from 'mssql';
import { invalidInput, failed, success, servError, sentData } from '../../res.mjs';

const moduleParameters = () => {

    const getModuleParameters = async (req, res) => {
        try {
            const { moduleName } = req.query;

            const request = new sql.Request()
                .input('moduleName', sql.NVarChar, moduleName || '')
                .query(`
                    SELECT 
                        mp.paramID,
                        mp.numID,
                        mp.parameterName,
                        mp.dataType,
                        mp.moduleName,
                        mp.defaultValue,
                        mp.createdAt,
                        mp.createdBy,
                        cb.Name createdByGet
                    FROM tbl_Module_Parameters mp
                    LEFT JOIN tbl_Users AS cb ON cb.UserId = mp.createdBy
                    WHERE 1 = 1
                    ${moduleName ? ` AND (mp.moduleName = @moduleName OR mp.moduleName = 'COMMON')` : ''}
                    ORDER BY mp.numID ASC;
                `);

            const result = await request;
            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    const addModuleParameter = async (req, res) => {
        const { parameterName, dataType, moduleName, defaultValue, createdBy } = req.body;

        if (!parameterName || !dataType || !moduleName) {
            return invalidInput(res, 'parameterName, dataType, and moduleName are required');
        }

        try {
            const maxIdResult = await new sql.Request().query(`
                SELECT ISNULL(MAX(numID), 0) + 1 AS numID FROM tbl_Module_Parameters
            `);

            const numID = maxIdResult.recordset[0].numID;

            const request = new sql.Request()
                .input('numID', sql.BigInt, numID)
                .input('parameterName', sql.NVarChar, parameterName)
                .input('dataType', sql.NVarChar, dataType)
                .input('moduleName', sql.NVarChar, moduleName)
                .input('defaultValue', sql.NVarChar, defaultValue || '')
                .input('createdAt', sql.DateTimeOffset, new Date())
                .input('createdBy', sql.Int, createdBy)
                .query(`
                    INSERT INTO tbl_Module_Parameters (
                        paramID, numID, parameterName, dataType, moduleName, defaultValue, createdAt, createdBy
                    ) VALUES (
                        NEWID(), @numID, @parameterName, @dataType, @moduleName, @defaultValue, @createdAt, @createdBy
                    );
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Module Parameter Added');
            } else {
                failed(res, 'Failed to Create Module Parameter');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const editModuleParameter = async (req, res) => {
        const { paramID, parameterName, dataType, moduleName, defaultValue } = req.body;

        if (!paramID || !parameterName || !dataType || !moduleName) {
            return invalidInput(res, 'paramID, parameterName, dataType, and moduleName are required');
        }

        try {
            const result = await new sql.Request()
                .input('paramID', sql.UniqueIdentifier, paramID)
                .input('parameterName', sql.NVarChar, parameterName)
                .input('dataType', sql.NVarChar, dataType)
                .input('moduleName', sql.NVarChar, moduleName)
                .input('defaultValue', sql.NVarChar, defaultValue || '')
                .query(`
                    UPDATE tbl_Module_Parameters 
                    SET 
                        parameterName = @parameterName,
                        dataType = @dataType,
                        moduleName = @moduleName,
                        defaultValue = @defaultValue
                    WHERE paramID = @paramID
                `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Module Parameter updated successfully');
            } else {
                failed(res, 'No parameter found with the provided ID');
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const deleteModuleParameter = async (req, res) => {
        const { paramID } = req.body;
        
        if (!paramID) {
            return invalidInput(res, 'paramID is required');
        }

        try {
            const request = new sql.Request()
                .input('paramID', sql.UniqueIdentifier, paramID)
                .query(`
                    DELETE FROM tbl_Module_Parameters 
                    WHERE paramID = @paramID
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Module Parameter deleted successfully');
            } else {
                failed(res, 'No parameter found with the provided ID');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getModuleParameters,
        addModuleParameter,
        editModuleParameter,
        deleteModuleParameter
    };
};

export default moduleParameters();
