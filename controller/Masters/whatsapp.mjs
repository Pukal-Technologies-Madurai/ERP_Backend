
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber, randomNumber } from '../../helper_functions.mjs';
import uploadFile from '../../middleware/uploadMiddleware.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
const whatsapp = () => {

    const getWhatsappTypes = async (req, res) => {
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
                return failed(res, "WhatsappType is required");
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
                return failed(res, "Missing required fields: company_id, whatsapp_type_id, or enabled_columns");

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

    const verifyWebhook = (req, res) => {
        const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token';

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token === VERIFY_TOKEN) {

            return res.status(200).send(challenge);
        }
        return res.status(403).json({ success: false, message: 'Verification failed' });
    };

    const receiveWebhook = async (req, res) => {
        try {
            const body = req.body;


            res.status(200).send('EVENT_RECEIVED');

            if (body.object !== 'whatsapp_business_account') return;

            for (const entry of body.entry || []) {
                for (const change of entry.changes || []) {
                    if (change.field !== 'messages') continue;

                    const value = change.value;
                    const messages = value?.messages || [];
                    const contacts = value?.contacts || [];
                    const metadata = value?.metadata || {};

                    for (const message of messages) {
                        const senderPhone = message.from;                          // e.g. "15557654321"
                        const senderName = contacts.find(c => c.wa_id === message.from)?.profile?.name || null;
                        const messageType = message.type;                          // "text", "image", etc.
                        const messageText = message.text?.body || null;
                        const messageId = message.id;
                        const timestamp = message.timestamp;
                        const phoneNumberId = metadata.phone_number_id;

                        await saveIncomingMessage({
                            senderPhone,
                            senderName,
                            messageType,
                            messageText,
                            messageId,
                            timestamp,
                            phoneNumberId
                        });
                    }
                }
            }

        } catch (e) {
            servError(e, res);
        }
    };


    const askevaWebhook = async (req, res) => {
        try {
            const rawContact = req.query?.contact || req.query?.ContactNumber || req.query?.contactNumber || req.body?.contact || req.body?.ContactNumber || req.body?.contactNumber || req.params?.contact || '';

            const cleanDigits = String(rawContact).replace(/\D/g, '');
            const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

            if (!last10) {
                return res.status(200).json({
                    name: 'Customer',
                    contact: String(rawContact),
                    live_orders_summary: 'Contact number not provided'
                });
            }

            // 1. Search in tbl_Retailers_Master & tbl_Ledger_LOL
            const retailerReq = new sql.Request();
            retailerReq.input('last10', sql.NVarChar(50), last10);

            const retailerQuery = `
                SELECT TOP 1
                    rm.Retailer_Id,
                    rm.Retailer_Name,
                    rm.Contact_Person,
                    rm.Mobile_No,
                    rm.Whatsapp,
                    rm.Reatailer_Address,
                    rm.Reatailer_City,
                    rm.PinCode,
                    rm.Gstno,
                    COALESCE(am.Area_Name, '') AS Area_Name,
                    COALESCE(rom.Route_Name, '') AS Route_Name,
                    COALESCE(sm.State_Name, '') AS State_Name,
                    COALESCE(a.creditLimit, 0) AS Credit_Limit,
                    COALESCE(lol.Party_Mailing_Name, '') AS lolName,
                    COALESCE(lol.Party_Location, '') AS lolCity,
                    COALESCE(lol.Party_Mailing_Address, '') AS lolAddress,
                    COALESCE(lol.GST_No, '') AS lolGst
                FROM tbl_Retailers_Master rm
                LEFT JOIN tbl_Area_Master am ON am.Area_Id = rm.Area_Id
                LEFT JOIN tbl_Route_Master rom ON rom.Route_Id = rm.Route_Id
                LEFT JOIN tbl_State_Master sm ON sm.State_Id = rm.State_Id
                LEFT JOIN tbl_Account_Master a ON a.Acc_Id = rm.AC_Id
                LEFT JOIN tbl_Ledger_LOL lol ON lol.Ret_Id = rm.Retailer_Id
                WHERE 
                    rm.Mobile_No LIKE '%' + @last10 OR
                    rm.Whatsapp LIKE '%' + @last10 OR
                    lol.Party_Mobile_1 LIKE '%' + @last10 OR
                    lol.Party_Mobile_2 LIKE '%' + @last10
                ORDER BY rm.Retailer_Id DESC
            `;

            const retailerResult = await retailerReq.query(retailerQuery);
            const retailer = retailerResult.recordset[0];

            let retailerId = retailer?.Retailer_Id || null;
            let name = retailer?.Contact_Person || retailer?.Retailer_Name || retailer?.lolName || '';
            let retailerName = retailer?.Retailer_Name || retailer?.lolName || '';
            let email = '';
            let city = retailer?.Reatailer_City || retailer?.lolCity || retailer?.Area_Name || '';
            let address = retailer?.Reatailer_Address || retailer?.lolAddress || '';
            let gstin = retailer?.Gstno || retailer?.lolGst || '';
            let area = retailer?.Area_Name || '';
            let route = retailer?.Route_Name || '';
            let creditLimit = retailer?.Credit_Limit || 0;

            // If not found in retailers, check tbl_Users
            if (!retailerId) {
                const userReq = new sql.Request();
                userReq.input('last10', sql.NVarChar(50), last10);
                const userQuery = `
                    SELECT TOP 1
                        u.UserId,
                        u.Name,
                        u.UserName,
                        COALESCE(b.BranchName, '') AS BranchName,
                        COALESCE(c.Company_Name, '') AS Company_Name
                    FROM tbl_Users u
                    LEFT JOIN tbl_Branch_Master b ON b.BranchId = u.BranchId
                    LEFT JOIN tbl_Company_Master c ON c.Company_id = u.Company_Id
                    WHERE u.UserName LIKE '%' + @last10
                `;
                const userResult = await userReq.query(userQuery);
                const u = userResult.recordset[0];
                if (u) {
                    name = u.Name || u.UserName || '';
                    city = u.BranchName || '';
                }
            }

            // Fallback for name if still blank
            if (!name) {
                name = 'Customer';
            }

            // 2. Fetch Live / Recent Orders for this retailer
            let liveOrders = [];
            if (retailerId) {
                const orderReq = new sql.Request();
                orderReq.input('Retailer_Id', sql.Int, retailerId);
                const orderQuery = `
                    SELECT TOP 5
                        so.So_Id,
                        CONVERT(VARCHAR(10), so.So_Date, 120) AS Order_Date,
                        COALESCE(so.Total_Invoice_value, 0) AS Order_Amount,
                        COALESCE(sts.Status, 'Pending') AS Order_Status
                    FROM tbl_Sales_Order_Gen_Info so
                    LEFT JOIN tbl_Status sts ON sts.Status_Id = so.Cancel_status
                    WHERE so.Retailer_Id = @Retailer_Id
                    ORDER BY so.So_Date DESC, so.So_Id DESC
                `;
                const orderResult = await orderReq.query(orderQuery);
                liveOrders = orderResult.recordset || [];
            }

            const latestOrder = liveOrders[0] || null;
            const liveOrdersCount = liveOrders.length;
            const liveOrdersSummary = liveOrders.length > 0
                ? liveOrders.map((ord, idx) => `${idx + 1}. Order #${ord.So_Id} (${ord.Order_Date}): Rs.${Number(ord.Order_Amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} - ${ord.Order_Status}`).join('\n')
                : 'No live orders found';

            const responsePayload = {
                name: name,
                retailer_name: retailerName || name,
                email: email,
                city: city,
                contact: String(rawContact),
                address: address,
                gstin: gstin,
                area: area,
                route: route,
                credit_limit: creditLimit ? String(creditLimit) : "0",
                live_orders_count: liveOrdersCount,
                latest_order_no: latestOrder ? String(latestOrder.So_Id) : '',
                latest_order_date: latestOrder ? String(latestOrder.Order_Date) : '',
                latest_order_amount: latestOrder ? String(latestOrder.Order_Amount) : '0',
                latest_order_status: latestOrder ? String(latestOrder.Order_Status) : '',
                live_orders_summary: liveOrdersSummary,
                summary: liveOrdersSummary
            };

            // Outbound WhatsApp message POST trigger via AskEva
            const askevaKey = '35b692feb6bd34a7a9af39c7242a0c98e397227000f3afdd366bee5d91ca2a01a11b35843397c74803400a101d55374e999a892823a47747bfeb5ca2953d86b5';
            if (cleanDigits && askevaKey) {
                const messageText = `Hello *${name}*,\n\n📦 *Your Live Orders Summary:*\n${liveOrdersSummary}`;
                (async () => {
                    try {
                        const sendRes = await fetch('https://backend.askeva.net/api/v1/send/message', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${askevaKey}`,
                                'api-key': askevaKey,
                                'x-api-key': askevaKey
                            },
                            body: JSON.stringify({
                                to: cleanDigits,
                                contact: cleanDigits,
                                recipient: cleanDigits,
                                message: messageText,
                                text: messageText
                            })
                        });
                        const resText = await sendRes.text();
                        console.log('AskEva Outbound Send Response Status:', sendRes.status, resText);
                    } catch (err) {
                        console.error('AskEva Outbound Send Error:', err?.message || err);
                    }
                })();
            }

            return res.status(200).json(responsePayload);

        } catch (e) {
            console.error('Error in askevaWebhook:', e);
            return res.status(200).json({
                name: 'Customer',
                email: '',
                city: '',
                contact: req.query?.contact || req.body?.contact || '',
                live_orders_count: 0,
                live_orders_summary: 'Failed to fetch live orders details.',
                summary: 'Failed to fetch live orders details.'
            });
        }
    };


    const saveIncomingMessage = async ({ senderPhone, senderName, messageType, messageText, messageId, timestamp, phoneNumberId }) => {
        try {
            await new sql.Request()
                .input('SenderPhone', sql.NVarChar(20), senderPhone)
                .input('SenderName', sql.NVarChar(255), senderName)
                .input('MessageType', sql.NVarChar(50), messageType)
                .input('MessageText', sql.NVarChar(sql.MAX), messageText)
                .input('MessageId', sql.NVarChar(255), messageId)
                .input('Timestamp', sql.BigInt, timestamp)
                .input('PhoneNumberId', sql.NVarChar(50), phoneNumberId)
                .query(`
                    INSERT INTO tbl_Whatsapp_Incoming 
                        (SenderPhone, SenderName, MessageType, MessageText, MessageId, Timestamp, PhoneNumberId, Created_Time)
                    VALUES 
                        (@SenderPhone, @SenderName, @MessageType, @MessageText, @MessageId, @Timestamp, @PhoneNumberId, GETDATE())
                `);
        } catch (e) {
            console.error('Failed to save incoming message:', e);
        }
    };


    const getIncomingMessages = async (req, res) => {
        try {
            const { SenderPhone, from_date, to_date } = req.query;

            let query = `
                SELECT 
                    Id, SenderPhone, SenderName, MessageType,
                    MessageText, MessageId, Timestamp, PhoneNumberId, Created_Time
                FROM tbl_Whatsapp_Incoming
                WHERE 1=1
            `;

            const request = new sql.Request();

            if (SenderPhone) {
                query += ` AND SenderPhone = @SenderPhone`;
                request.input('SenderPhone', sql.NVarChar(20), SenderPhone);
            }
            if (from_date) {
                query += ` AND Created_Time >= @from_date`;
                request.input('from_date', sql.DateTime, new Date(from_date));
            }
            if (to_date) {
                query += ` AND Created_Time <= @to_date`;
                request.input('to_date', sql.DateTime, new Date(to_date));
            }

            query += ` ORDER BY Created_Time DESC`;

            const result = await request.query(query);

            if (result.recordset.length) {
                return dataFound(res, result.recordset);
            }
            return noData(res);

        } catch (e) {
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

    const logWhatsappSend = async (req, res) => {
        try {
            const { documentType, referenceId, retailerId, retailerName, mobileNo, messageTemplate, sentBy } = req.body;
            if (!documentType || !referenceId) {
                return res.status(400).json({ success: false, message: "documentType and referenceId are required" });
            }

            const getMaxId = await getNextId({ table: 'tbl_Whatsapp_Details', column: 'Whatsapp_Detail_Id' });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Whatsapp Detail ID');
            }
            const Whatsapp_Detail_Id = getMaxId.MaxId;

            await new sql.Request()
                .input('whatsappDetailId', sql.Int, Whatsapp_Detail_Id)
                .input('documentType', sql.VarChar(50), documentType)
                .input('referenceId', sql.VarChar(100), String(referenceId))
                .input('retailerId', sql.VarChar(50), retailerId ? String(retailerId) : null)
                .input('retailerName', sql.VarChar(200), retailerName || null)
                .input('mobileNo', sql.VarChar(20), mobileNo || null)
                .input('messageTemplate', sql.VarChar(100), messageTemplate || null)
                .input('sentBy', sql.Int, sentBy || null)
                .query(`
                INSERT INTO tbl_Whatsapp_Details
                    (Whatsapp_Detail_Id, Document_Type, Reference_Id, Retailer_Id, Retailer_Name, Mobile_No, Message_Template, Sent_By, Status)
                VALUES
                    (@whatsappDetailId, @documentType, @referenceId, @retailerId, @retailerName, @mobileNo, @messageTemplate, @sentBy, 'Sent')
            `);

            res.json({ success: true, Whatsapp_Detail_Id });
        } catch (e) {
            console.error('Error in logWhatsappSend:', e);
            servError(e, res);
        }
    };

    const getWhatsappCounts = async (req, res) => {
        try {
            const { documentType, referenceIds } = req.query;
            if (!documentType || !referenceIds) {
                return res.json({ success: true, data: [] });
            }
            const ids = String(referenceIds).split(',').map(s => s.trim()).filter(Boolean);
            if (ids.length === 0) return res.json({ success: true, data: [] });

            const placeholders = ids.map((_, i) => `@id${i}`).join(',');
            const request = new sql.Request();

            ids.forEach((id, i) => {
                request.input(`id${i}`, sql.VarChar(100), id);
            });
            request.input('documentType', sql.VarChar(50), documentType);

            // PriceList counts reset daily — only count sends made today.
            // Everything else keeps the existing all-time count.
            const isDateScoped = documentType === 'PriceList';

            const dateFilter = isDateScoped
                ? `AND CAST(Sent_On AS DATE) = CAST(GETDATE() AS DATE)`
                : '';

            const result = await request.query(`
            SELECT Reference_Id, COUNT(*) AS Sent_Count
            FROM tbl_Whatsapp_Details
            WHERE Document_Type = @documentType
              AND Reference_Id IN (${placeholders})
              ${dateFilter}
            GROUP BY Reference_Id
        `);

            res.json({
                success: true,
                data: result.recordset || []
            });
        } catch (e) {
            console.error('Error in getWhatsappCounts:', e);
            res.json({ success: true, data: [] });
        }
    };


    const postPendingBillsPdf = async (req, res) => {
        try {
            await uploadFile(req, res, 7, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }


            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/pendingbills/${fileName}`;

            success(res, 'Pending bills PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    };

    const postsalesPdf = async (req, res) => {
        try {
            await uploadFile(req, res, 8, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }


            const baseUrl = `${req.protocol}://${req.get('host')}`;
            console.log("baseUrl", baseUrl)
            const publicUrl = `${baseUrl}/imageURL/saleorder/${fileName}`;
            console.log("publicUrl", publicUrl)
            success(res, 'Sale Order PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    };

    const postsalesInvoicePdf = async (req, res) => {
        try {
            await uploadFile(req, res, 9, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }


            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/saleinvoice/${fileName}`;

            success(res, 'Sale invoice PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    };

    const poststatementPdf = async (req, res) => {
        try {
            await uploadFile(req, res, 10, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }


            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/statement/${fileName}`;

            success(res, 'outstanding PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    }



    const whatsappDelete = async (req, res) => {
        try {
            // const { fileName } = req.body;
            const fileName = req.body;

            await uploadFile(req, res, 7, 'pdfFile');


            const filePath = `./uploads/pendingbills/${fileName}`;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            success(res, 'File cleaned up');
        } catch (error) {
            servError(error, res);
        }

    }


    const postpricelistPdf = async (req, res) => {
        try {
            const dirPath = './uploads/pricelist';
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                    }
                }
            }

            await uploadFile(req, res, 11, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/pricelist/${fileName}`;

            success(res, 'Pricelist PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    }

    const postsalesImages = async (req, res) => {
        try {
            await uploadFile(req, res, 12, 'Images');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'Image file is required');
            }

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/saleimages/${fileName}`;

            success(res, 'Sale Image uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    };

    const postpurchaseImages = async (req, res) => {
        try {
            await uploadFile(req, res, 13, 'pdfFile');

            const fileName = req?.file?.filename;

            if (!fileName) {
                return invalidInput(res, 'PDF file is required');
            }

            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const publicUrl = `${baseUrl}/imageURL/purchaseimages/${fileName}`;

            success(res, 'Purchase Order PDF uploaded', { url: publicUrl, fileName });

        } catch (error) {
            servError(error, res);
        }
    };

    return {
        verifyWebhook,
        receiveWebhook,
        askevaWebhook,
        getIncomingMessages,
        // getWhatsappMethod,
        updateWhatsappMethod,
        getWhatsappTypes,
        addWhatsappMethod,
        getWhatsappServices,
        getWhatsappMethod,
        getWhatsappLanguages,
        FilterdisplayColumn,
        FilterWhatsappSettingColumn,
        saveWhatsappColumnSettings,
        logWhatsappSend,
        getWhatsappCounts,
        postPendingBillsPdf,
        postsalesPdf,
        postsalesInvoicePdf,
        poststatementPdf,
        postpricelistPdf,
        whatsappDelete,
        postsalesImages,
        postpurchaseImages

    }
}

export default whatsapp();