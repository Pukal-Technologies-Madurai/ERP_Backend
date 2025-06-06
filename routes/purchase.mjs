import express from 'express';
import purchaseOrder from '../controller/Purchase/purchaseOrder.mjs';

const PurchaseRoute = express.Router();

PurchaseRoute.get('/purchaseOrder', purchaseOrder.getPurchaseOrder);
PurchaseRoute.post('/purchaseOrder', purchaseOrder.purchaseOrderCreation);
PurchaseRoute.put('/purchaseOrder', purchaseOrder.editPurchaseOrder);
PurchaseRoute.delete('/purchaseOrder', purchaseOrder.cancelPurchaseOrder);
PurchaseRoute.get('/purchaseOrder/involvedStaffs', purchaseOrder.getInvolvedStaffs);

PurchaseRoute.get('/paymentPendingInvoices', purchaseOrder.getPendingPayments);

PurchaseRoute.get('/voucherType', purchaseOrder.getVoucherType);
PurchaseRoute.get('/stockItemLedgerName', purchaseOrder.getStockItemLedgerName);


export default PurchaseRoute;