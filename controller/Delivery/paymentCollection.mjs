import { dataFound, invalidInput, noData, servError, success } from "../../res.mjs";
import { Addition, checkIsNumber, filterableText, ISOString } from '../../helper_functions.mjs';
import sql from 'mssql';

const collectionGeneralInfo = [
    'collection_id',
    'collection_no',
    'payed_by',
    'collection_date',
    'collection_type',
    'collected_amount',
    'latitude',
    'longitude',
    'created_by',
    'updated_by',
    'created_on',
    'alterd_on',
];

const collectionDetailsInfo = [
    'auto_id',
    'collection_id',
    'bill_id',
    'credit_ledger',
    'credit_amount',
    'debit_ledger',
    'debit_amount',
    'verify_status',
    'bank_date',
    'narration',
    'verified_by',
    'verified_at',
];


const Payments = () => {

    const getPayments = async (req, res) => {
        try {
            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH GENERALDETAILS AS (
                    	SELECT
                    		gi.*,
                    		COALESCE(cre.Name, 'not found') AS CreatedByGet,
                    		COALESCE(upd.Name, 'not found') AS UpdatedByGet
                    	FROM tbl_Sales_Payment_Collection_General_Info AS gi
                    	LEFT JOIN tbl_Users AS cre
                    		ON cre.UserId = gi.created_by
                    	LEFT JOIN tbl_Users AS upd
                    		ON upd.UserId = gi.updated_by
                    	WHERE gi.collection_date BETWEEN @Fromdate AND @Todate
                    ), DETAILSINFO AS (
                    	SELECT di.*
                    	FROM tbl_Sales_Payment_Collection_Details_Info AS di
                    	WHERE di.collection_id IN (SELECT collection_id FROM GENERALDETAILS)
                    ), DeliveryDI AS (
                        SELECT
                            oi.*,
                            pm.Product_Id,
                            COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                            COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                            COALESCE(u.Units, 'not available') AS UOM,
                            COALESCE(b.Brand_Name, 'not available') AS BrandGet,
                            COALESCE(rm.Retailer_Name, 'not available') AS RetailerGet
                        FROM tbl_Sales_Delivery_Stock_Info AS oi
                        LEFT JOIN tbl_Product_Master AS pm
                            ON pm.Product_Id = oi.Item_Id
                        LEFT JOIN tbl_UOM AS u
                            ON u.Unit_Id = oi.Unit_Id
                        LEFT JOIN tbl_Brand_Master AS b
                            ON b.Brand_Id = pm.Brand
                    	LEFT JOIN tbl_Sales_Delivery_Gen_Info AS so
                    		ON so.Do_Id = oi.Delivery_Order_Id
                        LEFT JOIN tbl_Retailers_Master AS rm
                            ON rm.Retailer_Id = so.Retailer_Id
                        WHERE
                            oi.Delivery_Order_Id IN (SELECT bill_id FROM DETAILSINFO)
                    )
                    SELECT 
                    	gi.*,
                    	COALESCE((
                    		SELECT di.*,
                    			COALESCE((
                    				SELECT dbi.*
                    				FROM DeliveryDI AS dbi
                    				WHERE dbi.Delivery_Order_Id = di.bill_id
                    				FOR JSON PATH
                    			), '[]') AS DeliveryBillDetails
                    		FROM DETAILSINFO di
                    		WHERE di.collection_id = gi.collection_id
                    		FOR JSON PATH
                    	), '[]') AS PAYMENTS
                    FROM GENERALDETAILS AS gi
                    ORDER BY gi.collection_date DESC`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseData = result.recordset.map(gi => ({
                    ...gi,
                    PAYMENTS: JSON.parse(gi.PAYMENTS)
                }));

                const parseDeliveryItems = parseData.map(gi => ({
                    ...gi,
                    Products_List: gi.Products_List.map(di => ({
                        ...di,
                        DeliveryBillDetails: JSON.parse(di.DeliveryBillDetails)
                    }))
                }));

                dataFound(res, parseDeliveryItems);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const PaymentEntry = async (req, res) => {
        const transaction = sql.Transaction();
        try {
            const {
                payed_by = null, collection_type = 'CASH', latitude = null, longitude = null, created_by, Collections = []
            } = req.body;

            const collection_date = req.body?.collection_date ? ISOString(req.body.collection_date) : ISOString();
            const paymentMethods = ['CASH', 'UPI', 'CHECK'];

            const validation = {
                isArray: !Array.isArray(Collections),
                bill_id: Collections?.some(col => !checkIsNumber(col.bill_id)),
                created_by: !checkIsNumber(created_by),
                collection_type: !paymentMethods.some(method => filterableText(method) === filterableText(collection_type)),
                credit_ledger: Collections?.some(col => !checkIsNumber(col.credit_ledger)),
                credit_amount: Collections?.some(col => !checkIsNumber(col.credit_amount)),
                debit_ledger: Collections?.some(col => !checkIsNumber(col.debit_ledger)),
                debit_amount: Collections?.some(col => !checkIsNumber(col.debit_amount))
            };
            const isError = Object.entries(validation).some(([key, value]) => value === true)

            if (isError) {
                console.log('Validation failed:', validation); // Helpful for debugging
                return invalidInput('Invalid or missing data provided.');
            }

            const getCollectionId = await getNextId({ table: 'tbl_Sales_Payment_Collection_General_Info', column: 'collection_id' });
            if (!getCollectionId.status || !checkIsNumber(getCollectionId.MaxId)) throw new Error('Failed to get collection_id');
            const collection_id = collection_id.MaxId;

            const getCollectionNumber = (await new sql.Request()
                .input('collection_date', collection_date)
                .input('created_by', created_by)
                .query(`
                    SELECT COALESCE(MAX(collection_no), 0) AS collection_no
                    FROM tbl_Sales_Payment_Collection_General_Info
                    WHERE 
                        collection_date = @collection_date
                        AND created_by = @created_by;`
                )
            ).recordset;
            const collection_no = getCollectionNumber[0] ? getCollectionNumber[0]?.collection_no : null;
            if (!checkIsNumber(collection_no)) throw new Error('Failed to get collection_no');

            const collected_amount = Collections.reduce((total, col) => Addition(total, col.credit_amount), 0);

            await transaction.begin();

            const insertGI = new sql.Request(transaction)
                .input(`collection_id`, collection_id)
                .input(`collection_no`, collection_no)
                .input(`payed_by`, payed_by)
                .input(`collection_date`, collection_date)
                .input(`collection_type`, collection_type)
                .input(`collected_amount`, collected_amount)
                .input(`latitude`, latitude)
                .input(`longitude`, longitude)
                .input(`created_by`, created_by)
                .query(`
                    INSERT INTO tbl_Sales_Payment_Collection_General_Info (
                        collection_id, collection_no, payed_by, collection_date, collection_type, collected_amount, 
                        latitude, longitude, created_by
                    ) VALUES (
                        @collection_id, @collection_no, @payed_by, @collection_date, @collection_type, @collected_amount, 
                        @latitude, @longitude, @created_by
                    )
                `);

            const GIresult = await insertGI;

            if (GIresult.rowsAffected[0] === 0) throw new Error('Failed to insert Collection -gi');

            for (let i = 0; i < Collections.length; i++) {
                const collection = Collections[i];
                const {
                    bill_id, credit_ledger, credit_amount, debit_ledger, debit_amount,
                    bank_date = null, narration, verified_by = null, payment_status
                } = collection;

                const insertCD = new sql.Request(transaction)
                    .input(`collection_id`, collection_id)
                    .input(`bill_id`, bill_id)
                    .input(`credit_ledger`, credit_ledger)
                    .input(`credit_amount`, credit_amount)
                    .input(`debit_ledger`, debit_ledger)
                    .input(`debit_amount`, debit_amount)
                    .input(`verify_status`, checkIsNumber(verified_by) ? 1 : 0)
                    .input(`payment_status`, payment_status)
                    .input(`bank_date`, bank_date)
                    .input(`narration`, narration)
                    .input(`verified_by`, verified_by)
                    .input(`verified_at`, checkIsNumber(verified_by) ? new Date() : null)
                    .query(`
                        INSERT INTO tbl_Sales_Payment_Collection_Details (
                            collection_id, bill_id, credit_ledger, credit_amount, debit_ledger, debit_amount, 
                            verify_status, payment_status, bank_date, narration, verified_by, verified_at
                        ) VALUES (
                            @collection_id, @bill_id, @credit_ledger, @credit_amount, @debit_ledger, @debit_amount, 
                            @verify_status, @payment_status, @bank_date, @narration, @verified_by, @verified_at
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

    return {
        getPayments,
        PaymentEntry,
    }
}

export default Payments();