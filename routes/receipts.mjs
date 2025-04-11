import express from 'express';
import paymentCollection from '../controller/Delivery/paymentCollection.mjs';

const ReceiptsRouter = express.Router();

ReceiptsRouter.get('/getRetailersWhoHasBills', paymentCollection.getRetailersWhoHasBills);
ReceiptsRouter.get('/retailerBills', paymentCollection.getRetailerBills);
ReceiptsRouter.get('/filterValues', paymentCollection.getFilterValues);

ReceiptsRouter.get('/collectionReceipts', paymentCollection.getPayments);
ReceiptsRouter.post('/collectionReceipts', paymentCollection.PaymentEntry);

// ReceiptsRouter.get('/deliveryOrder', deliverOrder.getSaleOrder);

export default ReceiptsRouter;