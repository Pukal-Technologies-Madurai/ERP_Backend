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


 const FilterdisplayColumn = async (req, res) => {
      try {
        const { WhatsappType, company_id } = req.query;

        if (!WhatsappType) {
            return error(res, "WhatsappType is required");
        }

        const typeQuery = `
            SELECT Id 
            FROM tbl_Whatsapp_Types 
            WHERE WhatsappType = @WhatsappType
        `;
        
        const typeResult = await new sql.Request()
            .input('WhatsappType', sql.NVarChar(100), WhatsappType)
            .query(typeQuery);

        if (typeResult.recordset.length === 0) {
            return success(res, []); 
        }

        const whatsappTypeId = typeResult.recordset[0].Id;

        let filterQuery = `
            SELECT 
                wf.Id,
                wf.Whatsapp_Type_Id,
                wf.Column_Name,
                wf.Company_id,
                wf.Status
            FROM tbl_Whatsapp_Filter wf
            WHERE wf.Whatsapp_Type_Id = @Whatsapp_Type_Id
        `;

        const request = new sql.Request();
        request.input('Whatsapp_Type_Id', sql.Int, whatsappTypeId);

        if (company_id) {
            filterQuery += ` AND wf.Company_id = @company_id`;
            request.input('company_id', sql.Int, company_id);
        }

        filterQuery += ` ORDER BY wf.Id ASC`;

        const filterResult = await request.query(filterQuery);
        
        return success(res, filterResult.recordset);

    } catch (e) {
        console.error("Error fetching whatsapp filter:", e);
        servError(e, res);
    }
    };





        const FilterWhatsappSettingColumn = async (req, res) => {
            const { WhatsappType_Id } = req.query;
    
            if (!WhatsappType_Id) {
                return invalidInput(res, "WhatsappType_Id is Required");
            }
    
            try {
                const request = new sql.Request().input("WhatsappType_Id", WhatsappType_Id)
                    .query(`
                        SELECT *
                        FROM tbl_Whatsapp_Filter
                        WHERE Whatsapp_Type_Id = @WhatsappType_Id`
                    );
    
                const result = await request;
    
                if (result.recordset.length) {
                    dataFound(res, result.recordset);
                } else {
                    noData(res);
                }
            } catch (error) {
                servError(error, res);
            }
        };


        const saveWhatsappColumnSettings = async (req, res) => {
    try {
        const { company_id, whatsapp_type_id, whatsapp_type, tab, enabled_columns, records } = req.body;

        // Validate required fields
        if (!company_id || !whatsapp_type_id || !enabled_columns || !enabled_columns.length) {
            return error(res, "Missing required fields: company_id, whatsapp_type_id, or enabled_columns");
        }

        // Start transaction
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            
            await transaction.request()
                .input('Company_id', sql.Int, company_id)
                .input('Whatsapp_Type_Id', sql.Int, whatsapp_type_id)
                .query(`
                    DELETE FROM tbl_Whatsapp_Filter 
                    WHERE Company_id = @Company_id AND Whatsapp_Type_Id = @Whatsapp_Type_Id
                `);

                 

              await transaction.request()
                .input('Company_id', sql.Int, company_id)
                .input('Whatsapp_Type_Id', sql.Int, whatsapp_type_id)
                .query(`
                    DELETE FROM tbl_Whatsapp_Filter 
                    WHERE Company_id = @Company_id AND Whatsapp_Type_Id = @Whatsapp_Type_Id
                `)

              const maxIdResult = await transaction.request()
                .query(`SELECT ISNULL(MAX(Id), 0) as MaxId FROM tbl_Whatsapp_Filter`);
            
            let nextId = maxIdResult.recordset[0].MaxId;
                
          
              let insertedCount = 0;
            for (const columnName of enabled_columns) {
                   nextId++;
                const result = await transaction.request()
                    .input('Id', sql.Int, nextId)
                    .input('Whatsapp_Type_Id', sql.Int, whatsapp_type_id)
                    .input('Column_Name', sql.NVarChar(255), columnName)
                    .input('Company_id', sql.Int, company_id)
                    .input('Status', sql.Int, 1)
                    .query(`
                        INSERT INTO tbl_Whatsapp_Filter 
                            (Id, Whatsapp_Type_Id, Column_Name, Company_id, Status)
                        VALUES 
                            (@Id, @Whatsapp_Type_Id, @Column_Name, @Company_id, @Status)
                    `);
                
                if (result.rowsAffected[0] > 0) {
                    insertedCount++;
                }
            }

            // Commit transaction
            await transaction.commit();

            return success(res, {
                message: `Saved ${insertedCount} column settings successfully`,
                data: {
                    inserted: insertedCount,
                    columns: enabled_columns,
                    company_id: company_id,
                    whatsapp_type_id: whatsapp_type_id
                }
            });

        } catch (error) {
        
            await transaction.rollback();
            throw error;
        }

    } catch (e) {
        console.error("Error saving whatsapp column settings:", e);
        servError(e, res);
    }
};


