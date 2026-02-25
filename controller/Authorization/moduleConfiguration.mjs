import sql from 'mssql';
import { invalidInput, dataFound, failed, servError, sentData } from '../../res.mjs';

export const getModuleConfiguration = async (req, res) => {
    try {
        const { moduleName } = req.query;
        const request = new sql.Request();
        const result = await request
            .input('moduleName', moduleName)
            .query(`
                SELECT mr.*, u.Name AS createdByGet
                FROM tbl_Module_Rules AS mr
                JOIN tbl_Users AS u ON mr.createdBy = u.UserId
                WHERE 1 = 1
                ${moduleName ? ` AND mr.moduleName = @moduleName ` : ''}`
            );

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res)
    }
}

export const postModuleConfiguration = async (req, res) => {
    try {
        const { moduleName, ruleName, discription, ruleValue, createdBy } = req.body;
        if (!moduleName || !ruleName || !ruleValue || !createdBy) {
            return invalidInput(res, 'moduleName, ruleName, ruleValue, createdBy is required')
        }
        
        const request = new sql.Request();
        const result = await request
            .input('moduleName', sql.NVarChar(50), moduleName)
            .input('ruleName', sql.NVarChar(150), ruleName)
            .input('discription', sql.NVarChar(250), discription)
            .input('ruleValue', sql.NVarChar(250), ruleValue)
            .input('createdBy', sql.Int, createdBy)
            .query(`
                INSERT INTO tbl_Module_Rules (
                    moduleName, ruleName, discription, ruleValue, createdBy
                ) VALUES (
                    @moduleName, @ruleName, @discription, @ruleValue, @createdBy
                );`
            );

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res)
    }
}

export const putModuleConfiguration = async (req, res) => {
    try {
        const { id, moduleName, ruleName, discription, ruleValue } = req.body;
        if (!id || !moduleName || !ruleName || !ruleValue) {
            return invalidInput(res, 'id, moduleName, ruleName, ruleValue is required')
        }
        
        const request = new sql.Request();
        const result = await request
            .input('id', sql.UniqueIdentifier, id)
            .input('moduleName', sql.NVarChar(50), moduleName)
            .input('ruleName', sql.NVarChar(150), ruleName)
            .input('discription', sql.NVarChar(250), discription)
            .input('ruleValue', sql.NVarChar(250), ruleValue)
            .query(`
                UPDATE tbl_Module_Rules
                SET moduleName = @moduleName,
                    ruleName = @ruleName,
                    discription = @discription,
                    ruleValue = @ruleValue
                WHERE id = @id`
            );

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res)
    }
}

