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

    const updateWhatsappMethod =async(req,res)=>{
   try {
        const { Id, Status, WhatsappType_Id } = req.body;

        if (!Id || !WhatsappType_Id) {
            return invalidInput(res, 'Id and WhatsappType_Id are required');
        }

        // Step 1: Set Status = 0 for all methods of this WhatsappType_Id
        await new sql.Request()
            .input('WhatsappType_Id', WhatsappType_Id)
            .query(`UPDATE tbl_WhatsappMethod 
                    SET Status = 0, WhatsappType_Id = @WhatsappType_Id
                    WHERE WhatsappType_Id = @WhatsappType_Id`);

        // Step 2: Set Status = 1 for selected method Id with the WhatsappType_Id
        const result = await new sql.Request()
            .input('Id', Id)
            .input('Status', Status || 1)
            .input('WhatsappType_Id', WhatsappType_Id)
            .query(`UPDATE tbl_WhatsappMethod 
                    SET Status = @Status, WhatsappType_Id = @WhatsappType_Id
                    WHERE Id = @Id`);

        if (result.rowsAffected[0] > 0) {
            return success(res, 'WhatsApp method updated successfully');
        } else {
            return failed(res, 'Failed to update WhatsApp method');
        }
    } catch (e) {
        servError(e, res);
    }
    
    }


const addWhatsappMethod = async (req, res) => {
    try {
        const { Id, Service_Id, WhatsappType_Id, Status } = req.body;

        // Validation
        if (!WhatsappType_Id || !Service_Id) {
            return invalidInput(res, 'WhatsappType_Id and Service_Id are required');
        }

        // Check if record exists for this WhatsApp Type and Service
        const existing = await new sql.Request()
            .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
            .input('Service_Id', sql.Int, Service_Id)
            .query(`
                SELECT Id FROM tbl_WhatsappMethod
                WHERE WhatsappType_Id = @WhatsappType_Id AND Service_Id = @Service_Id
            `);

        let result;

        if (existing.recordset.length > 0) {
            // Row exists → UPDATE Status
            result = await new sql.Request()
                .input('Id', sql.Int, existing.recordset[0].Id)
                .input('Status', sql.Int, Status ?? 1)
                .query(`
                    UPDATE tbl_WhatsappMethod 
                    SET Status = @Status
                    WHERE Id = @Id
                `);
        } else {
            // Row does not exist → INSERT new record
            result = await new sql.Request()
                .input('WhatsappType_Id', sql.Int, WhatsappType_Id)
                .input('Service_Id', sql.Int, Service_Id)
                .input('Status', sql.Int, Status ?? 1)
                .query(`
                    INSERT INTO tbl_WhatsappMethod (WhatsappType_Id, Service_Id, Status)
                    VALUES (@WhatsappType_Id, @Service_Id, @Status)
                `);
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
        
        let query = `
            SELECT 
                wm.Id,
                wm.WhatsappType_Id,
                wm.Service_Id,
                wm.Status,
                ws.WhatsappService,
                wt.WhatsappType
            FROM tbl_WhatsappMethod wm
            left join  tbl_Whatsapp_Service ws ON ws.Id = wm.Service_Id
            left JOIN tbl_Whatsapp_Types wt ON wt.Id = wm.WhatsappType_Id
        `;
        
        if (WhatsappType_Id) {
            query += ` WHERE wm.WhatsappType_Id = @WhatsappType_Id`;
            const request = new sql.Request()
                .input('WhatsappType_Id', sql.Int, WhatsappType_Id);
            const result = await request.query(query);
            return success(res, result.recordset);
        }
        
        const result = await new sql.Request().query(query);
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
        getWhatsappMethod

    }
}

export default whatsapp();