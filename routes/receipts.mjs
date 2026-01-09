import express from 'express';
import paymentCollection from '../controller/Delivery/paymentCollection.mjs';
import receiptMaster from '../controller/Receipts/receiptMaster.mjs';
import dataDependency from '../controller/Receipts/dataDependency.mjs';
import receiptReport from '../controller/Receipts/receiptReport.mjs';

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

ReceiptsRouter.get('/receiptMaster/filtersValues', dataDependency.getFilterValues);
ReceiptsRouter.get('/receiptMaster/search', dataDependency.searchReceiptInvoice);
ReceiptsRouter.get('/receiptMaster/adjesments', dataDependency.getReceiptAdjesments);
ReceiptsRouter.get('/receiptMaster/againstRef', dataDependency.getReceiptBillInfo);
ReceiptsRouter.get('/receiptMaster/againstRef/costingInfo', dataDependency.getReceiptCostingInfo);
ReceiptsRouter.post('/receiptMaster/againstRef', receiptMaster.addAgainstRef);
ReceiptsRouter.get('/receiptMasterMobile',receiptMaster.getReceiptMobile);

ReceiptsRouter.get('/getCustomerWhoHasBills', dataDependency.getSalesInvoicedCustomers);
ReceiptsRouter.get('/receiptMaster/pendingSalesInvoiceReceipt', dataDependency.getPendingReceipts);
ReceiptsRouter.get('/receiptMaster/pendingSalesInvoiceReceipt/amount', dataDependency.getPendingReceiptsAmount);
ReceiptsRouter.get('/receiptMaster/pendingSalesInvoiceReceipt/retailerBased', dataDependency.getPendingReceiptsRetailerBased);

ReceiptsRouter.get('/outstanding', paymentCollection.getOutStanding);

ReceiptsRouter.get('/outStandingAbove',receiptReport.getOutstadingAbove)
ReceiptsRouter.get('/outstandingOver',receiptReport.getoutstandingOver)
// ReceiptsRouter.get('/deliveryOrder', deliverOrder.getSaleOrder);

export default ReceiptsRouter;