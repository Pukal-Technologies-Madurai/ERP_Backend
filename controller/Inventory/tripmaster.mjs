
import sql from 'mssql'
import { servError, dataFound, noData, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, ISOString, Subraction, createPadString, isValidDate, toNumber, filterableText, toArray, isEqualNumber, isValidNumber } from '../../helper_functions.mjs'
import { insertMultipleBatch, insertMultipleBatchUsageDetails, reverseMultipleBatch } from '../../middleware/batchTransactions.mjs';

const tripActivities = () => {

    const getTripDetails = async (req, res) => {
        try {
            const FromDate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const ToDate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            if (!FromDate && !ToDate) {
                return invalidInput(res, 'Select StartDate & EndDate')
            }

            const request = new sql.Request();
            request.input('FromDate', sql.Date, FromDate);
            request.input('ToDate', sql.Date, ToDate);

            const result = await request.query(
                `
                -- declaring table variable
                DECLARE @FilteredTrip TABLE (Trip_Id INT);
                -- inserting data to temp table
                INSERT INTO @FilteredTrip (Trip_Id)
                SELECT Trip_Id
                FROM tbl_Trip_Master
                WHERE Trip_Date BETWEEN @FromDate AND @ToDate
                    AND BillType IN (
                        'MATERIAL INWARD',
                        'OTHER GODOWN',
                        'CREDIT_NOTE',
                        'DEBIT_NOTE'
                    );
                -- 0. main table
                SELECT
                    tm.*,
                    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                    COALESCE(cb_created.Name, 'unknown') AS Created_By_User,
                    COALESCE(cb_updated.Name, 'unknown') AS Updated_By_User,
                    COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet,
                    COALESCE(gmm.Godown_Name, 'unknown') AS addressGodown_Name,
                    COALESCE(gmm.Godown_Address, 'unknown') AS addressGodownAddress,
                    COALESCE(gmm.Gst_No, 'unknown') AS addressGodownGst_No,
                    COALESCE(gmm.Phone_No, 'unknown') AS addressGodownPhone_No,
                    COALESCE(rm.Retailer_Name, '') AS concernGet
                FROM tbl_Trip_Master AS tm
                LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = tm.Branch_Id
                LEFT JOIN tbl_Users AS cb_created ON cb_created.UserId = tm.Created_By
                LEFT JOIN tbl_Users AS cb_updated ON cb_updated.UserId = tm.Updated_By
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = tm.VoucherType
                LEFT JOIN tbl_Godown_Master AS gmm ON gmm.Godown_Id = tm.addressGodown
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = tm.concern
                WHERE tm.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip);
                -- 1. TRIP_DETAILS
                SELECT
                    td.*, ta.*,
                    COALESCE(pm.Product_Rate, 0) AS Product_Rate,
                    CASE 
                        WHEN TRY_CAST(pck.Pack AS DECIMAL(18,2)) IS NULL
                                OR TRY_CAST(pck.Pack AS DECIMAL(18,2)) = 0
                        THEN 0
                        ELSE CONVERT(
                            DECIMAL(18,2),
                            COALESCE(QTY, 0) / TRY_CAST(pck.Pack AS DECIMAL(18,2))
                        )
                    END AS Bag,
                    COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                    -- Modified FromLocation logic
                    CASE 
                        WHEN ta.From_Location = 35 THEN COALESCE(tm.addressGodown_Name, 'Unknown')
                        ELSE COALESCE(gm_from.Godown_Name, 'Unknown')
                    END AS FromLocation,
                    CASE 
                        WHEN ta.From_Location = 35 THEN COALESCE(tm.addressGodownAddress, 'Unknown')
                        ELSE COALESCE(gm_from.Godown_Address, 'Unknown')
                    END AS FromAddress,
                    CASE 
                        WHEN ta.From_Location = 35 THEN COALESCE(tm.addressGodownGst_No, 'Unknown')
                        ELSE COALESCE(gm_from.Gst_No, 'Unknown')
                    END AS FromGst,
                    CASE 
                        WHEN ta.From_Location = 35 THEN COALESCE(tm.addressGodownPhone_No, 'Unknown')
                        ELSE COALESCE(gm_from.Phone_No, 'Unknown')
                    END AS FromPhone,
                    -- Modified ToLocation logic
                    CASE 
                        WHEN ta.To_Location = 35 THEN COALESCE(tm.addressGodown_Name, 'Unknown')
                        ELSE COALESCE(gm_to.Godown_Name, 'Unknown')
                    END AS ToLocation,
                    CASE 
                        WHEN ta.To_Location = 35 THEN COALESCE(tm.addressGodownAddress, 'Unknown')
                        ELSE COALESCE(gm_to.Godown_Address, 'Unknown')
                    END AS ToAddress,
                    CASE 
                        WHEN ta.To_Location = 35 THEN COALESCE(tm.addressGodownPhone_No, 'Unknown')
                        ELSE COALESCE(gm_to.Phone_No, 'Unknown')
                    END AS ToPhone,
                    CASE 
                        WHEN ta.To_Location = 35 THEN COALESCE(tm.addressGodownGst_No, 'Unknown')
                        ELSE COALESCE(gm_to.Gst_No, 'Unknown')
                    END AS ToGst,
                    po.OrderId AS arrivalOrderId
                FROM
                    tbl_Trip_Details AS td
                LEFT JOIN tbl_Trip_Arrival as ta ON ta.Arr_Id = td.Arrival_Id
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = ta.Product_Id
                LEFT JOIN tbl_Godown_Master AS gm_from ON gm_from.Godown_Id = ta.From_Location
                LEFT JOIN tbl_Godown_Master AS gm_to ON gm_to.Godown_Id = ta.To_Location
                LEFT JOIN tbl_PurchaseOrderDeliveryDetails AS po ON po.Trip_Id = td.Trip_Id AND po.Trip_Item_SNo = td.Arrival_Id
                LEFT JOIN tbl_Pack_Master as pck ON pck.Pack_Id = pm.Pack_Id
                LEFT JOIN (
                    SELECT 
                        tmm.Trip_Id, 
                        gmm.Godown_Name AS addressGodown_Name,
                        gmm.Godown_Address AS addressGodownAddress,
                        gmm.Gst_No AS addressGodownGst_No,
                        gmm.Phone_No AS addressGodownPhone_No
                    FROM tbl_Trip_Master AS tmm
                    LEFT JOIN tbl_Godown_Master AS gmm ON gmm.Godown_Id = tmm.addressGodown
                    WHERE tmm.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                ) AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE td.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip);
                -- 2. MAPED_ARRIVALS
                SELECT 
                    Id, OrderId, Trip_Id, Trip_Item_SNo, TransporterIndex,
                    LocationId, Location, ArrivalDate, ItemId, ItemName,
                    Quantity, Weight, BilledRate
                FROM tbl_PurchaseOrderDeliveryDetails
                WHERE Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip);
                -- 3. TRIP_EMPLOYEES
                SELECT 
                    te.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category
                FROM 
                    tbl_Trip_Employees AS te
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = te.Involved_Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = te.Cost_Center_Type_Id
                WHERE 
                    te.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip);
                -- 4. ALTERATION_HISTORY
                SELECT ah.*, u.Name AS alterByGet 
                FROM tbl_Alteration_History AS ah
                LEFT JOIN tbl_Users AS u ON u.UserId = ah.alterBy
                WHERE 
                    alteredTable = 'tbl_Trip_Master' 
                    AND alteredRowId IN (SELECT Trip_Id FROM @FilteredTrip);
                -- 5. CREDIT_NOTE
                SELECT
                    td.Id AS TD_Id,
                    td.Trip_Id,
                    td.Credit_Note_Id,
                    cngi.CR_Id,
                    cngi.CR_Inv_No,
                    cngi.CR_Date,
                    cngi.Voucher_Type,
                    v.Voucher_Type AS VoucherTypeGet,
                    cngi.Retailer_Id,
                    rm.Retailer_Name,
                    cngi.Total_Invoice_value
                FROM tbl_Trip_Details AS td
                LEFT JOIN tbl_Credit_Note_Gen_Info AS cngi ON cngi.CR_Id = td.Credit_Note_Id 
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = cngi.Retailer_Id
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = cngi.Voucher_Type
                WHERE td.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                  AND td.Credit_Note_Id IS NOT NULL;
                -- 6. CREDIT_NOTE_PRODUCTS
                SELECT
                    si.CR_Id,
                    si.S_No,
                    si.Item_Id,
                    COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                    si.HSN_Code,
                    si.Bill_Qty AS QTY,
                    si.Item_Rate,
                    si.Taxable_Amount,
                    si.Tax_Rate AS Gst_Rate,
                    si.Cgst AS Cgst_P,
                    si.Sgst AS Sgst_P,
                    si.Igst AS Igst_P,
                    si.Cgst_Amo,
                    si.Sgst_Amo,
                    si.Igst_Amo,
                    si.Final_Amo AS Total_Value
                FROM tbl_Credit_Note_Stock_Info AS si
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
                WHERE si.CR_Id IN (
                    SELECT td.Credit_Note_Id
                    FROM tbl_Trip_Details AS td
                    WHERE td.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                      AND td.Credit_Note_Id IS NOT NULL
                )
                ORDER BY si.S_No;
                -- 7. DEBIT_NOTE
                SELECT
                    td.Id AS TD_Id,
                    td.Trip_Id,
                    td.Debit_Note_Id,
                    dngi.DB_Id,
                    dngi.DB_Inv_No,
                    dngi.DB_Date,
                    dngi.Voucher_Type,
                    v.Voucher_Type AS VoucherTypeGet,
                    dngi.Retailer_Id,
                    rm.Retailer_Name,
                    dngi.Total_Invoice_value
                FROM tbl_Trip_Details AS td
                LEFT JOIN tbl_Debit_Note_Gen_Info AS dngi ON dngi.DB_Id = td.Debit_Note_Id 
                LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dngi.Retailer_Id
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = dngi.Voucher_Type
                WHERE td.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                  AND td.Debit_Note_Id IS NOT NULL;
                -- 8. DEBIT_NOTE_PRODUCTS
                SELECT
                    si.DB_Id,
                    si.S_No,
                    si.Item_Id,
                    COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
                    si.HSN_Code,
                    si.Bill_Qty AS QTY,
                    si.Item_Rate,
                    si.Taxable_Amount,
                    si.Tax_Rate AS Gst_Rate,
                    si.Cgst AS Cgst_P,
                    si.Sgst AS Sgst_P,
                    si.Igst AS Igst_P,
                    si.Cgst_Amo,
                    si.Sgst_Amo,
                    si.Igst_Amo,
                    si.Final_Amo AS Total_Value
                FROM tbl_Debit_Note_Stock_Info AS si
                LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
                WHERE si.DB_Id IN (
                    SELECT td.Debit_Note_Id
                    FROM tbl_Trip_Details AS td
                    WHERE td.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                      AND td.Debit_Note_Id IS NOT NULL
                )
                ORDER BY si.S_No;`
            );

            const Trip_Master = toArray(result.recordsets[0]);
            const Trip_Details = toArray(result.recordsets[1]);
            const Maped_Arrivals = toArray(result.recordsets[2]);
            const Trip_Employees = toArray(result.recordsets[3]);
            const Alteration_History = toArray(result.recordsets[4]);
            const Credit_Note = toArray(result.recordsets[5]);
            const Credit_Note_Products = toArray(result.recordsets[6]);
            const Debit_Note = toArray(result.recordsets[7]);
            const Debit_Note_Products = toArray(result.recordsets[8]);

            if (Trip_Master.length > 0) {

                const parsed = Trip_Master.map(o => {
                    const creditNoteList = Credit_Note
                        .filter(cn => isEqualNumber(cn.Trip_Id, o.Trip_Id))
                        .map(cn => ({
                            ...cn,
                            Products_List: Credit_Note_Products.filter(cnp => isEqualNumber(cnp.CR_Id, cn.CR_Id))
                        }));

                    const debitNoteList = Debit_Note
                        .filter(dn => isEqualNumber(dn.Trip_Id, o.Trip_Id))
                        .map(dn => ({
                            ...dn,
                            Products_List: Debit_Note_Products.filter(dnp => isEqualNumber(dnp.DB_Id, dn.DB_Id))
                        }));

                    return {
                        ...o,
                        Products_List: Trip_Details.filter(td => isEqualNumber(td.Trip_Id, o.Trip_Id)),
                        Employees_Involved: Trip_Employees.filter(te => isEqualNumber(te.Trip_Id, o.Trip_Id)),
                        ConvertedPurchaseOrders: Maped_Arrivals.filter(ma => isEqualNumber(ma.Trip_Id, o.Trip_Id)),
                        Alteration_History: Alteration_History.filter(ah => isEqualNumber(ah.alteredRowId, o.Trip_Id)),
                        Credit_Note_List: creditNoteList,
                        Debit_Note_List: debitNoteList,
                    };
                });

                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {

            servError(e, res);
        }
    };

    const createTripDetails = async (req, res) => {

        const transaction = new sql.Transaction();

        try {
            const {
                Branch_Id,
                Vehicle_No = '',
                Trip_ST_KM = '',
                Trip_EN_KM = '',
                Created_By = '',
                PhoneNumber = '',
                LoadingLoad = 0,
                LoadingEmpty = 0,
                UnloadingLoad = 0,
                UnloadingEmpty = 0,
                Godownlocation = 0,
                addressGodown = 0,
                BillType = '',
                VoucherType = '',
                Narration = '',
                TripStatus = 'New',
                Product_Array = [],
                EmployeesInvolved = [],
                concern = null
            } = req.body;

            const Trip_Date = req.body?.Trip_Date ? ISOString(req.body.Trip_Date) : ISOString();
            const StartTime = req.body?.StartTime ? new Date(req.body.StartTime) : new Date();
            const EndTime = req.body?.EndTime ? new Date(req.body.EndTime) : new Date();

            if (!isValidNumber(Branch_Id) || !BillType || !isValidNumber(VoucherType)) {
                return invalidInput(res, 'Select Branch, BillType, VoucherType is required');
            }

            if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
                return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
            }

            // ------------------ Unique Trip_Id

            const Trip_Id = Number((await new sql.Request().query(`
               SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
               FROM tbl_Trip_Master`
            ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');

            // ------------------ year details

            const getYearId = await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE Fin_Start_Date <= @Trip_Date AND Fin_End_Date >= @Trip_Date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];

            // ------------------ T_No

            const T_No = Number((await new sql.Request()
                .input('VoucherType', VoucherType)
                .input('Year_Id', Year_Id)
                .query(`
                    SELECT COALESCE(MAX(T_No), 0) AS MaxId
                    FROM tbl_Trip_Master
                    WHERE VoucherType = @VoucherType
                    AND Year_Id = @Year_Id;`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(T_No)) throw new Error('Failed to get T_No');

            // ------------------ Voucher Code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', VoucherType)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            // ------------------ TR_INV_ID creations

            const TR_INV_ID = Voucher_Code + "/" + createPadString(T_No, 6) + '/' + Year_Desc;

            // ------------------ Trip_No (day wise count)

            const Trip_No = Number((await new sql.Request()
                .input('Trip_Date', Trip_Date)
                .input('Godownlocation', Godownlocation)
                .query(`
                    SELECT COALESCE(MAX(Trip_No), 0) AS MaxId
                    FROM tbl_Trip_Master    
                    WHERE 
                        Trip_Date = @Trip_Date
                        AND Godownlocation = @Godownlocation`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_No)) throw new Error('Failed to get Trip_No');

            const Challan_No = createPadString(Trip_Id, 4);
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);

            await transaction.begin();

            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', toNumber(Trip_Id))
                .input('TR_INV_ID', TR_INV_ID)
                .input('Branch_Id', toNumber(Branch_Id))
                .input('T_No', T_No)
                .input('VoucherType', toNumber(VoucherType))
                .input('Year_Id', Year_Id)
                .input('Trip_No', toNumber(Trip_No))
                .input('Challan_No', Challan_No)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('PhoneNumber', PhoneNumber)
                .input('LoadingLoad', Number(LoadingLoad || 0))
                .input('LoadingEmpty', Number(LoadingEmpty || 0))
                .input('UnloadingLoad', Number(UnloadingLoad || 0))
                .input('UnloadingEmpty', Number(UnloadingEmpty || 0))
                .input('Godownlocation', toNumber(Godownlocation))
                .input('addressGodown', toNumber(addressGodown))
                .input('BillType', BillType)
                .input('Narration', Narration)
                .input('TripStatus', 'New')
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Trip_EN_KM', Number(Trip_EN_KM))
                .input('Trip_Tot_Kms', toNumber(Trip_Tot_Kms))
                .input('concern', BillType === 'MATERIAL INWARD' ? concern : null)
                .input('Created_By', Created_By)
                .input('Created_At', new Date())
                .query(`
                    INSERT INTO tbl_Trip_Master (
                       Trip_Id, TR_INV_ID, Branch_Id, T_No, VoucherType, Year_Id, Challan_No, Trip_Date, Vehicle_No,
                       PhoneNumber, LoadingLoad, LoadingEmpty, UnloadingLoad, UnloadingEmpty, Narration, BillType,
                       StartTime, EndTime, Trip_No, Trip_ST_KM, Trip_Tot_Kms, Trip_EN_KM, Godownlocation, addressGodown, TripStatus,
                       concern, Created_At, Created_By
                    ) VALUES (
                       @Trip_Id, @TR_INV_ID, @Branch_Id, @T_No, @VoucherType, @Year_Id, @Challan_No, @Trip_Date, @Vehicle_No,
                       @PhoneNumber, @LoadingLoad, @LoadingEmpty, @UnloadingLoad, @UnloadingEmpty, @Narration, @BillType,
                       @StartTime, @EndTime, @Trip_No, @Trip_ST_KM, @Trip_Tot_Kms, @Trip_EN_KM, @Godownlocation, @addressGodown, @TripStatus,
                       @concern, @Created_At, @Created_By
                    );`
                );

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Trip_Date', Trip_Date)
                    .input('Arrival_Id', toNumber(product?.Arrival_Id))
                    .input('CR_Id', toNumber(product?.CR_Id))
                    .input('DB_Id', toNumber(product?.DB_Id))
                    .input('Batch_No', product?.Batch_No)
                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('QTY', toNumber(product?.QTY))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(product?.To_Location))
                    .input('Created_By', toNumber(Created_By))
                    .query(`
                        ${(filterableText(product?.Batch_No) && BillType !== 'CREDIT_NOTE' && BillType !== 'DEBIT_NOTE') ? `
                    -- batch update in arrival
                            UPDATE tbl_Trip_Arrival
                            SET Batch_No = @Batch_No
                            WHERE Arr_Id = @Arrival_Id;` : ''}
                    -- Trip details
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, ${BillType === 'CREDIT_NOTE' ? 'Credit_Note_Id' : BillType === 'DEBIT_NOTE' ? 'Debit_Note_Id' : 'Arrival_Id'}
                        ) VALUES (
                            @Trip_Id, ${BillType === 'CREDIT_NOTE' ? '@CR_Id' : BillType === 'DEBIT_NOTE' ? '@DB_Id' : '@Arrival_Id'}
                        );
                        ${BillType === 'CREDIT_NOTE' ? `
                        UPDATE tbl_Credit_Note_Gen_Info
                        SET stockInwardDate = @Trip_Date
                        WHERE CR_Id = @CR_Id;    
                        ` : ''}
                        ${BillType === 'DEBIT_NOTE' ? `
                        UPDATE tbl_Debit_Note_Gen_Info
                        SET stockOutwardDate = @Trip_Date
                        WHERE DB_Id = @DB_Id;    
                        ` : ''}
                        `
                    );

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            // Batch operations in bulk (outside loop for better performance)
            const batchProducts = Product_Array.filter(p => filterableText(p?.Batch_No));

            if (BillType === 'MATERIAL INWARD' && batchProducts.length > 0) {
                const consumeResult = await insertMultipleBatchUsageDetails(
                    transaction,
                    batchProducts.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.From_Location),
                        quantity: toNumber(p.QTY),
                        type: 'MATERIAL_INWARD',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Created_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!consumeResult) throw new Error('Batch usage creation failed');

                const batchResult = await insertMultipleBatch(
                    transaction,
                    batchProducts.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.To_Location),
                        quantity: toNumber(p.QTY),
                        rate: toNumber(p.Gst_Rate),
                        type: 'MATERIAL_INWARD',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Created_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchResult) throw new Error('Batch creation failed');
            }

            if (BillType === 'OTHER GODOWN' && batchProducts.length > 0) {
                const batchResult = await insertMultipleBatchUsageDetails(
                    transaction,
                    batchProducts.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.From_Location),
                        quantity: toNumber(p.QTY),
                        type: 'OTHER_GODOWN',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Created_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchResult) throw new Error('Batch usage details creation failed');

                const batchInwardResult = await insertMultipleBatch(
                    transaction,
                    batchProducts.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.To_Location),
                        quantity: toNumber(p.QTY),
                        rate: toNumber(p.Gst_Rate),
                        type: 'OTHER_GODOWN',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Created_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchInwardResult) throw new Error('Batch creation in destination failed');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                const employeeData = await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                       INSERT INTO tbl_Trip_Employees (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                       VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);`
                    );

                if (employeeData.rowsAffected[0] === 0) throw new Error('Failed to save employee data');
            }

            await transaction.commit();
            success(res, 'Trip Created!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const updateTripDetails = async (req, res) => {
        const transaction = req.transaction;

        try {

            const {
                Trip_Id,
                Branch_Id,
                Trip_Date,
                Vehicle_No,
                Trip_ST_KM = 0,
                Trip_EN_KM = 0,
                PhoneNumber = '',
                LoadingLoad = 0,
                LoadingEmpty = 0,
                UnloadingLoad = 0,
                UnloadingEmpty = 0,
                Godownlocation = 0,
                addressGodown = 0,
                BillType = 0,
                Narration = '',
                Updated_By = '',
                TripStatus,
                Product_Array = [],
                EmployeesInvolved = [],
                concern = null
            } = req.body;

            const StartTime = isValidDate(req.body.StartTime) ? new Date(req.body.StartTime) : null,
                EndTime = isValidDate(req.body.EndTime) ? new Date(req.body.EndTime) : null;

            if (!checkIsNumber(Branch_Id) || Trip_Date === '' || !checkIsNumber(Trip_Id)) {
                return invalidInput(res, 'Check values ');
            }
            if (StartTime && EndTime && new Date(StartTime) > new Date(EndTime)) {
                return invalidInput(res, 'Start Time cannot be greater than End Time');
            }
            if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
                return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
            }

            const tripCheck = await new sql.Request()
                .input('Trip_Id', Trip_Id)
                .query(`
                    SELECT COUNT(*) AS TripCount FROM tbl_Trip_Master WHERE Trip_Id = @Trip_Id
                `);

            if (tripCheck.recordset[0].TripCount === 0) {
                return invalidInput(res, 'Trip does not exist');
            }

            const Trip_Tot_Kms = Subraction(Trip_EN_KM, Trip_ST_KM);

            const updateMaster = await new sql.Request(transaction)
                .input('Trip_Id', toNumber(Trip_Id))
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('PhoneNumber', PhoneNumber)
                .input('LoadingLoad', toNumber(LoadingLoad || 0))
                .input('LoadingEmpty', toNumber(LoadingEmpty || 0))
                .input('UnloadingLoad', toNumber(UnloadingLoad || 0))
                .input('UnloadingEmpty', toNumber(UnloadingEmpty || 0))
                .input('BillType', BillType)
                .input('Narration', Narration)
                .input('TripStatus', TripStatus || 'NOT ISSUED')
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_ST_KM', toNumber(Trip_ST_KM))
                .input('Trip_EN_KM', toNumber(Trip_EN_KM))
                .input('Trip_Tot_Kms', Trip_Tot_Kms)
                .input('Godownlocation', Godownlocation)
                .input('addressGodown', toNumber(addressGodown))
                .input('concern', BillType === 'MATERIAL INWARD' ? concern : null)
                .input('Updated_By', Updated_By)
                .input('Updated_At', new Date())
                .query(`
                    UPDATE tbl_Trip_Master
                    SET 
                        Branch_Id = @Branch_Id,
                        Trip_Date = @Trip_Date,
                        Vehicle_No = @Vehicle_No,
                        StartTime = @StartTime,
                        EndTime = @EndTime,
                        Trip_ST_KM = @Trip_ST_KM,
                        Trip_EN_KM = @Trip_EN_KM,
                        Trip_Tot_Kms = @Trip_Tot_Kms,
                        Godownlocation = @Godownlocation,
                        addressGodown = @addressGodown,
                        PhoneNumber = @PhoneNumber,
                        LoadingLoad = @LoadingLoad,
                        LoadingEmpty = @LoadingEmpty,
                        UnloadingLoad = @UnloadingLoad,
                        UnloadingEmpty = @UnloadingEmpty,
                        BillType = @BillType,
                        Narration = @Narration,
                        TripStatus = @TripStatus,
                        Updated_By = @Updated_By,
                        Updated_At = @Updated_At,
                        concern = @concern
                    WHERE Trip_Id = @Trip_Id
               `);

            if (updateMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to update Trip Master');
            }

            // Fetch existing batch rows for reversal
            const existingBatchRows = (await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .query(`
                    SELECT ta.Batch_No, ta.Product_Id, ta.To_Location, ta.From_Location, ta.QTY
                    FROM tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival AS ta ON ta.Arr_Id = td.Arrival_Id
                    WHERE 
                        td.Trip_Id = @Trip_Id
                        AND ta.Batch_No IS NOT NULL
                        AND ta.Batch_No <> ''
                `)).recordset;

            if (existingBatchRows.length > 0) {
                // Reverse inward batch at destination
                const batchReversalResult = await reverseMultipleBatch(
                    transaction,
                    existingBatchRows.map(row => ({
                        pre_batch: row.Batch_No,
                        pre_item_id: row.Product_Id,
                        pre_godown_id: row.To_Location,
                        pre_quantity: row.QTY,
                        pre_type: BillType === 'MATERIAL INWARD' ? 'MATERIAL_INWARD' : 'OTHER_GODOWN',
                        pre_reference_id: Trip_Id,
                        created_by: Updated_By
                    })),
                    true
                );
                if (!batchReversalResult) throw new Error('Batch reversal failed');

                // Reverse outward batch at source if OTHER GODOWN or MATERIAL INWARD
                if (BillType === 'OTHER GODOWN' || BillType === 'MATERIAL INWARD') {
                    const sourceReversalResult = await reverseMultipleBatch(
                        transaction,
                        existingBatchRows.map(row => ({
                            pre_batch: row.Batch_No,
                            pre_item_id: row.Product_Id,
                            pre_godown_id: row.From_Location,
                            pre_quantity: row.QTY,
                            pre_type: BillType === 'MATERIAL INWARD' ? 'MATERIAL_INWARD' : 'OTHER_GODOWN',
                            pre_reference_id: Trip_Id,
                            created_by: Updated_By
                        })),
                        false
                    );
                    if (!sourceReversalResult) throw new Error('Source batch reversal failed');
                }
            }

            // Clean up old records
            await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .query(`
                    UPDATE tbl_Trip_Arrival
                    SET Batch_No = null
                    WHERE Arr_Id IN (
                        SELECT Arrival_Id
                        FROM tbl_Trip_Details
                        WHERE Trip_Id = @Trip_Id
                    );
                    DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id;
                    DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id;
                `);

            for (let i = 0; i < Product_Array.length; i++) {
                const product = Product_Array[i];
                const result = await new sql.Request(transaction)
                    .input('Trip_Id', toNumber(Trip_Id))
                    .input('Trip_Date', Trip_Date)
                    .input('Arrival_Id', toNumber(product?.Arrival_Id))
                    .input('CR_Id', toNumber(product?.CR_Id))
                    .input('DB_Id', toNumber(product?.DB_Id))
                    .input('Batch_No', product?.Batch_No ? product?.Batch_No : null)
                    .input('Product_Id', toNumber(product?.Product_Id))
                    .input('QTY', toNumber(product?.QTY))
                    .input('Gst_Rate', toNumber(product?.Gst_Rate))
                    .input('From_Location', toNumber(product?.From_Location))
                    .input('To_Location', toNumber(product?.To_Location))
                    .input('Created_By', toNumber(Updated_By))
                    .query(`
                        ${(filterableText(product?.Batch_No) && BillType !== 'CREDIT_NOTE' && BillType !== 'DEBIT_NOTE') ? `
                    -- batch update in arrival
                        UPDATE tbl_Trip_Arrival
                        SET Batch_No = @Batch_No
                        WHERE Arr_Id = @Arrival_Id;` : ''}
                    -- trip details
                        INSERT INTO tbl_Trip_Details (
                            Trip_Id, ${BillType === 'CREDIT_NOTE' ? 'Credit_Note_Id' : BillType === 'DEBIT_NOTE' ? 'Debit_Note_Id' : 'Arrival_Id'}
                        ) VALUES (
                            @Trip_Id, ${BillType === 'CREDIT_NOTE' ? '@CR_Id' : BillType === 'DEBIT_NOTE' ? '@DB_Id' : '@Arrival_Id'}
                        );
                        ${BillType === 'CREDIT_NOTE' ? `
                        UPDATE tbl_Credit_Note_Gen_Info
                        SET stockInwardDate = @Trip_Date
                        WHERE CR_Id = @CR_Id;    
                        ` : ''}
                        ${BillType === 'DEBIT_NOTE' ? `
                        UPDATE tbl_Debit_Note_Gen_Info
                        SET stockOutwardDate = @Trip_Date
                        WHERE DB_Id = @DB_Id;    
                        ` : ''}
                        `
                    );

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            // Batch operations in bulk (outside loop for better performance)
            const batchProductsEdit = Product_Array.filter(p => filterableText(p?.Batch_No));

            if (BillType === 'MATERIAL INWARD' && batchProductsEdit.length > 0) {
                const consumeResult = await insertMultipleBatchUsageDetails(
                    transaction,
                    batchProductsEdit.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.From_Location),
                        quantity: toNumber(p.QTY),
                        type: 'MATERIAL_INWARD',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Updated_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!consumeResult) throw new Error('Batch usage creation failed');

                const batchResult = await insertMultipleBatch(
                    transaction,
                    batchProductsEdit.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.To_Location),
                        quantity: toNumber(p.QTY),
                        rate: toNumber(p.Gst_Rate),
                        type: 'MATERIAL_INWARD',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Updated_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchResult) throw new Error('Batch creation failed');
            }

            if (BillType === 'OTHER GODOWN' && batchProductsEdit.length > 0) {
                const batchResult = await insertMultipleBatchUsageDetails(
                    transaction,
                    batchProductsEdit.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.From_Location),
                        quantity: toNumber(p.QTY),
                        type: 'OTHER_GODOWN',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Updated_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchResult) throw new Error('Batch usage details creation failed');

                const batchInwardResult = await insertMultipleBatch(
                    transaction,
                    batchProductsEdit.map(p => ({
                        batch: p.Batch_No,
                        batch_alias: p.Batch_Alias || p.Batch_No,
                        trans_date: new Date(Trip_Date),
                        item_id: toNumber(p.Product_Id),
                        godown_id: toNumber(p.To_Location),
                        quantity: toNumber(p.QTY),
                        rate: toNumber(p.Gst_Rate),
                        type: 'OTHER_GODOWN',
                        reference_id: toNumber(p.Arrival_Id),
                        created_by: toNumber(Updated_By),
                        batch_id: p.Batch_Id || ''
                    }))
                );
                if (!batchInwardResult) throw new Error('Batch creation in destination failed');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                        INSERT INTO tbl_Trip_Employees (
                            Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        );`
                    );
            }

            await transaction.commit();
            success(res, 'Trip Updated!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const getTripForAssignCostCenter = async (req, res) => {
        try {
            const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
            const status = req.query.staffStatus;

            const getTripQuery = new sql.Request()
                .input('reqDate', sql.Date, reqDate)
                .input('status', sql.Int, toNumber(status))
                .query(`
                -- filtered trip ids temp table
                    DECLARE @FilteredTrip TABLE (Trip_Id BIGINT);
                -- inserting data to temp table
                    INSERT INTO @FilteredTrip (Trip_Id)
                    SELECT Trip_Id
                    FROM tbl_Trip_Master
                    WHERE 
                        CONVERT(DATE, Trip_Date) = @reqDate
                        AND BillType IN (
                            'MATERIAL INWARD', 'OTHER GODOWN',
                            'CREDIT_NOTE', 'DEBIT_NOTE'
                        )
                        AND TripStatus <> 'Cancelled'
                        ${isEqualNumber(status, 0) ? ' AND ISNULL(staffInvolvedStatus, 0) = 0 ' : ''}
                -- general info
                    SELECT 
                        tm.Trip_Id,
                        tm.TR_INV_ID AS PR_Inv_Id,
                        tm.VoucherType,
                        vt.Voucher_Type AS voucherTypeGet,
                        tm.Trip_Date AS Process_date,
                        tm.Godownlocation,
                        g.Godown_Name AS godownNameGet,
                        tm.Branch_Id,
                        b.BranchName AS branchNameGet,
                        tm.TripStatus AS PR_Status, 
                        tm.Narration,
                        tm.Created_By,
                        tm.Created_At,
                        ISNULL(tm.staffInvolvedStatus, 0) staffInvolvedStatus,
                        CONVERT(DATETIME, tm.Created_At) AS createdOn,
                        COALESCE(cb.Name, 'unknown') AS Created_BY_Name
                    FROM tbl_Trip_Master AS tm
                    LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = tm.VoucherType
                    LEFT JOIN tbl_Godown_Master AS g ON g.Godown_Id = tm.Godownlocation
                    LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = tm.Branch_Id
                    LEFT JOIN tbl_Users AS cb ON cb.UserId = tm.Created_By
                    WHERE tm.Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip)
                    ORDER BY tm.Trip_Id DESC;

                -- involved staffs
                    SELECT 
                        stf.Trip_Id AS PR_Id,
                        stf.Cost_Center_Type_Id AS Emp_Type_Id,
                        stf.Involved_Emp_Id AS Emp_Id,
                        ISNULL(e.Cost_Center_Name, 'Unknown') AS Emp_Name,
                        cc.Cost_Category AS Involved_Emp_Type
                    FROM tbl_Trip_Employees AS stf
                    LEFT JOIN tbl_ERP_Cost_Center AS e
                        ON e.Cost_Center_Id = stf.Involved_Emp_Id
                    LEFT JOIN tbl_ERP_Cost_Category AS cc
                        ON cc.Cost_Category_Id = stf.Cost_Center_Type_Id
                    WHERE stf.Trip_Id IN (SELECT DISTINCT Trip_Id FROM @FilteredTrip)
                    ORDER BY stf.Trip_Id;

                -- Unique Cost Category IDs
                    SELECT DISTINCT Cost_Center_Type_Id AS Emp_Type_Id
                    FROM tbl_Trip_Employees
                    WHERE Trip_Id IN (SELECT Trip_Id FROM @FilteredTrip);

                -- Cost Types
                    SELECT Cost_Category_Id, Cost_Category, COALESCE(Order_By, 999) AS Order_By
                    FROM tbl_ERP_Cost_Category
                    ORDER BY Order_By;
                `
                );

            const result = await getTripQuery;

            const [
                tripList = [], 
                staffs = [], 
                uniqeInvolvedStaffs = [], 
                costTypes = []
            ] = result.recordsets;

            const tripWithStaffs = tripList.map(trip => {
                const involvedStaffs = staffs.filter(stf =>
                    isEqualNumber(stf.PR_Id, trip.Trip_Id)
                ).map(stf => ({
                    ...stf,
                    PR_Id: toNumber(stf.PR_Id),
                    Emp_Type_Id: toNumber(stf.Emp_Type_Id),
                    Emp_Id: toNumber(stf.Emp_Id)
                }));

                return {
                    ...trip,
                    Trip_Id: toNumber(trip.Trip_Id),
                    PR_Id: toNumber(trip.Trip_Id),
                    involvedStaffs,
                };
            });

            res.status(200).json({
                success: true,
                data: tripWithStaffs,
                others: {
                    costTypes: toArray(costTypes),
                    uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(i => toNumber(i.Emp_Type_Id))
                }
            });

        } catch (e) {
            servError(e, res);
        }
    };

    const postAssignCostCenterToTrip = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const { PR_Id, involvedStaffs, staffInvolvedStatus } = req.body;
            const Trip_Id = PR_Id;

            await transaction.begin();

            const updateStatusRequest = new sql.Request(transaction);
            await updateStatusRequest
                .input('Trip_Id', sql.BigInt, Trip_Id)
                .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
                .query(`
                    UPDATE tbl_Trip_Master
                    SET staffInvolvedStatus = @staffInvolvedStatus
                    WHERE Trip_Id = @Trip_Id;`
                );

            // Update involved staffs
            const request = new sql.Request(transaction);
            await request
                .input('Trip_Id', sql.BigInt, Trip_Id)
                .input('involvedStaffs', sql.NVarChar(sql.MAX), JSON.stringify(involvedStaffs))
                .query(`
                    -- Delete old staff entries
                    DELETE FROM tbl_Trip_Employees
                    WHERE Trip_Id = @Trip_Id;
                    
                    -- Insert new staff entries
                    INSERT INTO tbl_Trip_Employees (Trip_Id, Cost_Center_Type_Id, Involved_Emp_Id)
                    SELECT 
                        @Trip_Id,
                        JSON_VALUE(value, '$.Emp_Type_Id') AS Cost_Center_Type_Id,
                        JSON_VALUE(value, '$.Emp_Id') AS Involved_Emp_Id
                    FROM OPENJSON(@involvedStaffs);`
                );

            await transaction.commit();

            success(res, 'Changes saved');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const multipleTripStaffUpdate = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const { CostCategory, PR_Id, involvedStaffs, staffInvolvedStatus, deliveryStatus = 'New' } = req.body;
            const tripIdsStr = PR_Id.join(',');

            await transaction.begin();

            await new sql.Request(transaction)
                .input('tripIds', sql.NVarChar(sql.MAX), tripIdsStr)
                .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
                .input('TripStatus', sql.VarChar, deliveryStatus)
                .query(`
                    UPDATE tbl_Trip_Master
                    SET 
                        staffInvolvedStatus = @staffInvolvedStatus
                        -- TripStatus = @TripStatus
                    WHERE Trip_Id IN (
                        SELECT CAST(value AS INT)
                        FROM STRING_SPLIT(@tripIds, ',')
                    );`
                );

            if (PR_Id.length > 0 && CostCategory) {
                await new sql.Request(transaction)
                    .input('tripIds', sql.NVarChar(sql.MAX), tripIdsStr)
                    .input('Cost_Center_Type_Id', sql.Int, CostCategory)
                    .query(`
                        DELETE FROM tbl_Trip_Employees
                        WHERE 
                            Trip_Id IN (
                                SELECT CAST(value AS INT)
                                FROM STRING_SPLIT(@tripIds, ',')
                            )
                            AND Cost_Center_Type_Id = @Cost_Center_Type_Id;`
                    );
            }

            if (involvedStaffs.length > 0) {
                const values = [];
                PR_Id.forEach(tripId => {
                    involvedStaffs.forEach(staffId => {
                        values.push(`(${tripId}, ${CostCategory}, ${staffId})`);
                    });
                });

                if (values.length > 0) {
                    const query = `
                        INSERT INTO tbl_Trip_Employees (Trip_Id, Cost_Center_Type_Id, Involved_Emp_Id)
                        VALUES ${values.join(',')};`;
                    const request = new sql.Request(transaction);
                    await request.query(query);
                }
            }

            await transaction.commit();
            success(res, 'Trip Staff Updated!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const multipleTripStaffDelete = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            if (!req.body.CostCategory || !req.body.PR_Id || !Array.isArray(req.body.PR_Id)) {
                return res.status(400).json({
                    success: false,
                    message: 'CostCategory and PR_Id (array) are required'
                });
            }

            const { CostCategory, PR_Id } = req.body;
            const tripIdsStr = PR_Id.join(',');

            await transaction.begin();

            await new sql.Request(transaction)
                .input('tripIds', sql.NVarChar(sql.MAX), tripIdsStr)
                .input('Cost_Center_Type_Id', sql.Int, CostCategory)
                .query(`
                    DELETE FROM tbl_Trip_Employees
                    WHERE 
                        Trip_Id IN (
                            SELECT CAST(value AS INT)
                            FROM STRING_SPLIT(@tripIds, ',')
                        )
                        AND Cost_Center_Type_Id = @Cost_Center_Type_Id;`
                );

            await transaction.commit();
            success(res, `Staff with CostCategory ${CostCategory} removed from ${PR_Id.length} records!`);
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    return {
        getTripDetails,
        createTripDetails,
        updateTripDetails,
        getTripForAssignCostCenter,
        postAssignCostCenterToTrip,
        multipleTripStaffUpdate,
        multipleTripStaffDelete
    }
}

export default tripActivities()
