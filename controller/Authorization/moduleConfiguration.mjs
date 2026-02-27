import sql from 'mssql';
import { invalidInput, dataFound, failed, servError, sentData } from '../../res.mjs';
import dotenv from 'dotenv';
dotenv.config();

const userPortal = process.env.USERPORTALDB

export const getModuleConfiguration = async (req, res) => {
    try {
        if (!userPortal) {
            return failed(res, 'User Portal DB not configured')
        }
        const { moduleName } = req.query;
        const request = new sql.Request();
        const result = await request
            .input('moduleName', moduleName)
            .query(`
                SELECT
                    rules.*,
                    access.Sno,
	                COALESCE(access.ruleId, rules.id) AS ruleId,
	                COALESCE(access.getOption, 0) AS getOption,
	                COALESCE(access.createOption, 0) AS createOption,
	                COALESCE(access.updateOption, 0) AS updateOption,
	                COALESCE(access.deleteOption, 0) AS deleteOption,
	                COALESCE(access.modifiedAt, rules.createdOn) AS modifiedAt
                FROM [${userPortal}].[dbo].[tbl_Module_Rules] AS rules
                LEFT JOIN [dbo].[tbl_Module_Rules_Access] AS access ON access.ruleId = rules.id
                WHERE 1 = 1
                ${moduleName ? ` AND rules.moduleName = @moduleName ` : ''}
                ORDER BY rules.ruleNumber`
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

