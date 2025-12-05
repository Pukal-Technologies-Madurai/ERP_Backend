import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, createPadString, isEqualNumber, ISOString } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const PurchaseOrderDataEntry = () => {

    const getPurchaseOrder = async (req, res) => {
        const Fromdate = ISOString(req.query?.Fromdate ? req.query?.Fromdate : new Date());
        const Todate = ISOString(req.query?.Todate ? req.query?.Todate : new Date());

        try {
            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    -------------------------table variable declaration----------
                    DECLARE @FilteredOrders TABLE (Sno INT);
                    -------------------------filtering invoices and inserting into table variable
                    INSERT INTO @FilteredOrders (Sno)
                    SELECT pgi.Sno
                    FROM tbl_PurchaseOrderGeneralDetails AS pgi
                    WHERE 
                        CONVERT(DATE, pgi.TradeConfirmDate) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate);
                    -------------------------general info------------------------- 
                    SELECT 
                        pgi.*,
                        COALESCE(lol.Ledger_Name, 'Not found') AS Ledger_Name,
                        COALESCE(lol.Party_District, 'Not found') AS Party_District
                    FROM tbl_PurchaseOrderGeneralDetails AS pgi
                    LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pgi.PartyId
                    LEFT JOIN tbl_Ledger_LOL AS lol ON lol.Ledger_Tally_Id = r.ERP_Id
                    WHERE pgi.Sno IN (SELECT Sno FROM @FilteredOrders);
                    -------------------------Stock Details---------------------------
                    SELECT 
                        i.*,
                        COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                        COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
                    FROM tbl_PurchaseOrderItemDetails AS i
                    LEFT JOIN tbl_Product_Master AS p ON i.ItemId = p.Product_Id
                    LEFT JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
                    WHERE i.OrderId IN (SELECT Sno FROM @FilteredOrders);
                    -------------------------Delivery details------------------------------
                    SELECT 
                        d.*,
                        COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                        COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
                    FROM tbl_PurchaseOrderDeliveryDetails AS d
                    LEFT JOIN tbl_Product_Master AS p ON d.ItemId = p.Product_Id
                    LEFT JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
                    WHERE d.OrderId IN (SELECT Sno FROM @FilteredOrders);
                    -------------------------Transporter Details--------------------
                    SELECT *
                    FROM tbl_PurchaseOrderTranspoterDetails
                    WHERE OrderId IN (SELECT Sno FROM @FilteredOrders)
                    ORDER BY indexValue;
                    -------------------------Staff Details -------------------------
                    SELECT 
                    	stf.*,
                        COALESCE(e.Cost_Center_Name, 'Not found') AS Emp_Name,
                        COALESCE(cc.Cost_Category, 'Not found') AS Cost_Category
                    FROM tbl_PurchaseOrderEmployeesInvolved AS stf
                    LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.EmployeeId
                    LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.CostType
                    WHERE stf.OrderId IN (SELECT Sno FROM @FilteredOrders);
                    -------------------------Invoice Orders---------------------------
                    SELECT 
                        igo.PIN_Id,
                        igo.Order_Id,
                        isd.Item_Id,
                        isd.Bill_Qty,
                        isd.DeliveryId
                    FROM tbl_Purchase_Order_Inv_Gen_Order AS igo
                    LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS isd
                        ON isd.PIN_Id = igo.PIN_Id
                    WHERE igo.Order_Id IN (SELECT Sno FROM @FilteredOrders);`
                );

            const result = await request;

            const [
                generalInfo, productDetails, deliveryDetails,
                transporterDetails, Staffdetails, invoicedOrders
            ] = result.recordsets;

            if (generalInfo.length > 0) {
                const extractedData = generalInfo.map(o => ({
                    ...o,
                    ConvertedAsInvoices: invoicedOrders.filter(fil => isEqualNumber(fil.Order_Id, o.Sno)),
                    ItemDetails: productDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    DeliveryDetails: deliveryDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    TranspoterDetails: transporterDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    StaffDetails: Staffdetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno))
                }));

                const productWiseStatus = extractedData.map(o => ({
                    ...o,
                    DeliveryDetails: o.DeliveryDetails.map(item => ({

                        pendingInvoiceWeight: Number(item?.Weight) - Number(o.ConvertedAsInvoices.filter(
                            itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
                                && isEqualNumber(itmFil.DeliveryId, item.Trip_Item_SNo)
                                && isEqualNumber(itmFil.Order_Id, item.OrderId)
                        ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),

                        convertableQuantity: o.DeliveryDetails.filter(
                            itmFil => isEqualNumber(itmFil.ItemId, item.ItemId)
                                && isEqualNumber(itmFil.OrderId, item.OrderId)
                                && isEqualNumber(itmFil.Trip_Item_SNo, item.Trip_Item_SNo)
                        ).reduce((itemAcc, deliveredItem) => {
                            return Number(itemAcc) + Number(deliveredItem.Weight)
                        }, 0) - Number(o.ConvertedAsInvoices.filter(
                            itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
                        ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),

                        ...item,
                    })),
                }))

                const OrderWiseStatus = productWiseStatus.map(order => ({
                    IsConvertedAsInvoice: order.DeliveryDetails.reduce(
                        (acc, dItem) => acc + Number(dItem.convertableQuantity), 0
                    ) <= 0 ? 1 : 0,
                    isConvertableArrivalExist: order.DeliveryDetails.reduce(
                        (acc, dItem) => acc + Number(dItem.pendingInvoiceWeight), 0
                    ) > 0 ? 1 : 0,
                    ...order,
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
            Discount = 0,
            QualityCondition = '',
            PaymentDays = 0,
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
                .input('Discount', Discount)
                .input('QualityCondition', QualityCondition)
                .input('PaymentDays', PaymentDays)
                .input('CreatedBy', CreatedBy)
                .query(`
                    INSERT INTO tbl_PurchaseOrderGeneralDetails (
                        Sno, Id, PoYear, BranchId, PO_ID,
                        LoadingDate, TradeConfirmDate, OwnerId, OwnerName, BrokerId, BrokerName, PartyId, PartyName, 
                        PartyAddress, PaymentCondition, Remarks, OrderStatus, CreatedBy, Discount, QualityCondition, PaymentDays
                    ) VALUES (
                        @Sno, @Id, @PoYear, @BranchId, @PO_ID,
                        @LoadingDate, @TradeConfirmDate, @OwnerId, @OwnerName, @BrokerId, @BrokerName, @PartyId, @PartyName, 
                        @PartyAddress, @PaymentCondition, @Remarks, @OrderStatus, @CreatedBy, @Discount, @QualityCondition, @PaymentDays
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
                    // .input('Discount', Number(item?.Discount))
                    // .input('QualityCondition', item?.QualityCondition)
                    .query(`
                        INSERT INTO tbl_PurchaseOrderItemDetails (
                            Sno, OrderId, ItemId, ItemName, Weight, Units, Rate, DeliveryLocation
                        ) VALUES (
                            @Sno, @OrderId, @ItemId, @ItemName, @Weight, @Units, @Rate, @DeliveryLocation
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
            Discount = 0,
            QualityCondition = '',
            PaymentDays = 0,
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
                .input('Discount', Discount)
                .input('QualityCondition', QualityCondition)
                .input('PaymentDays', PaymentDays)
                .input('CreatedBy', CreatedBy)
                .query(`
                    UPDATE tbl_PurchaseOrderGeneralDetails
                    SET LoadingDate = @LoadingDate, TradeConfirmDate = @TradeConfirmDate,
                        OwnerId = @OwnerId, BrokerId = @BrokerId, 
                        OwnerName = @OwnerName, BrokerName = @BrokerName, PartyId = @PartyId, PartyName = @PartyName,
                        PartyAddress = @PartyAddress, PaymentCondition = @PaymentCondition, 
                        Remarks = @Remarks, OrderStatus = @OrderStatus, CreatedBy = @CreatedBy, 
                        Discount = @Discount, QualityCondition = @QualityCondition, PaymentDays = @PaymentDays
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

            // Update or Insert Transporter Details
            for (let i = 0; i < TranspoterDetails.length; i++) {
                const transporter = TranspoterDetails[i];

                const result = await new sql.Request(transaction)
                    .input('OrderId', Sno)
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

            const request = new sql.Request()
                .input('VendorId', VendorId)
                .query(`
                    ;WITH pendingOrderConvertion AS (
                    	SELECT 
                            d.*, 
                        	COALESCE(g.PO_ID, 'not found') AS PO_ID,
                        	COALESCE(pui.Bill_Qty, 0) AS pendingInvoiceWeight,
                        	COALESCE(pui.Bill_Qty, 0) AS convertableQuantity
                        FROM tbl_PurchaseOrderDeliveryDetails AS d
                        JOIN tbl_PurchaseOrderGeneralDetails AS g ON d.OrderId = g.Sno
                        LEFT JOIN (
                        	SELECT 
                        		igo.Order_Id,
                        		isd.Item_Id,
                        		isd.Bill_Qty,
                        		isd.DeliveryId
                        	FROM tbl_Purchase_Order_Inv_Gen_Order AS igo 
                        	JOIN tbl_Purchase_Order_Inv_Stock_Info AS isd ON igo.PIN_Id = isd.PIN_Id
                        ) AS pui 
                        ON 
                        	pui.Order_Id = d.OrderId 
                        	AND pui.DeliveryId = d.Trip_Item_SNo
                        	AND pui.Item_Id = d.ItemId
                        WHERE 
                        	g.PartyId = @VendorId 
                        	AND g.OrderStatus = 'Completed'
                        	AND d.Trip_Id IS NOT NULL
                        	AND COALESCE(pui.Bill_Qty, 0) = 0
                    ), involvedStaffs AS (
                        SELECT 
                            poe.OrderId, poe.EmployeeId, poe.CostType,
                            COALESCE(cc.Cost_Center_Name, 'Not found') AS EmployeeName, 
                            COALESCE(cct.Cost_Category, 'Not found') AS EmployeeType
                        FROM tbl_PurchaseOrderEmployeesInvolved AS poe
                        LEFT JOIN tbl_ERP_Cost_Center AS cc
                            ON cc.Cost_Center_Id = poe.EmployeeId
                        LEFT JOIN tbl_ERP_Cost_Category AS cct
                            ON cct.Cost_Category_Id = poe.CostType
                        WHERE poe.OrderId IN (SELECT OrderId FROM pendingOrderConvertion)
                    )
                    SELECT 
                    	poi.*,
                    	    ISNULL((
                            SELECT poe.*
                            FROM involvedStaffs AS poe
                            WHERE poi.OrderId = poe.OrderId
                            FOR JSON PATH
                        ), '[]') AS EmployeesInvolved
                    FROM pendingOrderConvertion AS poi`
                )

            const result = await request;

            const parsedData = result.recordset.map(item => ({
                ...item,
                ConvertedAsInvoices: [],
                EmployeesInvolved: JSON.parse(item.EmployeesInvolved),
            }));

            sentData(res, parsedData);

            // const request = new sql.Request()
            //     .input('VendorId', VendorId)
            //     .query(`
            //         WITH OrderArrival AS (
            //             SELECT 
            //                 d.*, COALESCE(g.PO_ID, 'not found') AS PO_ID
            //             FROM tbl_PurchaseOrderDeliveryDetails AS d
            //             INNER JOIN tbl_PurchaseOrderGeneralDetails AS g
            //                 ON d.OrderId = g.Sno
            //             WHERE g.PartyId = @VendorId AND g.OrderStatus = 'Completed'
            //         ), DeliveryInvolvedEmployee AS (
            //             SELECT 
            //                 poe.OrderId, poe.EmployeeId, poe.CostType,
            //                 COALESCE(cc.Cost_Center_Name, 'Not found') AS EmployeeName, 
            //                 COALESCE(cct.Cost_Category, 'Not found') AS EmployeeType
            //             FROM tbl_PurchaseOrderEmployeesInvolved AS poe
            //             LEFT JOIN tbl_ERP_Cost_Center AS cc
            //                 ON cc.Cost_Center_Id = poe.EmployeeId
            //             LEFT JOIN tbl_ERP_Cost_Category AS cct
            //                 ON cct.Cost_Category_Id = poe.CostType
            //             WHERE poe.OrderId IN (SELECT OrderId FROM OrderArrival)
            //         ), InvoicedDetails AS (
            //             SELECT igo.PIN_Id, igo.Order_Id, isd.Item_Id, isd.Bill_Qty, isd.DeliveryId
            //             FROM tbl_Purchase_Order_Inv_Gen_Order AS igo
            //             LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS isd
            //             ON isd.PIN_Id = igo.PIN_Id
            //             WHERE igo.Order_Id IN (SELECT OrderId FROM OrderArrival)
            //         )
            //         SELECT 
            //             dp.*, 
            //             COALESCE((
            //                 SELECT *
            //                 FROM InvoicedDetails AS io
            //                 WHERE io.Order_Id = dp.OrderId
            //                 FOR JSON PATH
            //             ), '[]') AS ConvertedAsInvoices,
            //             ISNULL((
            //                 SELECT poe.*
            //                 FROM DeliveryInvolvedEmployee AS poe
            //                 WHERE dp.OrderId = poe.OrderId
            //                 FOR JSON PATH
            //             ), '[]') AS EmployeesInvolved
            //         FROM OrderArrival AS dp`
            //     )
            // const parsedData = result.recordset.map(item => ({
            //     ...item,
            //     EmployeesInvolved: JSON.parse(item.EmployeesInvolved),
            //     ConvertedAsInvoices: JSON.parse(item.ConvertedAsInvoices),
            // }));

            // const productWiseStatus = parsedData.map(item => ({

            //     pendingInvoiceWeight: Number(item?.Weight) - Number(item.ConvertedAsInvoices.filter(
            //         itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
            //             && isEqualNumber(itmFil.DeliveryId, item.Trip_Item_SNo)
            //             && isEqualNumber(itmFil.Order_Id, item.OrderId)
            //     ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),

            //     convertableQuantity: parsedData.filter(
            //         itmFil => isEqualNumber(itmFil.Trip_Item_SNo, item.Trip_Item_SNo)
            //             && isEqualNumber(itmFil.OrderId, item.OrderId)
            //     ).reduce((itemAcc, deliveredItem) => {
            //         return Number(itemAcc) + Number(deliveredItem.Weight)
            //     }, 0) - Number(item.ConvertedAsInvoices.filter(
            //         itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
            //     ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),

            //     ...item,
            // }));


        } catch (e) {
            servError(e, res);
        }
    };

    const getPartyForInvoice = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT DISTINCT 
                        Retailer_Id, 
                        Retailer_Name, 
                        Reatailer_Address
                    FROM tbl_Retailers_Master`)
            // .query(`
            //     WITH OrderArrival AS (
            //         SELECT 
            //             d.OrderId, d.ItemId, d.Weight,  
            //             g.PartyId AS Retailer_Id, 
            //             g.PartyName AS Retailer_Name,
            //             r.Reatailer_Address
            //         FROM tbl_PurchaseOrderDeliveryDetails AS d
            //         INNER JOIN tbl_PurchaseOrderGeneralDetails AS g
            //             ON d.OrderId = g.Sno
            //         LEFT JOIN tbl_Retailers_Master AS r
            //             ON r.Retailer_Id = g.PartyId
            //         WHERE g.OrderStatus = 'Completed'
            //     ), InvoicedOrders AS (
            //         SELECT 
            //             odr.Order_Id, ipo.Item_Id, 
            //             SUM(ipo.Bill_Qty) AS Total_Bill_Qty
            //         FROM tbl_Purchase_Order_Inv_Gen_Order AS odr
            //         INNER JOIN tbl_Purchase_Order_Inv_Stock_Info AS ipo
            //             ON ipo.PIN_Id = odr.PIN_Id
            //         WHERE 
            //             odr.Order_Id IN (SELECT OrderId FROM OrderArrival)
            //             AND odr.Cancel_status = 0
            //         GROUP BY odr.Order_Id, ipo.Item_Id
            //     ) SELECT DISTINCT 
            //         g.Retailer_Id, 
            //         g.Retailer_Name, 
            //         g.Reatailer_Address
            //     FROM OrderArrival AS g
            //     LEFT JOIN InvoicedOrders AS i
            //         ON g.OrderId = i.Order_Id 
            //         AND g.ItemId = i.Item_Id
            //     WHERE 
            //         g.Weight > ISNULL(i.Total_Bill_Qty, 0) 
            //     ORDER BY g.Retailer_Name;`
            // );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    };

    const getPurchaseOrderMobile = async (req, res) => {
        try {
            const {
                User_Id,
                Branch_Id,
            } = req.query;

            const Fromdate = ISOString(req.query?.Fromdate ? req.query?.Fromdate : new Date());
            const Todate = ISOString(req.query?.Todate ? req.query?.Todate : new Date());

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('User_Id', User_Id ? parseInt(User_Id) : null)
                .input('Branch_Id', Branch_Id ? parseInt(Branch_Id) : null);

            // Branch filter logic
            let branchFilter = '';
            if (Branch_Id && !isNaN(Branch_Id)) {
                branchFilter = 'AND pgi.BranchId = @Branch_Id';
            } else if (User_Id && !isNaN(User_Id)) {
                branchFilter = `
                AND pgi.BranchId IN (
                    SELECT BranchId
                    FROM tbl_userbranchrights
                    WHERE User_Id = @User_Id
                )
            `;
            }

            const result = await request.query(`
            -------------------------table variable declaration----------
            DECLARE @FilteredOrders TABLE (Sno INT);
            -------------------------filtering invoices and inserting into table variable
            INSERT INTO @FilteredOrders (Sno)
            SELECT pgi.Sno
            FROM tbl_PurchaseOrderGeneralDetails AS pgi
            WHERE CONVERT(DATE, pgi.TradeConfirmDate) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
            ${branchFilter};

            -------------------------general info------------------------- 
            SELECT 
                pgi.*,
                COALESCE(lol.Ledger_Name, 'Not found') AS Ledger_Name,
                COALESCE(lol.Party_District, 'Not found') AS Party_District
            FROM tbl_PurchaseOrderGeneralDetails AS pgi
            LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pgi.PartyId
            LEFT JOIN tbl_Ledger_LOL AS lol ON lol.Ledger_Tally_Id = r.ERP_Id
            WHERE pgi.Sno IN (SELECT Sno FROM @FilteredOrders);

            -------------------------Stock Details---------------------------
            SELECT 
                i.*,
                COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
            FROM tbl_PurchaseOrderItemDetails AS i
            LEFT JOIN tbl_Product_Master AS p ON i.ItemId = p.Product_Id
            LEFT JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
            WHERE i.OrderId IN (SELECT Sno FROM @FilteredOrders);

            -------------------------Delivery details------------------------------
            SELECT 
                d.*,
                COALESCE(los.Stock_Item, 'Not Found') AS Stock_Item,
                COALESCE(los.Stock_Group, 'Not Found') AS Stock_Group
            FROM tbl_PurchaseOrderDeliveryDetails AS d
            LEFT JOIN tbl_Product_Master AS p ON d.ItemId = p.Product_Id
            LEFT JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
            WHERE d.OrderId IN (SELECT Sno FROM @FilteredOrders);

            -------------------------Transporter Details--------------------
            SELECT *
            FROM tbl_PurchaseOrderTranspoterDetails
            WHERE OrderId IN (SELECT Sno FROM @FilteredOrders)
            ORDER BY indexValue;

            -------------------------Staff Details -------------------------
            SELECT 
                stf.*,
                COALESCE(e.Cost_Center_Name, 'Not found') AS Emp_Name,
                COALESCE(cc.Cost_Category, 'Not found') AS Cost_Category
            FROM tbl_PurchaseOrderEmployeesInvolved AS stf
            LEFT JOIN tbl_ERP_Cost_Center AS e ON e.Cost_Center_Id = stf.EmployeeId
            LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = stf.CostType
            WHERE stf.OrderId IN (SELECT Sno FROM @FilteredOrders);

            -------------------------Invoice Orders---------------------------
            SELECT 
                igo.PIN_Id,
                igo.Order_Id,
                isd.Item_Id,
                isd.Bill_Qty,
                isd.DeliveryId
            FROM tbl_Purchase_Order_Inv_Gen_Order AS igo
            LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS isd
                ON isd.PIN_Id = igo.PIN_Id
            WHERE igo.Order_Id IN (SELECT Sno FROM @FilteredOrders);
        `);

            const [
                generalInfo, productDetails, deliveryDetails,
                transporterDetails, Staffdetails, invoicedOrders
            ] = result.recordsets;

            if (generalInfo.length > 0) {
                const extractedData = generalInfo.map(o => ({
                    ...o,
                    ConvertedAsInvoices: invoicedOrders.filter(fil => isEqualNumber(fil.Order_Id, o.Sno)),
                    ItemDetails: productDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    DeliveryDetails: deliveryDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    TranspoterDetails: transporterDetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno)),
                    StaffDetails: Staffdetails.filter(fil => isEqualNumber(fil.OrderId, o.Sno))
                }));

                const productWiseStatus = extractedData.map(o => ({
                    ...o,
                    DeliveryDetails: o.DeliveryDetails.map(item => ({
                        pendingInvoiceWeight: Number(item?.Weight) - Number(o.ConvertedAsInvoices.filter(
                            itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
                                && isEqualNumber(itmFil.DeliveryId, item.Trip_Item_SNo)
                                && isEqualNumber(itmFil.Order_Id, item.OrderId)
                        ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),
                        convertableQuantity: o.DeliveryDetails.filter(
                            itmFil => isEqualNumber(itmFil.ItemId, item.ItemId)
                                && isEqualNumber(itmFil.OrderId, item.OrderId)
                                && isEqualNumber(itmFil.Trip_Item_SNo, item.Trip_Item_SNo)
                        ).reduce((itemAcc, deliveredItem) => {
                            return Number(itemAcc) + Number(deliveredItem.Weight)
                        }, 0) - Number(o.ConvertedAsInvoices.filter(
                            itmFil => isEqualNumber(itmFil.Item_Id, item.ItemId)
                        ).reduce((invAcc, inv) => Number(invAcc) + Number(inv.Bill_Qty), 0)),
                        ...item,
                    })),
                }))

                const OrderWiseStatus = productWiseStatus.map(order => ({
                    IsConvertedAsInvoice: order.DeliveryDetails.reduce(
                        (acc, dItem) => acc + Number(dItem.convertableQuantity), 0
                    ) <= 0 ? 1 : 0,
                    isConvertableArrivalExist: order.DeliveryDetails.reduce(
                        (acc, dItem) => acc + Number(dItem.pendingInvoiceWeight), 0
                    ) > 0 ? 1 : 0,
                    ...order,
                }))

                dataFound(res, OrderWiseStatus);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getPurchaseOrder,
        createPurchaseOrder,
        updatePurchaseOrder,
        godownLocation,
        updateArrivalDetails,
        deleteOrderPermanantly,
        getDeliveryByPartyId,
        getPartyForInvoice,
        getPurchaseOrderMobile
    }
}

export default PurchaseOrderDataEntry();