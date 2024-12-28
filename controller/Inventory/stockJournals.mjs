import sql from 'mssql';
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { checkIsNumber, createPadString, ISOString } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
const StockJournal = () => {

    const createStockJournal = async (req, res) => {
        const stockdetails = req.body.stockdetails ?? {};
        const {
            Branch_Id = '',
            StockJournalDate = '',
            StockJournalBill = 0,
            StockJournalVouchertype = '',
            Invoice_no = 0,
            Narration = '',
            Start_Time = '',
            End_Time = '',
            VehicleStart = '',
            VehicleEnd = '',
            Trip_No = '',
            CreatedBy = '',
            createDate = '',
            created_time = '',
        } = stockdetails;

        if (!checkIsNumber(Branch_Id)) {
            return invalidInput(res, 'Select Branch');
        }

        const Source = Array.isArray(req.body.Source) ? req.body.Source : [];
        const StaffInvolve = Array.isArray(req.body.StaffInvolve) ? req.body.StaffInvolve : [];
        const Destination = Array.isArray(req.body.Destination) ? req.body.Destination : [];

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const newOrderId = Number((await new sql.Request()
                .input('Branch_Id', Branch_Id)
                .query(`
                    SELECT COALESCE(MAX(STJ_Id), 0) AS MaxId
                    FROM tbl_Stock_Journal_Gen_Info
                    WHERE Branch_Id = @Branch_Id
                `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(newOrderId)) throw new Error('Failed to get Branch Id');

            const stjid = Number((await new sql.Request().query(`
                SELECT COALESCE(MAX(STJ_Id), 0) AS MaxId
                FROM tbl_Stock_Journal_Gen_Info
            `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(stjid)) throw new Error('Failed to get Stock Journal ID');
            const stj_Id = stjid;

            const J_No = 'JN_' + Branch_Id + '_' + createPadString(newOrderId, 4);

            const stInv = await getNextId({ table: 'tbl_Stock_Journal_Gen_Info', column: 'ST_Inv_Id' });

            if (!stInv.status || !checkIsNumber(stInv.MaxId)) throw new Error('Failed to get Stock Invoice ID');
            const Sno = stInv.MaxId;

            const OrderDetailsInsert = await new sql.Request(transaction)
                .input('STJ_Id', stj_Id)
                .input('ST_Inv_Id', Sno)
                .input('Branch_Id', BranchId)
                .input('Journal_no', J_No)
                .input('Stock_Journal_date', StockJournalDate)
                .input('Stock_Journal_Bill_type', StockJournalBill)
                .input('Stock_Journal_Voucher_type', StockJournalVouchertype)
                .input('Invoice_no', Invoice_no)
                .input('Narration', Narration)
                .input('Start_Time', Start_Time)
                .input('End_Time', End_Time)
                .input('Vehicle_Start_KM', VehicleStart)
                .input('Vehicle_End_KM', VehicleEnd)
                .input('Trip_No', Trip_No)
                .input('Created_by', CreatedBy)
                .input('created_on_Date', createDate)
                .input('created_time', created_time)
                .query(`
                    INSERT INTO tbl_Stock_Journal_Gen_Info (
                        STJ_Id, ST_Inv_Id, Branch_Id, Journal_no, Stock_Journal_date,
                        Stock_Journal_Bill_type, Stock_Journal_Voucher_type, Invoice_no, Narration, Start_Time, End_Time, Vehicle_Start_KM, Vehicle_End_KM, 
                        Trip_No, Created_by, created_on_Date, created_time
                    ) VALUES (
                        @STJ_Id, @ST_Inv_Id, @Branch_Id, @Journal_no, @Stock_Journal_date,
                        @Stock_Journal_Bill_type, @Stock_Journal_Voucher_type, @Invoice_no, @Narration, @Start_Time, @End_Time, @Vehicle_Start_KM, @Vehicle_End_KM, 
                        @Trip_No, @Created_by, @created_on_Date, @created_time
                    );
                `);

            if (OrderDetailsInsert.rowsAffected[0] == 0) {
                throw new Error('Failed to insert Journal details');
            }


            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', stj_Id)
                    .input('Sour_Item_Id', Number(item.Sour_Item_Id))
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', Number(item.Sour_Batch_Lot_No))
                    .input('Sour_Qty', item.Sour_Qty)
                    .input('Sour_Unit_Id', Number(item.Sour_Unit_Id))
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate))
                    .input('Sour_Amt', item.Sour_Amt)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Sour_Details (
                            STJ_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                        ) VALUES (
                      @STJ_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, @Sour_Unit_Id, @Sour_Unit, @Sour_Rate, @Sour_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Source details');
                }
            }

            for (let i = 0; i < StaffInvolve.length; i++) {
                const delivery = StaffInvolve[i];
                const result = await new sql.Request(transaction)
                    .input('STJ_Id', stj_Id)
                    .input('Staff_Type_Id', delivery.Staff_Type_Id)
                    .input('Staff_Id', delivery.Staff_Id)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Staff_Involved (STJ_Id, Staff_Type_Id, Staff_Id) 
                        VALUES (@STJ_Id, @Staff_Type_Id, @Staff_Id);
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }

            for (let i = 0; i < Destination.length; i++) {
                const final = Destination[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', stj_Id)
                    .input('Dest_Item_Id', Number(final.Dest_Item_Id))
                    .input('Dest_Goodown_Id', final.Dest_Goodown_Id)
                    .input('Dest_Batch_Lot_No', final.Dest_Batch_Lot_No)
                    .input('Dest_Qty', final.Dest_Qty)
                    .input('Dest_Unit_Id', final.Dest_Unit_Id)
                    .input('Dest_Unit', final.Dest_Unit)
                    .input('Dest_Rate', final.Dest_Rate)
                    .input('Dest_Amt', final.Dest_Amt)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Dest_Details (
                            STJ_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @STJ_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Destination details');
                }
            }

            await transaction.commit();

            return success(res, 'Stock Journal created successfully');
        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    }

    const updateStockJournal = async (req, res) => {
        const {
            stockdetails = {},
            Source = [],
            StaffInvolve = [],
            Destination = []
        } = req.body;

        const {
            stj_Id,
            StockJournalDate = '',
            StockJournalBill = 0,
            StockJournalVouchertype = '',
            Invoice_no = 0,
            Narration = '',
            Start_Time = '',
            End_Time = '',
            VehicleStart = '',
            VehicleEnd = '',
            Trip_No = '',
            Alterby = '',
            AlteredDate = '',
            AlteredTime = ''
        } = stockdetails;

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const updateOrderDetails = await new sql.Request(transaction)
                .input('STJ_Id', stj_Id)
                .input('Stock_Journal_date', StockJournalDate)
                .input('Stock_Journal_Bill_type', StockJournalBill)
                .input('Stock_Journal_Voucher_type', StockJournalVouchertype)
                .input('Invoice_no', Invoice_no)
                .input('Narration', Narration)
                .input('Start_Time', Start_Time)
                .input('End_Time', End_Time)
                .input('Vehicle_Start_KM', VehicleStart)
                .input('Vehicle_End_KM', VehicleEnd)
                .input('Trip_No', Trip_No)
                .input('altered_by', Alterby)
                .input('alterd_date', AlteredDate)
                .input('alterd_time', AlteredTime)
                .query(`
                    UPDATE tbl_Stock_Journal_Gen_Info
                    SET Stock_Journal_date = @Stock_Journal_date, Stock_Journal_Bill_type = @Stock_Journal_Bill_type,
                        Stock_Journal_Voucher_type = @Stock_Journal_Voucher_type, Invoice_no = @Invoice_no, 
                        Narration = @Narration, Start_Time = @Start_Time, End_Time = @End_Time, Vehicle_Start_KM = @Vehicle_Start_KM,
                        Vehicle_End_KM = @Vehicle_End_KM, Trip_No = @Trip_No, 
                        altered_by = @altered_by, alterd_date = @alterd_date, alterd_time = @alterd_time
                    WHERE STJ_Id = @STJ_Id
                `);

            if (updateOrderDetails.rowsAffected[0] === 0) {
                throw new Error('Failed to update order details');
            }

            await new sql.Request(transaction)
                .input('STJ_Id', stj_Id)
                .query(`
       
                    DELETE FROM tbl_Stock_Journal_Sour_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Dest_Details WHERE STJ_Id = @STJ_Id;
                    DELETE FROM tbl_Stock_Journal_Staff_Involved WHERE STJ_Id = @STJ_Id;
                `);


            for (let i = 0; i < Source.length; i++) {
                const item = Source[i];
                const result = await new sql.Request(transaction)

                    .input('STJ_Id', stj_Id)
                    .input('Sour_Item_Id', Number(item.Sour_Item_Id))
                    .input('Sour_Goodown_Id', item.Sour_Goodown_Id)
                    .input('Sour_Batch_Lot_No', Number(item.Sour_Batch_Lot_No))
                    .input('Sour_Qty', item.Sour_Qty)
                    .input('Sour_Unit_Id', Number(item.Sour_Unit_Id))
                    .input('Sour_Unit', item.Sour_Unit)
                    .input('Sour_Rate', Number(item.Sour_Rate))
                    .input('Sour_Amt', item.Sour_Amt)
                    .query(`
                            INSERT INTO tbl_Stock_Journal_Sour_Details (
                                STJ_Id, Sour_Item_Id, Sour_Goodown_Id, Sour_Batch_Lot_No, Sour_Qty, Sour_Unit_Id, Sour_Unit, Sour_Rate, Sour_Amt
                            ) VALUES (
                          @STJ_Id, @Sour_Item_Id, @Sour_Goodown_Id, @Sour_Batch_Lot_No, @Sour_Qty, @Sour_Unit_Id, @Sour_Unit, @Sour_Rate, @Sour_Amt
                            );
                        `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to insert Source details');
                }
            }


            for (let i = 0; i < StaffInvolve.length; i++) {
                const delivery = StaffInvolve[i];
                const result = await new sql.Request(transaction)
                    .input('STJ_Id', stj_Id)
                    .input('Staff_Type_Id', delivery.Staff_Type_Id)
                    .input('Staff_Id', delivery.Staff_Id)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Staff_Involved (STJ_Id, Staff_Type_Id, Staff_Id) 
                        VALUES (@STJ_Id, @Staff_Type_Id, @Staff_Id);
                    `);

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Staff Involved details');
                }
            }


            for (let i = 0; i < Destination.length; i++) {
                const final = Destination[i];
                const result = await new sql.Request(transaction)
                    .input('STJ_Id', stj_Id)
                    .input('Dest_Item_Id', Number(final.Dest_Item_Id))
                    .input('Dest_Goodown_Id', final.Dest_Goodown_Id)
                    .input('Dest_Batch_Lot_No', final.Dest_Batch_Lot_No)
                    .input('Dest_Qty', final.Dest_Qty)
                    .input('Dest_Unit_Id', final.Dest_Unit_Id)
                    .input('Dest_Unit', final.Dest_Unit)
                    .input('Dest_Rate', final.Dest_Rate)
                    .input('Dest_Amt', final.Dest_Amt)
                    .query(`
                        INSERT INTO tbl_Stock_Journal_Dest_Details (
                            STJ_Id, Dest_Item_Id, Dest_Goodown_Id, Dest_Batch_Lot_No, Dest_Qty, Dest_Unit_Id, Dest_Unit, Dest_Rate, Dest_Amt
                        ) VALUES (
                            @STJ_Id, @Dest_Item_Id, @Dest_Goodown_Id, @Dest_Batch_Lot_No, @Dest_Qty, @Dest_Unit_Id, @Dest_Unit, @Dest_Rate, @Dest_Amt
                        );
                    `);

                if (result.rowsAffected[0] === 0) {
                    throw new Error('Failed to insert Destination details');
                }
            }

            await transaction.commit();
            return success(res, 'Journal Updated Successfully');
        } catch (e) {

            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const deleteJournalInfo = async (req, res) => {

        const { stj_Id } = req.body;

        if (!checkIsNumber(stj_Id)) return invalidInput(res, 'OrderId is required');

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('STJ_Id', stj_Id)
                .query(`
                            DELETE FROM tbl_Stock_Journal_Gen_Info WHERE STJ_Id = @STJ_Id;
                            DELETE FROM tbl_Stock_Journal_Sour_Details WHERE STJ_Id = @STJ_Id;
                            DELETE FROM tbl_Stock_Journal_Dest_Details WHERE STJ_Id = @STJ_Id;
                            DELETE FROM tbl_Stock_Journal_Staff_Involved WHERE STJ_Id = @STJ_Id;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) throw new Error('Failed to delete Journal');

            await transaction.commit();

            return success(res, 'Journal Deleted!')

        } catch (e) {
            servError(e, res);
        }
    }

    const getJournalDetails = async (req, res) => {
        try {
            const request = new sql.Request();

            const result = await request.query(`
                WITH JournalSourceDetails AS (
                    SELECT jn.*
                    FROM tbl_Stock_Journal_Gen_Info AS jn
                    WHERE jn.STJ_Id IN (
                        SELECT sjs.STJ_Id
                        FROM tbl_Stock_Journal_Sour_Details AS sjs
                    )
                ), Destination AS (
                    SELECT d.*
                    FROM tbl_Stock_Journal_Dest_Details AS d
                    WHERE d.STJ_Id IN (
                        SELECT pgi.STJ_Id
                        FROM tbl_Stock_Journal_Dest_Details AS pgi
                    )
                ), Employee_Involed AS (
                    SELECT emp.*, cc.Cost_Center_Name
                    FROM tbl_Stock_Journal_Staff_Involved AS emp
                    LEFT JOIN tbl_ERP_Cost_Center AS cc 
                    ON emp.Staff_Id = cc.User_Id
                )
                SELECT 
                    COALESCE((SELECT jn.* FROM JournalSourceDetails AS jn FOR JSON PATH), '[]') AS Source,
                    (SELECT d.* FROM Destination AS d FOR JSON PATH) AS Destination,
                    (SELECT emp.STJ_Id, emp.S_Id, emp.Staff_Type_Id, emp.Staff_Id, emp.Cost_Center_Name
                     FROM Employee_Involed AS emp FOR JSON PATH) AS EmployeeInvoled
            `);

            if (result.recordset.length > 0) {
                const extractedData = result.recordset.map(o => {
                    return {
                        ...o,
                        Source: parseJson(o?.Source),
                        Destination: parseJson(o?.Destination),
                        EmployeeInvoled: parseJson(o?.EmployeeInvoled)
                    };
                });

                dataFound(res, extractedData);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    };

    function parseJson(jsonString) {
        try {
            return jsonString ? JSON.parse(jsonString) : null;
        } catch (e) {
            console.error("Error parsing JSON:", e);
            return null;
        }
    }



    return {
        createStockJournal,
        updateStockJournal,
        deleteJournalInfo,
        getJournalDetails
    }
}

export default StockJournal();