// const getWhatsappColumnSettings = async (req, res) => {
//     try {
//         const { company_id, whatsapp_type, whatsapp_type_id } = req.query;

//         let query = `
//             SELECT 
//                 wcs.Id,
//                 wcs.Whatsapp_Type_Id,
//                 wcs.Column_Name,
//                 wcs.Company_id,
//                 wcs.Status,
//                 wcs.Created_At,
//                 wcs.Updated_At,
//                 wt.WhatsappType,
//                 wt.Id as TypeId
//             FROM tbl_WhatsappColumnSettings wcs
//             LEFT JOIN tbl_Whatsapp_Types wt ON wt.Id = wcs.Whatsapp_Type_Id
//             WHERE 1=1
//         `;

//         const request = new sql.Request();

//         if (company_id) {
//             query += ` AND wcs.Company_id = @Company_id`;
//             request.input('Company_id', sql.Int, company_id);
//         }

//         if (whatsapp_type_id) {
//             query += ` AND wcs.Whatsapp_Type_Id = @Whatsapp_Type_Id`;
//             request.input('Whatsapp_Type_Id', sql.Int, whatsapp_type_id);
//         }

//         if (whatsapp_type) {
//             query += ` AND wt.WhatsappType = @WhatsappType`;
//             request.input('WhatsappType', sql.NVarChar(100), whatsapp_type);
//         }

//         query += ` ORDER BY wcs.Id ASC`;

//         const result = await request.query(query);
//         return success(res, result.recordset);

//     } catch (e) {
//         console.error("Error fetching whatsapp column settings:", e);
//         servError(e, res);
//     }
// };



// const getAvailableColumns = async (req, res) => {
//     try {
//         const { company_id } = req.query;

//         if (!company_id) {
//             return error(res, "company_id is required");
//         }

//         const query = `
//             SELECT 
//                 ColumnName as ColumnName,
//                 Alias_Name,
//                 Is_Visible,
//                 Position,
//                 Data_Type
//             FROM tbl_Columns 
//             WHERE Company_id = @Company_id AND Is_Active = 1
//             ORDER BY Position ASC
//         `;

//         const result = await new sql.Request()
//             .input('Company_id', sql.Int, company_id)
//             .query(query);

//         return success(res, result.recordset);

//     } catch (e) {
//         console.error("Error fetching available columns:", e);
//         servError(e, res);
//     }
// };

    return {
        // getWhatsappMethod,
        updateWhatsappMethod,
        getWhatsappTypes,
        addWhatsappMethod,
        getWhatsappServices,
        getWhatsappMethod,
        getWhatsappLanguages,
        FilterdisplayColumn,
        FilterWhatsappSettingColumn,
        saveWhatsappColumnSettings
        

    }
}

export default whatsapp();