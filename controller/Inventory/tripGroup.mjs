import sql from 'mssql';
import { servError, dataFound, noData, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, ISOString, toArray, toNumber } from '../../helper_functions.mjs';

const tripGroupActivity = () => {

    const getTripGroups = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const Branch_Id = checkIsNumber(req.query?.Branch_Id) ? req.query.Branch_Id : null;

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .input('Branch_Id', sql.Int, Branch_Id)
                .query(`
                    DECLARE @FilteredGroup TABLE (group_id UNIQUEIDENTIFIER);
                    
                    INSERT INTO @FilteredGroup (group_id)
                    SELECT id FROM tbl_Trip_Group
                    WHERE entry_date BETWEEN @Fromdate AND @Todate
                    ${Branch_Id ? ' AND branch_id = @Branch_Id ' : ''};
                    
                    -- 0. Main Trip Groups
                    SELECT 
                        tg.id,
                        tg.entry_date,
                        tg.branch_id,
                        bm.BranchName,
                        tg.vehicle_number,
                        tg.start_km,
                        tg.end_km,
                        tg.start_time,
                        tg.end_time,
                        tg.prepared_by,
                        tg.checked_by,
                        tg.approved_by,
                        (
                            SELECT STRING_AGG(CAST(tm.Challan_No AS NVARCHAR(MAX)), ', ')
                            FROM tbl_Trip_Group_Details tgd
                            JOIN tbl_Trip_Master tm ON tm.Trip_Id = tgd.trip_id
                            WHERE tgd.group_id = tg.id
                        ) AS Challan_Nos,
                        (
                            SELECT STRING_AGG(CAST(tm.Trip_No AS NVARCHAR(MAX)), ', ')
                            FROM tbl_Trip_Group_Details tgd
                            JOIN tbl_Trip_Master tm ON tm.Trip_Id = tgd.trip_id
                            WHERE tgd.group_id = tg.id
                        ) AS Trip_Nos
                    FROM tbl_Trip_Group tg
                    LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = tg.branch_id
                    WHERE tg.id IN (SELECT group_id FROM @FilteredGroup)
                    ORDER BY tg.entry_date DESC;

                    -- 1. Group Details (Trips) with Bags and Tonnage
                    SELECT 
                        tgd.id,
                        tgd.group_id,
                        tgd.trip_id,
                        tm.Trip_Date,
                        tm.TR_INV_ID,
                        tm.VoucherType,
                        vt.Voucher_Type AS VoucherTypeGet,
                        tm.BillType,
                        tm.Challan_No,
                        tm.Trip_No,
                        COALESCE(
                            CASE 
                                WHEN tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(ta.QTY / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Trip_Arrival ta ON ta.Arr_Id = td.Arrival_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = ta.Product_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'SALES' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(sdsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Delivery_Order_Id = td.Delivery_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = sdsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'DEBIT_NOTE' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(dnsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Debit_Note_Stock_Info dnsi ON dnsi.DB_Id = td.Debit_Note_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = dnsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'CREDIT_NOTE' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(cnsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Credit_Note_Stock_Info cnsi ON cnsi.CR_Id = td.Credit_Note_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = cnsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                ELSE 0
                            END, 0
                        ) AS Bags_Qty,
                        COALESCE(
                            CASE 
                                WHEN tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN (
                                    SELECT SUM(ta.QTY)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Trip_Arrival ta ON ta.Arr_Id = td.Arrival_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'SALES' THEN (
                                    SELECT SUM(sdsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Delivery_Order_Id = td.Delivery_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'DEBIT_NOTE' THEN (
                                    SELECT SUM(dnsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Debit_Note_Stock_Info dnsi ON dnsi.DB_Id = td.Debit_Note_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                WHEN tm.BillType = 'CREDIT_NOTE' THEN (
                                    SELECT SUM(cnsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Credit_Note_Stock_Info cnsi ON cnsi.CR_Id = td.Credit_Note_Id
                                    WHERE td.Trip_Id = tgd.trip_id
                                )
                                ELSE 0
                            END, 0
                        ) AS Tonnage_Qty
                    FROM tbl_Trip_Group_Details tgd
                    JOIN tbl_Trip_Master tm ON tm.Trip_Id = tgd.trip_id
                    LEFT JOIN tbl_Voucher_Type vt ON vt.Vocher_Type_Id = tm.VoucherType
                    WHERE tgd.group_id IN (SELECT group_id FROM @FilteredGroup);

                    -- 2. Staff Involved
                    SELECT DISTINCT
                        tgd.group_id,
                        te.Involved_Emp_Id,
                        ecc.Cost_Center_Name AS Emp_Name,
                        ecc.User_Type AS Emp_Type_Id,
                        cat.Cost_Category AS Involved_Emp_Type
                    FROM tbl_Trip_Group_Details tgd
                    JOIN tbl_Trip_Employees te ON te.Trip_Id = tgd.trip_id
                    LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = te.Involved_Emp_Id
                    LEFT JOIN tbl_ERP_Cost_Category cat ON cat.Cost_Category_Id = te.Cost_Center_Type_Id
                    WHERE tgd.group_id IN (SELECT group_id FROM @FilteredGroup);
                `);

            const result = await request;
            const tripGroups = toArray(result.recordsets[0]);
            const tripDetails = toArray(result.recordsets[1]);
            const staffInvolved = toArray(result.recordsets[2]);

            if (tripGroups.length > 0) {
                const data = tripGroups.map(group => {
                    const groupTrips = tripDetails.filter(td => td.group_id === group.id);
                    const Total_Bags = groupTrips.reduce((acc, trip) => acc + (trip.Bags_Qty || 0), 0);
                    const Total_Tonnage = groupTrips.reduce((acc, trip) => acc + (trip.Tonnage_Qty || 0), 0);
                    const Staffs_Array = staffInvolved.filter(st => st.group_id === group.id);
                    
                    return {
                        ...group,
                        Total_Bags,
                        Total_Tonnage,
                        Trips_List: groupTrips,
                        Staffs_Array
                    };
                });
                dataFound(res, data);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getNotGroupedTrips = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const Branch_Id = checkIsNumber(req.query?.Branch_Id) ? req.query.Branch_Id : null;
            const BillType = req.query?.BillType || null;

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .input('Branch_Id', sql.Int, Branch_Id)
                .input('BillType', sql.NVarChar, BillType)
                .query(`
                    SELECT 
                        tm.Trip_Id,
                        tm.Trip_Date,
                        tm.TR_INV_ID,
                        tm.VoucherType,
                        vt.Voucher_Type AS VoucherTypeGet,
                        tm.BillType,
                        tm.Challan_No,
                        tm.Trip_No,
                        COALESCE(
                            CASE 
                                WHEN tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(ta.QTY / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Trip_Arrival ta ON ta.Arr_Id = td.Arrival_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = ta.Product_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'SALES' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(sdsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Delivery_Order_Id = td.Delivery_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = sdsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'DEBIT_NOTE' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(dnsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Debit_Note_Stock_Info dnsi ON dnsi.DB_Id = td.Debit_Note_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = dnsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'CREDIT_NOTE' THEN (
                                    SELECT SUM(
                                        CASE 
                                            WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                                            ELSE CAST(cnsi.Bill_Qty / TRY_CAST(pck.Pack AS DECIMAL(18,2)) AS DECIMAL(18,2))
                                        END
                                    )
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Credit_Note_Stock_Info cnsi ON cnsi.CR_Id = td.Credit_Note_Id
                                    JOIN tbl_Product_Master pm ON pm.Product_Id = cnsi.Item_Id
                                    LEFT JOIN tbl_Pack_Master pck ON pck.Pack_Id = pm.Pack_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                ELSE 0
                            END, 0
                        ) AS Bags_Qty,
                        COALESCE(
                            CASE 
                                WHEN tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN (
                                    SELECT SUM(ta.QTY)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Trip_Arrival ta ON ta.Arr_Id = td.Arrival_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'SALES' THEN (
                                    SELECT SUM(sdsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Delivery_Order_Id = td.Delivery_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'DEBIT_NOTE' THEN (
                                    SELECT SUM(dnsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Debit_Note_Stock_Info dnsi ON dnsi.DB_Id = td.Debit_Note_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                WHEN tm.BillType = 'CREDIT_NOTE' THEN (
                                    SELECT SUM(cnsi.Bill_Qty)
                                    FROM tbl_Trip_Details td
                                    JOIN tbl_Credit_Note_Stock_Info cnsi ON cnsi.CR_Id = td.Credit_Note_Id
                                    WHERE td.Trip_Id = tm.Trip_Id
                                )
                                ELSE 0
                            END, 0
                        ) AS Tonnage_Qty
                    FROM tbl_Trip_Master tm
                    LEFT JOIN tbl_Voucher_Type vt ON vt.Vocher_Type_Id = tm.VoucherType
                    WHERE tm.Trip_Id NOT IN (
                        SELECT trip_id FROM tbl_Trip_Group_Details
                    )
                    AND ISNULL(tm.TripStatus, '') <> 'Canceled'
                    AND tm.Trip_Date BETWEEN @Fromdate AND @Todate
                    ${Branch_Id ? ' AND tm.Branch_Id = @Branch_Id ' : ''}
                    ${BillType ? ' AND tm.BillType = @BillType ' : ''};
                `);

            const result = await request;
            const trips = toArray(result.recordsets[0]);

            if (trips.length > 0) {
                dataFound(res, trips);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const createTripGroup = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const {
                entry_date, branch_id, vehicle_number, start_km, end_km,
                start_time, end_time, prepared_by, checked_by, approved_by,
                Trips_List = []
            } = req.body;

            if (!checkIsNumber(branch_id)) {
                return invalidInput(res, 'Branch is required');
            }
            if (Trips_List.length === 0) {
                return invalidInput(res, 'At least one trip must be selected');
            }

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('entry_date', sql.Date, entry_date ? ISOString(entry_date) : ISOString())
                .input('branch_id', sql.Int, branch_id)
                .input('vehicle_number', sql.NVarChar, vehicle_number || '')
                .input('start_km', sql.Decimal(18,2), toNumber(start_km))
                .input('end_km', sql.Decimal(18,2), toNumber(end_km))
                .input('start_time', sql.DateTimeOffset, start_time ? new Date(start_time) : null)
                .input('end_time', sql.DateTimeOffset, end_time ? new Date(end_time) : null)
                .input('prepared_by', sql.Int, checkIsNumber(prepared_by) ? prepared_by : null)
                .input('checked_by', sql.Int, checkIsNumber(checked_by) ? checked_by : null)
                .input('approved_by', sql.Int, checkIsNumber(approved_by) ? approved_by : null)
                .query(`
                    INSERT INTO tbl_Trip_Group (
                        entry_date, branch_id, vehicle_number, start_km, end_km,
                        start_time, end_time, prepared_by, checked_by, approved_by
                    )
                    OUTPUT INSERTED.id
                    VALUES (
                        @entry_date, @branch_id, @vehicle_number, @start_km, @end_km,
                        @start_time, @end_time, @prepared_by, @checked_by, @approved_by
                    );
                `);

            const result = await request;
            const group_id = result.recordset[0].id;

            for (const trip of Trips_List) {
                await new sql.Request(transaction)
                    .input('group_id', sql.UniqueIdentifier, group_id)
                    .input('trip_id', sql.Int, trip.Trip_Id)
                    .query(`
                        INSERT INTO tbl_Trip_Group_Details (group_id, trip_id)
                        VALUES (@group_id, @trip_id);
                    `);
            }

            await transaction.commit();
            success(res, 'Trip Group created successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const updateTripGroup = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const {
                id, entry_date, branch_id, vehicle_number, start_km, end_km,
                start_time, end_time, prepared_by, checked_by, approved_by,
                Trips_List = []
            } = req.body;

            if (!id || !checkIsNumber(branch_id)) {
                return invalidInput(res, 'Group ID and Branch are required');
            }
            if (Trips_List.length === 0) {
                return invalidInput(res, 'At least one trip must be selected');
            }

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, id)
                .input('entry_date', sql.Date, entry_date ? ISOString(entry_date) : ISOString())
                .input('branch_id', sql.Int, branch_id)
                .input('vehicle_number', sql.NVarChar, vehicle_number || '')
                .input('start_km', sql.Decimal(18,2), toNumber(start_km))
                .input('end_km', sql.Decimal(18,2), toNumber(end_km))
                .input('start_time', sql.DateTimeOffset, start_time ? new Date(start_time) : null)
                .input('end_time', sql.DateTimeOffset, end_time ? new Date(end_time) : null)
                .input('prepared_by', sql.Int, checkIsNumber(prepared_by) ? prepared_by : null)
                .input('checked_by', sql.Int, checkIsNumber(checked_by) ? checked_by : null)
                .input('approved_by', sql.Int, checkIsNumber(approved_by) ? approved_by : null)
                .query(`
                    UPDATE tbl_Trip_Group
                    SET entry_date = @entry_date,
                        branch_id = @branch_id,
                        vehicle_number = @vehicle_number,
                        start_km = @start_km,
                        end_km = @end_km,
                        start_time = @start_time,
                        end_time = @end_time,
                        prepared_by = @prepared_by,
                        checked_by = @checked_by,
                        approved_by = @approved_by
                    WHERE id = @id;
                    
                    DELETE FROM tbl_Trip_Group_Details WHERE group_id = @id;
                `);

            await request;

            for (const trip of Trips_List) {
                const tripId = trip.Trip_Id || trip.trip_id;
                await new sql.Request(transaction)
                    .input('group_id', sql.UniqueIdentifier, id)
                    .input('trip_id', sql.Int, tripId)
                    .query(`
                        INSERT INTO tbl_Trip_Group_Details (group_id, trip_id)
                        VALUES (@group_id, @trip_id);
                    `);
            }

            await transaction.commit();
            success(res, 'Trip Group updated successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const deleteTripGroup = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const { id } = req.body;

            if (!id) {
                return invalidInput(res, 'Group ID is required');
            }

            await transaction.begin();

            await new sql.Request(transaction)
                .input('id', sql.UniqueIdentifier, id)
                .query(`
                    DELETE FROM tbl_Trip_Group_Details WHERE group_id = @id;
                    DELETE FROM tbl_Trip_Group WHERE id = @id;
                `);

            await transaction.commit();
            success(res, 'Trip Group deleted successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    return {
        getTripGroups,
        getNotGroupedTrips,
        createTripGroup,
        updateTripGroup,
        deleteTripGroup
    }
}

export default tripGroupActivity();
