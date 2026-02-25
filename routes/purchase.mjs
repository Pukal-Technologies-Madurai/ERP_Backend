import express from 'express';
import purchaseInvoice from '../controller/Purchase/purchaseInvoice.mjs';
import { getPurchaseDue } from '../controller/Purchase/purchaseDue.mjs';
import { getPurchaseFilterValues } from '../controller/Purchase/purchaseDependency.mjs';

const PurchaseRoute = express.Router();

PurchaseRoute.get('/purchaseOrder', purchaseInvoice.getPurchaseOrder);
PurchaseRoute.post('/purchaseOrder', purchaseInvoice.purchaseOrderCreation);
PurchaseRoute.put('/purchaseOrder', purchaseInvoice.editPurchaseOrder);
PurchaseRoute.delete('/purchaseOrder', purchaseInvoice.cancelPurchaseOrder);
PurchaseRoute.get('/purchaseOrder/involvedStaffs', purchaseInvoice.getInvolvedStaffs);
PurchaseRoute.get('/purchaseInvoiceMobile', purchaseInvoice.getPurchaseInvoiceMobile);

PurchaseRoute.get('/invoice/paymentDue', getPurchaseDue);
PurchaseRoute.get('/invoice/filterValues', getPurchaseFilterValues);

PurchaseRoute.get('/voucherType', purchaseInvoice.getVoucherType);
PurchaseRoute.get('/stockItemLedgerName', purchaseInvoice.getStockItemLedgerName);


export default PurchaseRoute;