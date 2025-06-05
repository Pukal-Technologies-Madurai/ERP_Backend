import express from 'express';
import paymentCollection from '../controller/Delivery/paymentCollection.mjs';
import receiptMaster from '../controller/Receipts/receiptMaster.mjs';
import dataDependency from '../controller/Receipts/dataDependency.mjs';

const ReceiptsRouter = express.Router();

ReceiptsRouter.get('/getRetailersWhoHasBills', paymentCollection.getRetailersWhoHasBills);
ReceiptsRouter.get('/retailerBills', paymentCollection.getRetailerBills);
ReceiptsRouter.get('/filterValues', paymentCollection.getFilterValues);
ReceiptsRouter.get('/creditAccounts', paymentCollection.getCreditAccounts);

ReceiptsRouter.get('/collectionReceipts', paymentCollection.getPayments);
ReceiptsRouter.post('/collectionReceipts', paymentCollection.PaymentEntry);
ReceiptsRouter.put('/collectionReceipts', paymentCollection.editCollectionGeneralInfo);
ReceiptsRouter.delete('/collectionReceipts', paymentCollection.deleteReceiptEntry);
ReceiptsRouter.put('/verifyStatus',paymentCollection.verifyStatus);


ReceiptsRouter.get('/receiptMaster', receiptMaster.getReceipts);
ReceiptsRouter.post('/receiptMaster', receiptMaster.createReceipt);
ReceiptsRouter.put('/receiptMaster', receiptMaster.updateReceipt);

ReceiptsRouter.get('/receiptMaster/search', dataDependency.searchReceiptInvoice);
ReceiptsRouter.get('/receiptMaster/againstRef', dataDependency.getReceiptBillInfo);
ReceiptsRouter.get('/receiptMaster/againstRef/costingInfo', dataDependency.getReceiptCostingInfo);
ReceiptsRouter.post('/receiptMaster/againstRef', receiptMaster.addAgainstRef);

ReceiptsRouter.get('/getCustomerWhoHasBills', dataDependency.getSalesInvoicedCustomers);
ReceiptsRouter.get('/receiptMaster/pendingSalesInvoiceReceipt', dataDependency.getPendingReceipts);

ReceiptsRouter.get('/outstanding', paymentCollection.getOutStanding);
// ReceiptsRouter.get('/deliveryOrder', deliverOrder.getSaleOrder);

export default ReceiptsRouter;