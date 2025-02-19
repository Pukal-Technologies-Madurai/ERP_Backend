import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { checkIsNumber, createPadString, isEqualNumber, ISOString } from '../../helper_functions.mjs';
import { getLOL, getLOS, getNextId } from '../../middleware/miniAPIs.mjs';

const PurchaseOrderDataEntry = () => {

    const getPurchaseOrder = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);

        try {
            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH LOLData AS (
                        SELECT * FROM tbl_Ledger_LOL
                    ), LOSData AS (
                        SELECT * FROM tbl_Stock_LOS
                    ), ORDERINFO AS (
                        SELECT 
                            pgi.*, 
                            COALESCE(lol.Ledger_Name, 'Not found') AS Ledger_Name,
                            COALESCE(lol.Party_District, 'Not found') AS Party_District
                        FROM
                            tbl_PurchaseOrderGeneralDetails AS pgi
                        LEFT JOIN tbl_Retailers_Master AS r
                            ON r.Retailer_Id = pgi.PartyId
                        LEFT JOIN LOLData AS lol
                            ON lol.Ledger_Tally_Id = r.ERP_Id
                        WHERE
                            CONVERT(DATE, pgi.TradeConfirmDate) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                    ), PurchaseInvoiceOrders AS (
                        SELECT PIN_Id, Order_Id
                        FROM tbl_Purchase_Order_Inv_Gen_Order
                        WHERE Order_Id IN (
                            SELECT Sno
                            FROM ORDERINFO
                        )
                    ), PurchaseInvoiceOrderedProducts AS (
                        SELECT PIN_Id, Item_Id, Bill_Qty
                        FROM tbl_Purchase_Order_Inv_Stock_Info
                        WHERE PIN_Id IN (
                            SELECT PIN_Id
                            FROM PurchaseInvoiceOrders
                        )
                    ), ITEM_DETAILS AS (
                        SELECT 
                            i.*, 
                            COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                            COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
                        FROM
                            tbl_PurchaseOrderItemDetails AS i
                        LEFT JOIN tbl_Product_Master AS p
                            ON i.ItemId = p.Product_Id
                        LEFT JOIN LOSData AS los
                            ON los.Stock_Tally_Id = p.ERP_Id
                        WHERE
                            i.OrderId IN (SELECT Sno FROM ORDERINFO)
                    ), DELIVERY_DETAILS AS (
                        SELECT 
                            d.*, 
                            COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                            COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
                        FROM
                            tbl_PurchaseOrderDeliveryDetails AS d
                        LEFT JOIN tbl_Product_Master AS p
                            ON d.ItemId = p.Product_Id
                        LEFT JOIN LOSData AS los
                            ON los.Stock_Tally_Id = p.ERP_Id
                        WHERE
                            d.OrderId IN (SELECT Sno FROM ORDERINFO)
                    ), TRANSPOTER_DETAILS AS (
                        SELECT * FROM tbl_PurchaseOrderTranspoterDetails
                        WHERE OrderId IN (SELECT Sno FROM ORDERINFO)
                    ), STAFF_DETAILS AS (
                        SELECT stf.*,
                        e.Cost_Center_Name AS Emp_Name,
                        cc.Cost_Category
                        FROM tbl_PurchaseOrderEmployeesInvolved AS stf
                            LEFT JOIN tbl_ERP_Cost_Center AS e
                            ON e.Cost_Center_Id = stf.EmployeeId
                            LEFT JOIN tbl_ERP_Cost_Category AS cc
                            ON cc.Cost_Category_Id = stf.CostType
                        WHERE OrderId IN (SELECT Sno FROM ORDERINFO)
                    )
                    SELECT 
                        pgi.*,
                        COALESCE((
                            SELECT 
                                pi.*,
                                COALESCE((
                                    SELECT op.*
                                    FROM PurchaseInvoiceOrderedProducts AS op
                                    WHERE op.PIN_Id = pi.PIN_Id
                                    FOR JSON PATH
                                ), '[]') AS Products
                            FROM PurchaseInvoiceOrders AS pi
                            WHERE pi.Order_Id = pgi.Sno
                            FOR JSON PATH
                        ), '[]') AS ConvertedAsInvoices,
                        COALESCE((
                            SELECT * 
                            FROM ITEM_DETAILS 
                            WHERE ITEM_DETAILS.OrderId = pgi.Sno 
                            FOR JSON PATH
                        ), '[]') AS ItemDetails,
                        COALESCE((
                            SELECT * 
                            FROM DELIVERY_DETAILS 
                            WHERE DELIVERY_DETAILS.OrderId = pgi.Sno 
                            FOR JSON PATH
                        ), '[]') AS DeliveryDetails,
                        COALESCE((
                            SELECT * 
                            FROM TRANSPOTER_DETAILS 
                            WHERE TRANSPOTER_DETAILS.OrderId = pgi.Sno 
                            FOR JSON PATH
                        ), '[]') AS TranspoterDetails,
                        COALESCE((
                            SELECT * 
                            FROM STAFF_DETAILS 
                            WHERE STAFF_DETAILS.OrderId = pgi.Sno 
                            FOR JSON PATH
                        ), '[]') AS StaffDetails
                    FROM
                        ORDERINFO AS pgi;
                    `
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const extractedData = result.recordset.map(o => ({
                    ...o,
                    ConvertedAsInvoices: JSON.parse(o.ConvertedAsInvoices),
                    ItemDetails: JSON.parse(o.ItemDetails),
                    DeliveryDetails: JSON.parse(o.DeliveryDetails),
                    TranspoterDetails: JSON.parse(o.TranspoterDetails),
                    StaffDetails: JSON.parse(o.StaffDetails)
                }));
                const parceProducts = extractedData.map(o => ({
                    ...o,
                    ConvertedAsInvoices: o.ConvertedAsInvoices.map(ci => ({
                        ...ci,
                        Products: JSON.parse(ci.Products)
                    }))
                }));
                const productWiseStatus = parceProducts.map(o => ({
                    ...o,
                    DeliveryDetails: o.DeliveryDetails.map(item => ({
                        ...item,
                        convertableQuantity: Number(item?.Weight) - Number(o.ConvertedAsInvoices.reduce((invAcc, inv) => {
                            return Number(invAcc) + Number(inv.Products.filter(proFil =>
                                isEqualNumber(proFil.Item_Id, item.ItemId)
                            ).reduce((proAcc, pro) => Number(proAcc) + Number(pro?.Bill_Qty), 0))
                        }, 0))
                    }))
                }))
                const OrderWiseStatus = productWiseStatus.map(order => ({
                    ...order,
                    IsConvertedAsInvoice: order.DeliveryDetails.reduce((acc, dItem) => acc + Number(dItem.convertableQuantity), 0) <= 0 ? 1 : 0,
                }))
                dataFound(res, OrderWiseStatus);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const createPurchaseOrder = async (req, res) => {
        const {
            BranchId,
            LoadingDate = '',
            TradeConfirmDate = '',
            OwnerId = 0,
            OwnerName = '',
            BrokerId = 0,
            BrokerName = '',
            PartyId = '',
            PartyName = '',
            PartyAddress = '',
            PaymentCondition = '',
            Remarks = '',
            OrderStatus = '',
            CreatedBy = ''
        } = req?.body?.OrderDetails;

        if (!checkIsNumber(BranchId)) {
            return invalidInput(res, 'Select Branch')
        }

        const OrderItems = Array.isArray(req.body.OrderItems) ? req.body.OrderItems : [];
        const DelivdryDetails = Array.isArray(req.body.DelivdryDetails) ? req.body.DelivdryDetails : [];
        const TranspoterDetails = Array.isArray(req.body.TranspoterDetails) ? req.body.TranspoterDetails : [];
        const StaffDetails = Array.isArray(req.body.StaffDetails) ? req.body.StaffDetails : [];

        const transaction = new sql.Transaction();

        try {

            const currentYear = new Date().getFullYear();

            const newOrderId = Number((await new sql.Request()
                .input('BranchId', BranchId)
                .input('currentYear', currentYear)
                .query(`
                    SELECT 
                        COALESCE(MAX(Id), 0) AS MaxId
                    FROM 
                        tbl_PurchaseOrderGeneralDetails
                    WHERE
                        BranchId = @BranchId
                        AND
                        PoYear = @currentYear`
                ))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(newOrderId)) throw new Error('Failed to get Order Id');

            const PO_ID = 'PO_' + BranchId + '_' + currentYear + '_' + createPadString(newOrderId, 4);

            const getSno = await getNextId({ table: 'tbl_PurchaseOrderGeneralDetails', column: 'Sno' });

            if (!getSno.status || !checkIsNumber(getSno.MaxId)) throw new Error('Failed to get Sno');

            const Sno = getSno.MaxId;

            await transaction.begin();

            const OrderDetailsInsert = await new sql.Request(transaction)
                .input('Sno', Sno)
                .input('Id', newOrderId)
                .input('PoYear', currentYear)
                .input('BranchId', BranchId)
                .input('PO_ID', PO_ID)
                .input('LoadingDate', LoadingDate)
                .input('TradeConfirmDate', TradeConfirmDate)
                .input('OwnerId', Number(OwnerId))
                .input('OwnerName', OwnerName)
                .input('BrokerId', Number(BrokerId))
                .input('BrokerName', BrokerName)
                .input('PartyId', PartyId)
                .input('PartyName', PartyName)
                .input('PartyAddress', PartyAddress)
                .input('PaymentCondition', PaymentCondition)
                .input('Remarks', Remarks)
                .input('OrderStatus', OrderStatus)
                .input('CreatedBy', CreatedBy)
                .query(`
                    INSERT INTO tbl_PurchaseOrderGeneralDetails (
                        Sno, Id, PoYear, BranchId, PO_ID,
                        LoadingDate, TradeConfirmDate, OwnerId, OwnerName, BrokerId, BrokerName, PartyId, PartyName, 
                        PartyAddress, PaymentCondition, Remarks, OrderStatus, CreatedBy
                    ) VALUES (
                        @Sno, @Id, @PoYear, @BranchId, @PO_ID,
                        @LoadingDate, @TradeConfirmDate, @OwnerId, @OwnerName, @BrokerId, @BrokerName, @PartyId, @PartyName, 
                        @PartyAddress, @PaymentCondition, @Remarks, @OrderStatus, @CreatedBy
                    );`
                );

            if (OrderDetailsInsert.rowsAffected[0] == 0) {
                throw new Error('Failed to insert order details')
            }

            const OrderId = Number(Sno);

            for (let i = 0; i < OrderItems.length; i++) {
                const item = OrderItems[i];

                const result = await new sql.Request(transaction)
                    .input('Sno', i)
                    .input('OrderId', OrderId)
                    .input('ItemId', Number(item?.ItemId))
                    .input('ItemName', item?.ItemName)
                    .input('Weight', Number(item?.Weight))
                    .input('Units', item?.Units)
                    .input('Rate', Number(item?.Rate))
                    .input('DeliveryLocation', item?.DeliveryLocation)
                    .input('Discount', Number(item?.Discount))
                    .input('QualityCondition', item?.QualityCondition)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderItemDetails (
                            Sno, OrderId, ItemId, ItemName, Weight, Units, Rate, DeliveryLocation, Discount, QualityCondition
                        ) VALUES (
                            @Sno, @OrderId, @ItemId, @ItemName, @Weight, @Units, @Rate, @DeliveryLocation, @Discount, @QualityCondition
                        )
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Item Details')
                }
            }

            for (let i = 0; i < DelivdryDetails.length; i++) {
                const delivery = DelivdryDetails[i];

                const result = await new sql.Request(transaction)
                    .input('indexValue', Number(delivery?.indexValue))
                    .input('OrderId', OrderId)
                    .input('TransporterIndex', Number(delivery?.TransporterIndex))
                    .input('Trip_Id', checkIsNumber(delivery?.Trip_Id) ? Number(delivery?.Trip_Id) : null)
                    .input('Trip_Item_SNo', checkIsNumber(delivery?.Trip_Item_SNo) ? Number(delivery?.Trip_Item_SNo) : null)
                    .input('LocationId', Number(delivery?.LocationId))
                    .input('Location', delivery?.Location)
                    .input('ArrivalDate', delivery?.ArrivalDate)
                    .input('ItemId', Number(delivery?.ItemId) ?? '')
                    .input('ItemName', delivery?.ItemName)
                    .input('Concern', delivery?.Concern)
                    .input('BillNo', delivery?.BillNo)
                    .input('BillDate', delivery?.BillDate)
                    .input('BilledRate', Number(delivery?.BilledRate) ?? 0)
                    .input('Quantity', Number(delivery?.Quantity) ?? 0)
                    .input('Weight', Number(delivery?.Weight) ?? 0)
                    .input('Units', delivery?.Units)
                    .input('BatchLocation', delivery?.BatchLocation)
                    .input('CreatedBy', Number(delivery?.CreatedBy))
                    .query(`
                        INSERT INTO tbl_PurchaseOrderDeliveryDetails (
                            indexValue, OrderId, LocationId, Location, TransporterIndex, Trip_Id, Trip_Item_SNo,
                            ArrivalDate, ItemId, ItemName, Concern, BillNo, BillDate, 
                            BilledRate, Quantity, Weight, Units, BatchLocation, CreatedBy
                        ) VALUES (
                            @indexValue, @OrderId, @LocationId, @Location, @TransporterIndex, @Trip_Id, @Trip_Item_SNo,
                            @ArrivalDate, @ItemId, @ItemName, @Concern, @BillNo, @BillDate,
                            @BilledRate, @Quantity, @Weight, @Units, @BatchLocation, @CreatedBy
                        )
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Delivery Details')
                }
            }

            for (let i = 0; i < TranspoterDetails.length; i++) {
                const transporter = TranspoterDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', OrderId)
                    .input('indexValue', sql.Int, Number(transporter?.indexValue))
                    .input('Loading_Load', sql.Int, transporter?.Loading_Load)
                    .input('Loading_Empty', sql.Int, transporter?.Loading_Empty)
                    .input('Unloading_Load', sql.Int, transporter?.Unloading_Load)
                    .input('Unloading_Empty', sql.Int, transporter?.Unloading_Empty)
                    .input('EX_SH', transporter?.EX_SH)
                    .input('DriverName', transporter?.DriverName)
                    .input('VehicleNo', transporter?.VehicleNo)
                    .input('PhoneNumber', String(transporter?.PhoneNumber))
                    .input('CreatedBy', sql.Int, Number(transporter?.CreatedBy))
                    .query(`
                        INSERT INTO tbl_PurchaseOrderTranspoterDetails (
                            indexValue, OrderId, Loading_Load, Loading_Empty, Unloading_Load, Unloading_Empty, EX_SH, 
                            DriverName, VehicleNo, PhoneNumber, CreatedBy
                        ) VALUES (
                            @indexValue, @OrderId, @Loading_Load, @Loading_Empty, @Unloading_Load, @Unloading_Empty, @EX_SH, 
                            @DriverName, @VehicleNo, @PhoneNumber, @CreatedBy
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Transporter details')
                }
            }

            for (let i = 0; i < StaffDetails.length; i++) {
                const staff = StaffDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', sql.Int, OrderId)
                    .input('EmployeeId', sql.Int, Number(staff?.EmployeeId))
                    .input('CostType', sql.Int, Number(staff?.CostType))
                    .query(`
                        INSERT INTO tbl_PurchaseOrderEmployeesInvolved (
                            OrderId, EmployeeId, CostType
                        ) VALUES (
                            @OrderId, @EmployeeId, @CostType
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to save Staff details')
                }
            }

            await transaction.commit();
            return success(res, 'Order Created')

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    }

    const updatePurchaseOrder = async (req, res) => {

        const {
            Sno = '',
            LoadingDate = '',
            TradeConfirmDate = '',
            OwnerId = 0,
            OwnerName = '',
            BrokerId = 0,
            BrokerName = '',
            PartyId = 0,
            PartyName = '',
            PartyAddress = '',
            PaymentCondition = '',
            Remarks = '',
            OrderStatus = '',
            CreatedBy = ''
        } = req.body.OrderDetails;

        const OrderItems = Array.isArray(req.body.OrderItems) ? req.body.OrderItems : [];
        const DelivdryDetails = Array.isArray(req.body.DelivdryDetails) ? req.body.DelivdryDetails : [];
        const TranspoterDetails = Array.isArray(req.body.TranspoterDetails) ? req.body.TranspoterDetails : [];
        const StaffDetails = Array.isArray(req.body.StaffDetails) ? req.body.StaffDetails : [];

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            // Update Order General Details
            const updateOrderDetails = await new sql.Request(transaction)
                .input('OrderId', Sno)
                .input('LoadingDate', LoadingDate)
                .input('TradeConfirmDate', TradeConfirmDate)
                .input('OwnerId', Number(OwnerId))
                .input('OwnerName', OwnerName)
                .input('BrokerId', Number(BrokerId))
                .input('BrokerName', BrokerName)
                .input('PartyId', PartyId)
                .input('PartyName', PartyName)
                .input('PartyAddress', PartyAddress)
                .input('PaymentCondition', PaymentCondition)
                .input('Remarks', Remarks)
                .input('OrderStatus', OrderStatus)
                .input('CreatedBy', CreatedBy)
                .query(`
                    UPDATE tbl_PurchaseOrderGeneralDetails
                    SET LoadingDate = @LoadingDate, TradeConfirmDate = @TradeConfirmDate,
                        OwnerId = @OwnerId, BrokerId = @BrokerId, 
                        OwnerName = @OwnerName, BrokerName = @BrokerName, PartyId = @PartyId, PartyName = @PartyName,
                        PartyAddress = @PartyAddress, PaymentCondition = @PaymentCondition, 
                        Remarks = @Remarks, OrderStatus = @OrderStatus, CreatedBy = @CreatedBy
                    WHERE Sno = @OrderId
                `);

            if (updateOrderDetails.rowsAffected[0] === 0) {
                throw new Error('Failed to update order details');
            }

            await new sql.Request(transaction)
                .input('OrderId', Sno)
                .query(`
                    DELETE FROM tbl_PurchaseOrderItemDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderDeliveryDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderTranspoterDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderEmployeesInvolved WHERE OrderId = @OrderId;
                `);

            for (let i = 0; i < OrderItems.length; i++) {
                const item = OrderItems[i];

                const result = await new sql.Request(transaction)
                    .input('Sno', i)
                    .input('OrderId', Sno)
                    .input('ItemId', Number(item?.ItemId))
                    .input('ItemName', item?.ItemName)
                    .input('Weight', Number(item?.Weight))
                    .input('Units', item?.Units)
                    .input('Rate', Number(item?.Rate))
                    .input('DeliveryLocation', item?.DeliveryLocation)
                    .input('Discount', Number(item?.Discount))
                    .input('QualityCondition', item?.QualityCondition)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderItemDetails (
                            Sno, OrderId, ItemId, ItemName, Weight, Units, Rate, DeliveryLocation, Discount, QualityCondition
                        ) VALUES (
                            @Sno, @OrderId, @ItemId, @ItemName, @Weight, @Units, @Rate, @DeliveryLocation, @Discount, @QualityCondition
                        )
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Item Details')
                }
            }

            // Update or Insert Delivery Details
            for (let i = 0; i < DelivdryDetails.length; i++) {
                const delivery = DelivdryDetails[i];

                const result = await new sql.Request(transaction)
                    .input('indexValue', Number(delivery?.indexValue))
                    .input('OrderId', Sno)
                    .input('Id', delivery?.Id)
                    .input('TransporterIndex', Number(delivery?.TransporterIndex))
                    .input('Trip_Id', checkIsNumber(delivery?.Trip_Id) ? Number(delivery?.Trip_Id) : null)
                    .input('Trip_Item_SNo', checkIsNumber(delivery?.Trip_Item_SNo) ? Number(delivery?.Trip_Item_SNo) : null)
                    .input('LocationId', Number(delivery?.LocationId))
                    .input('Location', delivery?.Location)
                    .input('ArrivalDate', delivery?.ArrivalDate)
                    .input('ItemId', Number(delivery?.ItemId))
                    .input('ItemName', delivery?.ItemName)
                    .input('Concern', delivery?.Concern)
                    .input('BillNo', delivery?.BillNo)
                    .input('BillDate', delivery?.BillDate)
                    .input('BilledRate', delivery?.BilledRate)
                    .input('Quantity', Number(delivery?.Quantity))
                    .input('Weight', Number(delivery?.Weight))
                    .input('Units', delivery?.Units)
                    .input('BatchLocation', delivery?.BatchLocation)
                    .input('CreatedBy', Number(delivery?.CreatedBy))
                    .query(`
                        INSERT INTO tbl_PurchaseOrderDeliveryDetails (
                            indexValue, OrderId, LocationId, Location, TransporterIndex, ArrivalDate, ItemId, ItemName, Concern, BillNo, BillDate, 
                            BilledRate, Quantity, Weight, Units, BatchLocation, CreatedBy
                        ) VALUES (
                            @indexValue, @OrderId, @LocationId, @Location, @TransporterIndex, @ArrivalDate, @ItemId, @ItemName, @Concern, @BillNo, @BillDate,
                            @BilledRate, @Quantity, @Weight, @Units, @BatchLocation, @CreatedBy
                        )
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Delivery Details')
                }
            }

            // Update or Insert Transporter Details
            for (let i = 0; i < TranspoterDetails.length; i++) {
                const transporter = TranspoterDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', Sno)
                    .input('indexValue', Number(transporter?.indexValue))
                    .input('Id', transporter?.Id)
                    .input('Loading_Load', transporter?.Loading_Load)
                    .input('Loading_Empty', transporter?.Loading_Empty)
                    .input('Unloading_Load', transporter?.Unloading_Load)
                    .input('Unloading_Empty', transporter?.Unloading_Empty)
                    .input('EX_SH', transporter?.EX_SH)
                    .input('DriverName', transporter?.DriverName)
                    .input('VehicleNo', transporter?.VehicleNo)
                    .input('PhoneNumber', Number(transporter?.PhoneNumber))
                    .input('CreatedBy', Number(transporter?.CreatedBy))
                    .query(`
                        INSERT INTO tbl_PurchaseOrderTranspoterDetails (
                            indexValue, OrderId, Loading_Load, Loading_Empty, Unloading_Load, Unloading_Empty, EX_SH, 
                            DriverName, VehicleNo, PhoneNumber, CreatedBy
                        ) VALUES (
                            @indexValue, @OrderId, @Loading_Load, @Loading_Empty, @Unloading_Load, @Unloading_Empty, @EX_SH, 
                            @DriverName, @VehicleNo, @PhoneNumber, @CreatedBy
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Transporter details')
                }
            }

            // Update or Insert Staff Details
            for (let i = 0; i < StaffDetails.length; i++) {
                const staff = StaffDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', Sno)
                    .input('EmployeeId', staff?.EmployeeId)
                    .input('CostType', staff?.CostType)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderEmployeesInvolved (
                            OrderId, EmployeeId, CostType
                        ) VALUES (
                            @OrderId, @EmployeeId, @CostType
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Staff details')
                }
            }

            await transaction.commit();
            return success(res, 'Order Updated Successfully');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const godownLocation = async (req, res) => {
        try {
            const result = await sql.query('SELECT Godown_Id, Godown_Name, Godown_Tally_Id FROM tbl_Godown_Master');

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const updateArrivalDetails = async (req, res) => {
        const { OrderId, DelivdryDetails, TranspoterDetails } = req.body;

        if (!OrderId) {
            return invalidInput(res, 'OrderId is required');
        }

        const transaction = new sql.Transaction();

        try {
            const checkIfOrderIdExist = await new sql.Request()
                .input('OrderId', OrderId)
                .query(`SELECT COUNT(Id) AS Orders FROM tbl_PurchaseOrderGeneralDetails WHERE Id = @OrderId;`);

            if (checkIfOrderIdExist.recordset[0].Orders === 0) {
                return failed(res, 'Order Id is not matched');
            }

            await transaction.begin();

            await new sql.Request(transaction)
                .input('OrderId', OrderId)
                .query(`
                    DELETE FROM tbl_PurchaseOrderDeliveryDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderTranspoterDetails WHERE OrderId = @OrderId;
                `);

            // Update or Insert Delivery Details
            for (let i = 0; i < DelivdryDetails.length; i++) {
                const delivery = DelivdryDetails[i];

                const result = await new sql.Request(transaction)
                    .input('Sno', i + 1)
                    .input('OrderId', OrderId)
                    .input('Id', delivery?.Id)
                    .input('Location', delivery?.Location)
                    .input('ArrivalDate', delivery?.ArrivalDate)
                    .input('ItemName', delivery?.ItemName)
                    .input('Concern', delivery?.Concern)
                    .input('BillNo', delivery?.BillNo)
                    .input('BillDate', delivery?.BillDate)
                    .input('Quantity', delivery?.Quantity)
                    .input('Weight', delivery?.Weight)
                    .input('Units', delivery?.Units)
                    .input('BatchLocation', delivery?.BatchLocation)
                    .input('PendingQuantity', delivery?.PendingQuantity)
                    .input('CreatedBy', delivery?.CreatedBy)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderDeliveryDetails (
                            Sno, OrderId, Location, ArrivalDate, ItemName, Concern, BillNo, BillDate, 
                            Quantity, Weight, Units, BatchLocation, PendingQuantity, CreatedBy
                        ) VALUES (
                            @Sno, @OrderId, @Location, @ArrivalDate, @ItemName, @Concern, @BillNo, @BillDate,
                            @Quantity, @Weight, @Units, @BatchLocation, @PendingQuantity, @CreatedBy
                        )
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Delivery Details')
                }
            }

            // Update or Insert Transporter Details
            for (let i = 0; i < TranspoterDetails.length; i++) {
                const transporter = TranspoterDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', OrderId)
                    .input('Id', transporter?.Id)
                    .input('Loading_Load', transporter?.Loading_Load)
                    .input('Loading_Empty', transporter?.Loading_Empty)
                    .input('Unloading_Load', transporter?.Unloading_Load)
                    .input('Unloading_Empty', transporter?.Unloading_Empty)
                    .input('EX_SH', transporter?.EX_SH)
                    .input('DriverName', transporter?.DriverName)
                    .input('VehicleNo', transporter?.VehicleNo)
                    .input('PhoneNumber', transporter?.PhoneNumber)
                    .input('CreatedBy', transporter?.CreatedBy)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderTranspoterDetails (
                            OrderId, Loading_Load, Loading_Empty, Unloading_Load, Unloading_Empty, EX_SH, 
                            DriverName, VehicleNo, PhoneNumber, CreatedBy
                        ) VALUES (
                            @OrderId, @Loading_Load, @Loading_Empty, @Unloading_Load, @Unloading_Empty, @EX_SH, 
                            @DriverName, @VehicleNo, @PhoneNumber, @CreatedBy
                        );
                    `);

                if (result.rowsAffected[0] == 0) {
                    throw new Error('Failed to update Transporter details')
                }
            }

            await transaction.commit();
            success(res, 'Arrival Details Saved');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const deleteOrderPermanantly = async (req, res) => {
        const { OrderId } = req.body;

        if (!checkIsNumber(OrderId)) return invalidInput(res, 'OrderId is required');

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();

            const request = new sql.Request(transaction)
                .input('OrderId', OrderId)
                .query(`
                    DELETE FROM tbl_PurchaseOrderGeneralDetails WHERE Id = @OrderId;
                    DELETE FROM tbl_PurchaseOrderItemDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderDeliveryDetails WHERE OrderId = @OrderId;
                    DELETE FROM tbl_PurchaseOrderTranspoterDetails WHERE OrderId = @OrderId;`
                );

            const result = await request;

            if (result.rowsAffected[0] === 0) throw new Error('Failed to delete Order');

            await transaction.commit();

            return success(res, 'Order Deleted!')

        } catch (e) {
            servError(e, res);
        }
    }

    const getDeliveryByPartyId = async (req, res) => {
        const { VendorId } = req.query;

        try {
            if (!checkIsNumber(VendorId)) return invalidInput(res, 'Select Vendor');

            const request = new sql.Request();
            request.input('VendorId', VendorId);

            const query = `
                WITH OrderArrival AS (
                    SELECT 
                        d.*, COALESCE(g.PO_ID, 'not found') AS PO_ID
                    FROM tbl_PurchaseOrderDeliveryDetails AS d
                    INNER JOIN tbl_PurchaseOrderGeneralDetails AS g
                        ON d.OrderId = g.Sno
                    WHERE g.PartyId = @VendorId AND g.OrderStatus = 'Completed'
                ), DeliveryInvolvedEmployee AS (
                    SELECT 
                        poe.OrderId, poe.EmployeeId, poe.CostType,
                        COALESCE(cc.Cost_Center_Name, 'Not found') AS EmployeeName, 
                        COALESCE(cct.Cost_Category, 'Not found') AS EmployeeType
                    FROM tbl_PurchaseOrderEmployeesInvolved AS poe
                    LEFT JOIN tbl_ERP_Cost_Center AS cc
                        ON cc.Cost_Center_Id = poe.EmployeeId
                    LEFT JOIN tbl_ERP_Cost_Category AS cct
                        ON cct.Cost_Category_Id = poe.CostType
                    WHERE poe.OrderId IN (SELECT OrderId FROM OrderArrival)
                ), InvoicedOrders AS (
                    SELECT odr.Order_Id, ipo.Item_Id, SUM(ipo.Bill_Qty) AS Total_Bill_Qty
                    FROM tbl_Purchase_Order_Inv_Gen_Order AS odr
                    INNER JOIN tbl_Purchase_Order_Inv_Stock_Info AS ipo
                        ON ipo.PIN_Id = odr.PIN_Id
                    WHERE odr.Order_Id IN (SELECT OrderId FROM OrderArrival)
                    GROUP BY odr.Order_Id, ipo.Item_Id
                )
                SELECT 
                    dp.*, 
                    ISNULL(i.Total_Bill_Qty, 0) AS Total_Bill_Qty,
                    ISNULL((
                        SELECT poe.*
                        FROM DeliveryInvolvedEmployee AS poe
                        WHERE dp.OrderId = poe.OrderId
                        FOR JSON PATH
                    ), '[]') AS EmployeesInvolved
                FROM OrderArrival AS dp
                LEFT JOIN InvoicedOrders AS i
                    ON dp.OrderId = i.Order_Id AND dp.ItemId = i.Item_Id;
            `;

            const result = await request.query(query);

            if (result.recordset.length === 0) return noData(res);

            const parsedData = result.recordset.map(item => ({
                ...item,
                EmployeesInvolved: JSON.parse(item.EmployeesInvolved),
                convertableQuantity: Math.max(Number(item.Weight) - Number(item.Total_Bill_Qty), 0)
            }));

            dataFound(res, parsedData.filter(item => item.convertableQuantity > 0));

        } catch (e) {
            servError(e, res);
        }
    };

    const getPartyForInvoice = async (req, res) => {
        try {
            const request = new sql.Request();

            const query = `
            WITH OrderArrival AS (
                SELECT 
                    d.OrderId, d.ItemId, d.Weight,  
                    g.PartyId AS Retailer_Id, 
                    g.PartyName AS Retailer_Name,
                    r.Reatailer_Address
                FROM tbl_PurchaseOrderDeliveryDetails AS d
                INNER JOIN tbl_PurchaseOrderGeneralDetails AS g
                    ON d.OrderId = g.Sno
                LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = g.PartyId
                WHERE g.OrderStatus = 'Completed'
            ), InvoicedOrders AS (
                SELECT 
                    odr.Order_Id, ipo.Item_Id, 
                    SUM(ipo.Bill_Qty) AS Total_Bill_Qty
                FROM tbl_Purchase_Order_Inv_Gen_Order AS odr
                INNER JOIN tbl_Purchase_Order_Inv_Stock_Info AS ipo
                    ON ipo.PIN_Id = odr.PIN_Id
                WHERE odr.Order_Id IN (SELECT OrderId FROM OrderArrival)
                GROUP BY odr.Order_Id, ipo.Item_Id
            ) SELECT DISTINCT 
                g.Retailer_Id, 
                g.Retailer_Name, 
                g.Reatailer_Address
            FROM OrderArrival AS g
            LEFT JOIN InvoicedOrders AS i
                ON g.OrderId = i.Order_Id 
                AND g.ItemId = i.Item_Id
            WHERE 
                g.Weight > ISNULL(i.Total_Bill_Qty, 0) 
            ORDER BY g.Retailer_Name;

            `;

            const result = await request.query(query);

            if (result.recordset.length === 0) return noData(res);

            dataFound(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };


    // const getDeliveryByPartyId = async (req, res) => {
    //     const { VendorId } = req.query;

    //     try {

    //         if (!checkIsNumber(VendorId)) return invalidInput(res, 'Select Vendor');

    //         const request = new sql.Request()
    //             .input('VendorId', VendorId)
    //             .query(`
    //                 WITH OrderArrival AS (
    //                     SELECT 
    //                         d.*,
    //                         COALESCE(g.PO_ID, 'not found') AS PO_ID
    //                     FROM 
    //                         tbl_PurchaseOrderDeliveryDetails AS d
    //                     LEFT JOIN 
    //                         tbl_PurchaseOrderGeneralDetails AS g
    //                         ON d.OrderId = g.Sno
    //                     WHERE 
    //                 		g.PartyId = @VendorId AND
    //                         g.OrderStatus = 'Completed'
    //                 ), DeliveryInvolvedEmployee AS (
    //                     SELECT 
    //                         poe.*,
    //                         COALESCE(cc.Cost_Center_Name, 'Not found') AS EmployeeName, 
    //                         COALESCE(cct.Cost_Category, 'Not found') AS EmployeeType
    //                     FROM tbl_PurchaseOrderEmployeesInvolved AS poe
    //                         LEFT JOIN tbl_ERP_Cost_Center AS cc
    //                         ON cc.Cost_Center_Id = poe.EmployeeId
    //                         LEFT JOIN tbl_ERP_Cost_Category AS cct
    //                         ON cct.Cost_Category_Id = poe.CostType
    //                     WHERE
    //                         poe.OrderId IN (
    //                             SELECT OrderId FROM OrderArrival
    //                         )
    //                 ), InvoicedOrders AS (
    //                     SELECT odr.PIN_Id, odr.Order_Id, ipo.Item_Id, ipo.Bill_Qty
    //                     FROM tbl_Purchase_Order_Inv_Gen_Order AS odr
    //                     LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS ipo
    //                     ON ipo.PIN_Id = odr.PIN_Id
    //                     WHERE odr.Order_Id IN (
    //                         SELECT OrderId
    //                         FROM OrderArrival
    //                     )
    //                 )
    //                 SELECT 
    //                     dp.*,
    //                     COALESCE((
    //                         SELECT 
    //                             pi.*
    //                         FROM InvoicedOrders AS pi
    //                         WHERE 
    //                             pi.Order_Id = dp.OrderId
    //                             AND dp.ItemId = pi.Item_Id
    //                         FOR JSON PATH
    //                     ), '[]') AS ConvertedAsInvoices,
    //                     COALESCE((
    //                         SELECT *
    //                         FROM DeliveryInvolvedEmployee AS poe
    //                         WHERE dp.OrderId = poe.OrderId
    //                         FOR JSON PATH
    //                     ), '[]') AS EmployeesInvolved
    //                 FROM OrderArrival AS dp`
    //             );

    //         const result = await request;

    //         if (result.recordset.length > 0) {
    //             const parsed = result.recordset.map(pro => ({
    //                 ...pro,
    //                 EmployeesInvolved: JSON.parse(pro.EmployeesInvolved),
    //                 ConvertedAsInvoices: JSON.parse(pro.ConvertedAsInvoices)
    //             }));

    //             const withConvertableQty = parsed.map(item => ({
    //                 ...item,
    //                 convertableQuantity: Number(item?.Quantity) - Number(o.ConvertedAsInvoices.reduce((invAcc, inv) => {
    //                     return Number(invAcc) + Number(inv.Bill_Qty)
    //                 }, 0))
    //             }));

    //             const filterIfNotConvertable = withConvertableQty.filter(item => item?.convertableQuantity <= 0)

    //             dataFound(res, filterIfNotConvertable)
    //         } else {
    //             noData(res)
    //         }

    //     } catch (e) {
    //         servError(e, res);
    //     }
    // }

    // const getPurchaseDetailsDropdown = async (req, res) => {
    //     const Fromdate = ISOString(req?.query?.Fromdate);
    //     const Todate = ISOString(req?.query?.Todate);
    //     const { ItemId, OrderId } = req.query;

    //     try {

    //         let query = `
    //             WITH ITEM_DETAILS AS (
    //             	SELECT 
    //             		*
    //             	FROM
    //             		tbl_PurchaseOrderItemDetails
    //             	WHERE
    //             		OrderId IN (
    //             			SELECT 
    //             				pgi.Id
    //             			FROM
    //             				tbl_PurchaseOrderGeneralDetails AS pgi
    //             			WHERE
    //             				CONVERT(DATE, pgi.LoadingDate) >= CONVERT(DATE, @Fromdate)
    //             				AND
    //             				CONVERT(DATE, pgi.LoadingDate) <= CONVERT(DATE, @Todate)
    //                             AND
    //                             pgi.ItemId = @ItemId
    //             		)
    //             )
    //             SELECT 
    //             	pgi.*,
    //             	ISNULL((
    //             		SELECT JSON_QUERY((
    //             			SELECT * FROM ITEM_DETAILS WHERE ITEM_DETAILS.OrderId = pgi.Id FOR JSON AUTO)
    //             		)
    //             	), '[]') AS ItemDetails
    //             FROM
    //             	tbl_PurchaseOrderGeneralDetails AS pgi
    //             WHERE
    //             	CONVERT(DATE, pgi.LoadingDate) >= CONVERT(DATE, @Fromdate)
    //             	AND
    //             	CONVERT(DATE, pgi.LoadingDate) <= CONVERT(DATE, @Todate)
    //         `;

    //         if (OrderId) {

    //         }

    //         const request = new sql.Request()
    //             .input('Fromdate', Fromdate)
    //             .input('Todate', Todate)
    //             .input('ItemId', ItemId)
    //             .input('OrderId', OrderId)
    //             .query(query);

    //         const result = await request;
    //     } catch (e) {
    //         servError(e, res);
    //     }
    // }

    return {
        getPurchaseOrder,
        createPurchaseOrder,
        updatePurchaseOrder,
        godownLocation,
        updateArrivalDetails,
        deleteOrderPermanantly,
        getDeliveryByPartyId,
        getPartyForInvoice
    }
}

export default PurchaseOrderDataEntry();