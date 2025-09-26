import express from 'express';
import purchaseInvoice from '../controller/Purchase/purchaseInvoice.mjs';

const PurchaseRoute = express.Router();

PurchaseRoute.get('/purchaseOrder', purchaseInvoice.getPurchaseOrder);
PurchaseRoute.post('/purchaseOrder', purchaseInvoice.purchaseOrderCreation);
PurchaseRoute.put('/purchaseOrder', purchaseInvoice.editPurchaseOrder);
PurchaseRoute.delete('/purchaseOrder', purchaseInvoice.cancelPurchaseOrder);
PurchaseRoute.get('/purchaseOrder/involvedStaffs', purchaseInvoice.getInvolvedStaffs);

PurchaseRoute.get('/voucherType', purchaseInvoice.getVoucherType);
PurchaseRoute.get('/stockItemLedgerName', purchaseInvoice.getStockItemLedgerName);


export default PurchaseRoute;