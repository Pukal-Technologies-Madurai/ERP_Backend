import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber, randomNumber } from '../../helper_functions.mjs';

const whatsapp = () => {

    const getWhatsappTypes =async(req,res)=>{
         try {
        const result = await new sql.Request()
            .query(`SELECT Id, WhatsappType, Created_by, Updated_by, Created_Time, Updated_Time 
                    FROM tbl_Whatsapp_Types 
                    ORDER BY Id`);

        return res.status(200).json({
            success: true,
            data: result.recordset,
            message: 'WhatsApp types fetched successfully'
        });
    } catch (e) {
        servError(e, res);
    }
    }

    // const getWhatsappMethod= async (req, res) => {
    //    try {
              
    //     //    const { WhatsappType_Id } = req.query;

    //     // if (!WhatsappType_Id) {
    //     //     return invalidInput(res, 'WhatsappType_Id is required');
    //     // }

    //     const result = await new sql.Request()
    //     //   --  .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
    //         .query(`SELECT  * FROM [tbl_Whatsapp_Service] wm `);

    //     return res.status(200).json({
    //         success: true,
    //         data: result.recordset,
    //         message: 'WhatsApp methods fetched successfully'
    //     });
    // } catch (e) {
    //     servError(e, res);
    // }
    // };

const addWhatsappMethod = async (req, res) => {
    try {
        const { Service_Id, WhatsappType_Id, Status, lang_Id } = req.body;

        if (!WhatsappType_Id || !Service_Id) {
            return invalidInput(res, 'WhatsappType_Id and Service_Id are required');
        }

        // Step 1: Deactivate ALL rows for this WhatsappType_Id
        await new sql.Request()
            .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
            .query(`UPDATE tbl_WhatsappMethod SET Status = 0 WHERE WhatsappType_Id = @WhatsappType_Id`);

        // Step 2: Check if a row already exists for this type + service combo
        const existing = await new sql.Request()
            .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
            .input('Service_Id', sql.Int, Service_Id)
            .query(`SELECT Id FROM tbl_WhatsappMethod WHERE WhatsappType_Id = @WhatsappType_Id AND Service_Id = @Service_Id`);

        let result;

        if (existing.recordset.length > 0) {
            // Row exists for this service → UPDATE Status + lang_Id
            result = await new sql.Request()
                .input('Id', sql.Int, existing.recordset[0].Id)
                .input('Status', sql.Int, Status ?? 1)
                .input('lang_Id', sql.Int, lang_Id)
                .query(`UPDATE tbl_WhatsappMethod SET Status = @Status, lang_Id = @lang_Id WHERE Id = @Id`);
        } else {
            // No row for this service → INSERT new
            result = await new sql.Request()
                .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
                .input('Service_Id', sql.Int, Service_Id)
                .input('Status', sql.Int, Status ?? 1)
                .input('lang_Id', sql.Int, lang_Id)
                .query(`INSERT INTO tbl_WhatsappMethod (WhatsappType_Id, Service_Id, Status, lang_Id)
                        VALUES (@WhatsappType_Id, @Service_Id, @Status, @lang_Id)`);
        }

        if (result.rowsAffected[0] > 0) {
            return success(res, 'WhatsApp method saved successfully');
        } else {
            return failed(res, 'Failed to save WhatsApp method');
        }

    } catch (e) {
        servError(e, res);
    }
};


const updateWhatsappMethod = async (req, res) => {
    try {
        const { Id, Status, WhatsappType_Id, lang_Id, Service_Id } = req.body;

        if (!WhatsappType_Id || !Service_Id) {
            return invalidInput(res, 'WhatsappType_Id and Service_Id are required');
        }

        // Step 1: Deactivate ALL rows for this WhatsappType_Id
        await new sql.Request()
            .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
            .query(`UPDATE tbl_WhatsappMethod SET Status = 0 WHERE WhatsappType_Id = @WhatsappType_Id`);

        // Step 2: Check if a row exists for this type + service combo
        const existing = await new sql.Request()
            .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
            .input('Service_Id', sql.Int, Service_Id)
            .query(`SELECT Id FROM tbl_WhatsappMethod WHERE WhatsappType_Id = @WhatsappType_Id AND Service_Id = @Service_Id`);

        let result;

        if (existing.recordset.length > 0) {
            // Update the existing row for this service
            result = await new sql.Request()
                .input('Id', sql.Int, existing.recordset[0].Id)
                .input('Status', sql.Int, Status ?? 1)
                .input('lang_Id', sql.Int, lang_Id)
                .query(`UPDATE tbl_WhatsappMethod SET Status = @Status, lang_Id = @lang_Id WHERE Id = @Id`);
        } else {
            // This service doesn't have a row yet → INSERT
            result = await new sql.Request()
                .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
                .input('Service_Id', sql.Int, Service_Id)
                .input('Status', sql.Int, Status ?? 1)
                .input('lang_Id', sql.Int, lang_Id)
                .query(`INSERT INTO tbl_WhatsappMethod (WhatsappType_Id, Service_Id, Status, lang_Id)
                        VALUES (@WhatsappType_Id, @Service_Id, @Status, @lang_Id)`);
        }

        if (result.rowsAffected[0] > 0) {
            return success(res, 'WhatsApp method updated successfully');
        } else {
            return failed(res, 'Failed to update WhatsApp method');
        }

    } catch (e) {
        servError(e, res);
    }
};



const getWhatsappServices = async (req, res) => {
    try {
        const result = await new sql.Request()
            .query(`
                SELECT Id, WhatsappService, Status 
                FROM tbl_Whatsapp_Service 
                WHERE Status = 1
                ORDER BY Id
            `);
        return success(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
};

const getWhatsappMethod = async (req, res) => {
    try {
        const { WhatsappType_Id } = req.query;

        const baseQuery = `
            SELECT 
                wm.Id,
                wm.WhatsappType_Id,
                wm.Service_Id,
                wm.Status,
                ws.WhatsappService,
                wt.WhatsappType,
                la.language,
                wm.lang_Id
            FROM tbl_WhatsappMethod wm
            LEFT JOIN tbl_Whatsapp_Service ws ON ws.Id = wm.Service_Id
            LEFT JOIN tbl_Whatsapp_Types wt ON wt.Id = wm.WhatsappType_Id
            LEFT JOIN tbl_Whatsapp_language la ON la.Id = wm.lang_Id
        `;

        if (WhatsappType_Id) {
            const result = await new sql.Request()
                .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
                .query(baseQuery + ` WHERE wm.WhatsappType_Id = @WhatsappType_Id ORDER BY wm.Status DESC`);
            return success(res, result.recordset);
        }

        const result = await new sql.Request().query(baseQuery + ` ORDER BY wm.WhatsappType_Id, wm.Status DESC`);
        return success(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
};

const getWhatsappLanguages = async (req, res) => {
    try {
        const result = await new sql.Request()
            .query(`
                SELECT* 
                FROM tbl_Whatsapp_language
                ORDER BY Id
            `);
        return success(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
};

    return {
        // getWhatsappMethod,
        updateWhatsappMethod,
        getWhatsappTypes,
        addWhatsappMethod,
        getWhatsappServices,
        getWhatsappMethod,
        getWhatsappLanguages

    }
}

export default whatsapp();