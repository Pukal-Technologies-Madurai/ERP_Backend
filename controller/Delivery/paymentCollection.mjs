import { dataFound, failed, invalidInput, noData, sentData, servError, success } from "../../res.mjs";
import { Addition, checkIsNumber, createPadString, filterableText, ISOString, Subraction, toNumber, stringCompare, toArray } from '../../helper_functions.mjs';
import sql from 'mssql';
import { getNextId } from '../../middleware/miniAPIs.mjs';


const collectionGeneralInfo = [
    'collection_id',
    'collection_inv_no',
    'voucher_id',
    'collection_no',
    'year_id',
    'retailer_id',
    'payed_by',
    'collection_date',
    'collection_type',
    'collected_amount',
    'latitude',
    'longitude',
    'created_on',
    'alterd_on',
    'collected_by',
    'created_by',
    'updated_by'
];

const collectionDetailsInfo = [
    'auto_id',
    'collection_id',
    'bill_id',
    'bill_amount',
    'collected_amount',
    'verify_status',
    'payment_status',
    'bank_date',
    'narration',
    'verified_by',
    'verified_at'
];

const paymentMethods = ['CASH', 'UPI', 'CHEQUE', 'BANK'];

const payTypeAndStatus = [
    {
        type: 'CASH',
        default: 'CREATED-CASH',
        statusOptions: ['CREATED-CASH', 'CASH-PROCESSING', 'CASH-MISSING']
    },
    {
        type: 'UPI',
        default: 'CREATED-UPI',
        statusOptions: ['CREATED-UPI', 'UPI-PROCESSING', 'UPI-NOT-RECEIVED']
    },
    {
        type: 'CHECK',
        default: 'CREATED-CHECK',
        statusOptions: ['CREATED-CHECK', 'CHECK-PROCESSING', 'CHECK-BOUNCE']
    },
    {
        type: 'BANK ACCOUNT',
        default: 'CREATED-BANK-TRANSFER',
        statusOptions: ['CREATED-BANK-TRANSFER', 'BANK-PROCESSING', 'BANK-NOT-RECEIVED']
    },
];

const toArr = (arr) => Array.isArray(arr) ? arr : []

const Payments = () => {

    const getPayments = async (req, res) => {
        try {
            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const {
                retailer_id = '',
                voucher_id = '',
                collection_type = '',
                verify_status = '',
                payment_status = '',
                collected_by = '',
            } = req.query;

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('retailer_id', retailer_id)
                .input('voucher_id', voucher_id)
                .input('collection_type', collection_type)
                .input('verify_status', verify_status)
                .input('payment_status', payment_status)
                .input('collected_by', collected_by)
                .query(`
                    WITH GENERALDETAILS AS (
                    	SELECT
                    		gi.*,
                    		COALESCE(r.Retailer_Name, 'not found') AS RetailerGet,
                    		COALESCE(v.Voucher_Type, 'not found') AS VoucherGet,
                    		COALESCE(cre.Name, 'not found') AS CreatedByGet,
                    		COALESCE(upd.Name, 'not found') AS UpdatedByGet,
                    		COALESCE(col.Name, 'not found') AS CollectedByGet,
                    		COALESCE(verify.Name, 'not found') AS VerifiedByGet
                    	FROM tbl_Sales_Receipt_General_Info AS gi
                        LEFT JOIN tbl_Retailers_Master AS r
                            ON r.Retailer_Id = gi.retailer_id
                        LEFT JOIN tbl_Voucher_Type AS v
                            ON v.Vocher_Type_Id = gi.voucher_id
                    	LEFT JOIN tbl_Users AS cre
                    		ON cre.UserId = gi.created_by
                    	LEFT JOIN tbl_Users AS upd
                    		ON upd.UserId = gi.updated_by
                        LEFT JOIN tbl_Users AS col
                    		ON col.UserId = gi.collected_by
                        LEFT JOIN tbl_Users AS verify
                    		ON verify.UserId = gi.collected_by
                    	WHERE 
                            gi.collection_date BETWEEN @Fromdate AND @Todate
                            ${checkIsNumber(retailer_id) ? ' AND gi.retailer_id = @retailer_id ' : ''}
                            ${checkIsNumber(voucher_id) ? ' AND gi.voucher_id = @voucher_id ' : ''}
                            ${checkIsNumber(collected_by) ? ' AND gi.collected_by = @collected_by ' : ''}
                            ${collection_type ? ' AND gi.collection_type = @collection_type ' : ''}
                            ${verify_status ? ' AND gi.verify_status = @verify_status ' : ''}
                            ${payment_status ? ' AND gi.payment_status = @payment_status ' : ''}
                    ), DETAILSINFO AS (
                    	SELECT 
                            di.*,
                            so.Do_Inv_No, so.Do_Date,
                            COALESCE(so.Total_Invoice_value, 0) AS Total_Invoice_value
                    	FROM tbl_Sales_Receipt_Details_Info AS di
                    	LEFT JOIN tbl_Sales_Delivery_Gen_Info AS so
                    		ON so.Do_Id = di.bill_id
                    	WHERE di.collection_id IN (SELECT DISTINCT collection_id FROM GENERALDETAILS)
                    ), RECEIPTTOTALS AS (
                        SELECT
                            SUM(collected_amount) AS total_collected_amount, bill_id
                        FROM tbl_Sales_Receipt_Details_Info
                        WHERE bill_id IN (SELECT DISTINCT bill_id FROM DETAILSINFO)
                        GROUP BY bill_id
                    )
                    SELECT 
                    	gi.*,
                    	COALESCE((
                    		SELECT di.*,
                            COALESCE((
                                SELECT r.total_collected_amount 
                                FROM RECEIPTTOTALS AS r
                                WHERE r.bill_id = di.bill_id
                            ), 0) AS total_receipt_amount
                    		FROM DETAILSINFO di
                    		WHERE di.collection_id = gi.collection_id
                    		FOR JSON PATH
                    	), '[]') AS Receipts
                    FROM GENERALDETAILS AS gi
                    ORDER BY gi.collection_date DESC`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(gi => ({
                    ...gi,
                    Receipts: JSON.parse(gi.Receipts)
                }));

                dataFound(res, parseData);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const PaymentEntry = async (req, res) => {
        const transaction = new sql.Transaction();
        try {
            const {
                retailer_id,
                payed_by = null,
                collection_type = 'CASH',
                collection_account,
                voucher_id,
                latitude = null,
                longitude = null,
                collected_by,
                created_by,
                Collections = [],
                verify_status = 0,
                payment_status,
                narration = null,
                verified_by = null
            } = req.body;

            const collection_date = req.body?.collection_date ? ISOString(req.body.collection_date) : ISOString();
            const bank_date = req.body?.bank_date ? ISOString(req.body.bank_date) : null;

            const validation = {
                isArray: !Array.isArray(Collections),
                bill_id: Collections?.some(col => !checkIsNumber(col.bill_id)),
                retailer_id: !checkIsNumber(retailer_id),
                created_by: !checkIsNumber(created_by),
                collected_by: !checkIsNumber(collected_by),
                voucher_id: !checkIsNumber(voucher_id),
                collection_type: !paymentMethods.some(method => filterableText(method) === filterableText(collection_type)),
                bill_amount: Collections?.some(col => !checkIsNumber(col.bill_amount)),
                collected_amount: Collections?.some(col => !checkIsNumber(col.collected_amount)),
            };
            const isError = Object.entries(validation).some(([key, value]) => value === true)

            if (isError) {
                console.log('Validation failed:', validation); // Helpful for debugging
                return invalidInput(res, 'Invalid or missing data provided.', validation);
            }

            // unique id

            const getCollectionId = await getNextId({ table: 'tbl_Sales_Receipt_General_Info', column: 'collection_id' });
            if (!getCollectionId.status || !checkIsNumber(getCollectionId.MaxId)) throw new Error('Failed to get collection_id');
            const collection_id = getCollectionId.MaxId;

            // year and desc

            const getYearId = await new sql.Request()
                .input('collection_date', collection_date)
                .query(`
                    SELECT Id AS Year_Id, Year_Desc
                    FROM tbl_Year_Master
                    WHERE 
                        Fin_Start_Date <= @collection_date 
                        AND Fin_End_Date >= @collection_date`
                );

            if (getYearId.recordset.length === 0) throw new Error('Year_Id not found');

            const { Year_Id, Year_Desc } = getYearId.recordset[0];

            // process on based on year and voucher

            const collection_no = Number((await new sql.Request()
                .input('year_id', Year_Id)
                .input('voucher_id', voucher_id)
                .query(`
                    SELECT COALESCE(MAX(collection_no), 0) AS MaxId
                    FROM tbl_Sales_Receipt_General_Info
                    WHERE year_id = @year_id
                    AND voucher_id = @voucher_id`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(collection_no)) throw new Error('Failed to get P_No');

            // voucher code

            const VoucherCodeGet = await new sql.Request()
                .input('Vocher_Type_Id', voucher_id)
                .query(`
                    SELECT Voucher_Code
                    FROM tbl_Voucher_Type
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                );

            if (VoucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');

            const Voucher_Code = VoucherCodeGet.recordset[0]?.Voucher_Code || '';

            const collection_inv_no = Voucher_Code + '/' + createPadString(collection_no, 6) + '/' + Year_Desc;

            const total_amount = Collections.reduce((total, col) => Addition(total, col.collected_amount), 0);

            await transaction.begin();

            const defaultPayStatus = payTypeAndStatus.find(val => val.type === collection_type).default;

            const insertGI = new sql.Request(transaction)
                .input(`collection_id`, collection_id)
                .input(`collection_inv_no`, collection_inv_no)
                .input(`voucher_id`, voucher_id)
                .input(`collection_no`, collection_no)
                .input(`year_id`, Year_Id)
                .input(`retailer_id`, retailer_id)
                .input(`payed_by`, payed_by)
                .input(`collection_date`, collection_date)
                .input(`bank_date`, bank_date)
                .input(`collection_type`, collection_type)
                .input(`collection_account`, collection_account)
                .input(`total_amount`, total_amount)
                .input(`collected_by`, collected_by)
                .input(`latitude`, latitude)
                .input(`longitude`, longitude)
                .input(`created_by`, created_by)
                .input(`verify_status`, verify_status)
                .input(`payment_status`, payment_status ? payment_status : defaultPayStatus)
                .input(`narration`, narration)
                .input(`verified_by`, verified_by)
                .query(`
                    INSERT INTO tbl_Sales_Receipt_General_Info (
                        collection_id, collection_inv_no, voucher_id, collection_no, year_id, 
                        retailer_id, payed_by, collection_date, bank_date, collection_type, collection_account, total_amount, 
                        collected_by, latitude, longitude, created_by, 
                        verify_status, payment_status, narration, verified_by
                    ) VALUES (
                        @collection_id, @collection_inv_no, @voucher_id, @collection_no, @year_id, 
                        @retailer_id, @payed_by, @collection_date, @bank_date, @collection_type, @collection_account, @total_amount, 
                        @collected_by, @latitude, @longitude, @created_by,
                        @verify_status, @payment_status, @narration, @verified_by
                    )
                `);

            const GIresult = await insertGI;

            if (GIresult.rowsAffected[0] === 0) throw new Error('Failed to insert Collection -gi');

            for (let i = 0; i < Collections.length; i++) {
                const collection = Collections[i];
                const {
                    bill_id, bill_amount, collected_amount,
                    bank_date = null, narration, verified_by = null, payment_status
                } = collection;

                const insertCD = new sql.Request(transaction)
                    .input(`collection_id`, collection_id)
                    .input(`bill_id`, bill_id)
                    .input(`bill_amount`, bill_amount)
                    .input(`collected_amount`, collected_amount)
                    .query(`
                        INSERT INTO tbl_Sales_Receipt_Details_Info (
                            collection_id, bill_id, bill_amount, collected_amount
                        ) VALUES (
                            @collection_id, @bill_id, @bill_amount, @collected_amount
                        ); `
                    );

                const result = await insertCD;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert Collection -details');
            }

            await transaction.commit();
            success(res, 'Payment Saved');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const editCollectionGeneralInfo = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                collection_id,
                collection_type = 'CASH',
                verify_status = 0,
                payment_status,
                collection_account,
                narration = null,
                verified_by = null,
                Receipts = []
            } = req.body;

            const collection_date = req.body?.collection_date ? ISOString(req.body.collection_date) : ISOString();
            const bank_date = req.body?.bank_date ? ISOString(req.body.bank_date) : null;

            const validation = {
                collection_id: !checkIsNumber(collection_id),
                collection_type: !paymentMethods.some(method => stringCompare(method, collection_type)),
            };
            const isError = Object.entries(validation).some(([key, value]) => value === true)

            if (isError) {
                console.log('Validation failed:', validation); // Helpful for debugging
                return invalidInput(res, 'Invalid or missing data provided.', validation);
            }

            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('collection_id', collection_id)
                .input('collection_date', collection_date)
                .input('bank_date', bank_date)
                .input('collection_type', collection_type)
                .input('collection_account', collection_account)
                .input('verify_status', verify_status)
                .input('payment_status', payment_status)
                .input('narration', narration)
                .input('verified_by', checkIsNumber(verified_by) ? verified_by : null)
                .query(`
                    UPDATE tbl_Sales_Receipt_General_Info
                    SET 
                        collection_date = @collection_date,
                        bank_date = @bank_date,
                        collection_type = @collection_type,
                        collection_account = @collection_account,
                        verify_status = @verify_status,
                        payment_status = @payment_status,
                        narration = @narration,
                        verified_by = @verified_by
                    WHERE
                        collection_id = @collection_id;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) throw new Error('Failed to update receipt general info');

            for (const [index, receipt] of toArray(Receipts).entries()) {
                const request = new sql.Request(transaction)
                    .input('collection_id', receipt?.collection_id)
                    .input('bill_id', receipt?.bill_id)
                    .input('collected_amount', toNumber(receipt?.collected_amount))
                    .input('auto_id', receipt?.auto_id)
                    .query(`
                        UPDATE tbl_Sales_Receipt_Details_Info
                        SET 
                            collected_amount = @collected_amount
                        WHERE
                            collection_id = @collection_id
                            AND bill_id = @bill_id
                            AND auto_id = @auto_id
                        `);

                const result = await request;

                if (result.rowsAffected[0] === 0) throw new Error('Failed to update receipt details info');
            }

            await transaction.commit();

            success(res, 'Changes Saved');

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const deleteReceiptEntry = async (req, res) => {
        try {
            const { collection_id } = req.body;

            if (!checkIsNumber(collection_id)) return invalidInput(res, 'collection_id is required');

            const request = new sql.Request()
                .input('collection_id', collection_id)
                .query(`
                    DELETE FROM tbl_Sales_Receipt_General_Info WHERE collection_id = @collection_id;
                    DELETE FROM tbl_Sales_Receipt_Details_Info WHERE collection_id = @collection_id; 
                    `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Receipt deleted successfully');
            } else {
                failed(res, 'Failed to delete receipt.')
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailerBills = async (req, res) => {
        try {
            const { retailer_id } = req.query;

            if (!checkIsNumber(retailer_id)) {
                return invalidInput(res, 'Invalid Retailer ID');
            }

            const request = new sql.Request()
                .input('Retailer_Id', retailer_id)
                .query(`
                    WITH DeliveryGI AS (
                        SELECT 
                            so.*,
                            rm.Retailer_Name AS Retailer_Name,
                            erpUser.Name AS Delivery_Person_Name, 
                            bm.BranchName AS Branch_Name,
                            cb.Name AS Created_BY_Name,
                            rmt.Route_Name AS Routename,
                            am.Area_Name AS AreaName,
                            rmt.Route_Id AS Route_Id,
                            rm.Area_Id AS Area_Id,
                            st.Status AS DeliveryStatusName,
                            sgi.SO_Date AS SaleOrderDate,
                            COALESCE((
                                SELECT SUM(collected_amount)
                                FROM tbl_Sales_Receipt_Details_Info
                                WHERE bill_id = so.Do_Id
                            ), 0) AS receiptsTotalAmount
                        FROM
                            tbl_Sales_Delivery_Gen_Info AS so
                        LEFT JOIN tbl_Retailers_Master AS rm
                            ON rm.Retailer_Id = so.Retailer_Id
                        LEFT JOIN tbl_Status AS st
                            ON st.Status_Id = so.Delivery_Status
                        LEFT JOIN tbl_Users AS sp
                            ON sp.UserId = so.Delivery_Person_Id
                        LEFT JOIN tbl_Branch_Master bm
                            ON bm.BranchId = so.Branch_Id
                        LEFT JOIN tbl_Users AS cb
                            ON cb.UserId = so.Created_by
                        LEFT JOIN tbl_Route_Master AS rmt
                            ON rmt.Route_Id = rm.Route_Id
                        LEFT JOIN tbl_Area_Master AS am
                            ON am.Area_Id = rm.Area_Id
                        LEFT JOIN tbl_Sales_Order_Gen_Info AS sgi
                            ON sgi.So_Id = so.So_No
                        LEFT JOIN tbl_ERP_Cost_Center AS ecc
                            ON ecc.Cost_Center_Id = so.Delivery_Person_Id 
                        LEFT JOIN tbl_Users AS erpUser
                            ON erpUser.UserId = ecc.User_Id
                        WHERE 
                            so.Retailer_Id = @Retailer_Id
                    ), DeliveryDI AS (
                        SELECT
                            oi.*,
                            pm.Product_Id,
                            COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                            COALESCE(u.Units, 'not available') AS UOM,
                            COALESCE(b.Brand_Name, 'not available') AS BrandGet
                        FROM
                            tbl_Sales_Delivery_Stock_Info AS oi
                        LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                        LEFT JOIN tbl_UOM AS u
                            ON u.Unit_Id = oi.Unit_Id
                        LEFT JOIN tbl_Brand_Master AS b
                            ON b.Brand_Id = pm.Brand
                        WHERE
                            oi.Delivery_Order_Id IN (SELECT Do_Id FROM DeliveryGI)
                    ), Payments AS (
                        SELECT 
                            di.*,
                            COALESCE(col.Name, 'not found') AS CollectedByGet,
                            COALESCE(cre.Name, 'not found') AS CreatedByGet,
                    		COALESCE(upd.Name, 'not found') AS UpdatedByGet,
                            gi.payed_by,
                            gi.collection_date,
                            gi.collection_type,
                            gi.latitude,
                            gi.longitude,
                            gi.verify_status,
                            gi.payment_status,
                            gi.narration,
                            gi.bank_date
                    	FROM tbl_Sales_Receipt_Details_Info AS di
                        LEFT JOIN tbl_Sales_Receipt_General_Info AS gi
                            ON di.collection_id = gi.collection_id
                        LEFT JOIN tbl_Users AS verify
                    		ON verify.UserId = gi.verified_by
                        LEFT JOIN tbl_Users AS col
                    		ON col.UserId = gi.collected_by
                        LEFT JOIN tbl_Users AS cre
                    		ON cre.UserId = gi.created_by
                    	LEFT JOIN tbl_Users AS upd
                    		ON upd.UserId = gi.updated_by
                    	WHERE di.bill_id IN (SELECT Do_Id FROM DeliveryGI)
                    )
                    SELECT 
                        gi.*,
                        COALESCE((
                            SELECT
                                sd.*
                            FROM
                                DeliveryDI AS sd
                            WHERE
                                sd.Delivery_Order_Id = gi.Do_Id
                            FOR JSON PATH
                        ), '[]') AS Products_List,
                        COALESCE((
                            SELECT 
                                pgi.*
                            FROM Payments AS pgi
                            WHERE pgi.bill_id = gi.Do_Id
                            ORDER BY pgi.collection_date
                            FOR JSON PATH
                        ), '[]') AS Payments
                    FROM DeliveryGI AS gi
                    ORDER BY gi.Do_Date ASC`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(obj => ({
                    ...obj,
                    Products_List: JSON.parse(obj.Products_List),
                    Payments: JSON.parse(obj.Payments)
                }));

                const withPendingAmount = parseData.map(receipt => ({
                    pendingAmount: Subraction(
                        toNumber(receipt?.Total_Invoice_value),
                        receipt.Payments.reduce((acc, rec) => Addition(acc, toNumber(rec?.collected_amount)), 0)
                    ),
                    ...receipt,
                }))

                dataFound(res, withPendingAmount)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getRetailersWhoHasBills = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        rm.Retailer_Id,
                        rm.Retailer_Name,
                        COUNT(DISTINCT so.Do_Id) AS Total_Bills
                    FROM 
                        tbl_Sales_Delivery_Gen_Info AS so
                    LEFT JOIN tbl_Retailers_Master AS rm
                        ON rm.Retailer_Id = so.Retailer_Id
                    GROUP BY 
                        rm.Retailer_Id, rm.Retailer_Name
					ORDER BY rm.Retailer_Name
                `);

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getFilterValues = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    -- Voucher
                    SELECT DISTINCT rec.voucher_id AS value, v.Voucher_Type AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = rec.voucher_id
                    -- Retailer
                    SELECT DISTINCT rec.retailer_id AS value, r.Retailer_Name AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = rec.retailer_id
                    -- Collection Type
                    SELECT DISTINCT collection_type AS value, collection_type AS label
                    FROM tbl_Sales_Receipt_General_Info
                    -- Payment Status
                    SELECT DISTINCT payment_status AS value, payment_status AS label
                    FROM tbl_Sales_Receipt_General_Info
                    -- Collected By
                    SELECT DISTINCT rec.collected_by AS value, u.Name AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = rec.collected_by;
                    --Verify_Status
                    SELECT DISTINCT 
                    rec.verify_status AS value,
                    CASE 
                        WHEN rec.verify_status = 1 THEN 'Verified'
                        WHEN rec.verify_status = 0 THEN 'Pending'
                        ELSE 'Unknown'
                    END AS label
                    FROM tbl_Sales_Receipt_General_Info AS rec;
                    `
                );

            const result = await request;

            dataFound(res, [], 'data found', {
                voucherType: toArr(result.recordsets[0]),
                retailers: toArr(result.recordsets[1]),
                collectionType: toArr(result.recordsets[2]),
                paymentStatus: toArr(result.recordsets[3]),
                collectedBy: toArr(result.recordsets[4]),
                verifyStatus: toArr(result.recordsets[5])
            });
        } catch (e) {
            servError(e, res);
        }
    }

    const getCreditAccounts = async (req, res) => {
        try {
            const { Type } = req.query;

            const request = new sql.Request()
                .input('Type', Type)
                .query(`
                    SELECT * 
                    FROM tbl_Bank_Details
                    ${Type ? ' WHERE Type = @Type; ' : ''}`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getOutStanding = async (req, res) => {
        try {
            const getValidDate = (dateString) => {
                if (!dateString) return new Date();
                const date = new Date(dateString);
                return isNaN(date.getTime()) ? new Date() : date;
            };

            const fromDate = getValidDate(req.query.Fromdate);
            const toDate = getValidDate(req.query.Todate);

            const previousDate = new Date(fromDate);
            previousDate.setDate(previousDate.getDate() - 1);

            const retailer_id = req.query.Retailer_Id ? parseInt(req.query.Retailer_Id) : '';
            const area_id = req.query.Area_Id ? parseInt(req.query.Area_Id) : '';
            const route_id = req.query.Route_Id ? parseInt(req.query.Route_Id) : '';

            const request = new sql.Request()
                .input('PreviousDate', sql.Date, previousDate)
                .input('Fromdate', sql.Date, fromDate)
                .input('Todate', sql.Date, toDate)
                .input('Retailer_Id', sql.VarChar(50), retailer_id.toString())
                .input('Area_Id', sql.Int, parseInt(area_id) || 0)
                .input('Route_Id', sql.Int, parseInt(route_id) || 0);

            const result = await request.execute('GetRetailerOutstandingTotals');

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(obj => ({
                    ...obj

                }));

                dataFound(res, parseData);
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    };

    const verifyStatus = async (req, res) => {
        const { collectionIdToUpdate = [] } = req.body;

        if (!Array.isArray(collectionIdToUpdate)) {
            return res.status(400).json({ message: 'No collection IDs provided' });
        }

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            for (const collection_id of collectionIdToUpdate) {
                const request = new sql.Request(transaction);

                request
                    .input('collection_id', sql.Int, collection_id)
                    .input('verify_status', sql.Int, 1)
                    .input('verified_by', sql.Int, 1);

                const result = await request.query(`
                    UPDATE tbl_Sales_Receipt_General_Info
                    SET 
                        verify_status = @verify_status,
                        verified_by = @verified_by
                    WHERE
                        collection_id = @collection_id;`
                );

                if (result.rowsAffected[0] === 0) {
                    throw new Error(`Failed to update collection_id: ${collection_id}`);
                }
            }

            await transaction.commit();
            return success(res, 'Collections verified successfully!');
        } catch (e) {
            await transaction.rollback();
            return servError(e, res);
        }
    };

    return {
        getPayments,
        PaymentEntry,
        editCollectionGeneralInfo,
        deleteReceiptEntry,
        getRetailersWhoHasBills,
        getRetailerBills,
        getFilterValues,
        getCreditAccounts,
        getOutStanding,
        verifyStatus
    }
}

export default Payments();