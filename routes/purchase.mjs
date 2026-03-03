import express from 'express';
import purchaseInvoice from '../controller/Purchase/purchaseInvoice.mjs';
import { getPurchaseDue } from '../controller/Purchase/purchaseDue.mjs';
import { getPurchaseFilterValues } from '../controller/Purchase/purchaseDependency.mjs';
import { alterHistory } from '../middleware/alterHistory.mjs';

const PurchaseRoute = express.Router();

PurchaseRoute.get('/purchaseOrder', purchaseInvoice.getPurchaseInvoice);
PurchaseRoute.post('/purchaseOrder', purchaseInvoice.purchaseInvoiceCreation);
PurchaseRoute.put(
    '/purchaseOrder',
    alterHistory({
        alteredTable: 'tbl_Purchase_Order_Inv_Gen_Info',
        rowIdField: 'PIN_Id',
        userField: 'Created_by',
        reason: 'Alter_Reason',
    }),
    purchaseInvoice.editPurchaseInvoice,
);
PurchaseRoute.delete('/purchaseOrder', purchaseInvoice.cancelPurchaseInvoice);


PurchaseRoute.get('/purchaseOrder/involvedStaffs', purchaseInvoice.getInvolvedStaffs);
PurchaseRoute.get('/purchaseInvoiceMobile', purchaseInvoice.getPurchaseInvoiceMobile);

PurchaseRoute.get('/invoice/paymentDue', getPurchaseDue);
PurchaseRoute.get('/invoice/filterValues', getPurchaseFilterValues);

PurchaseRoute.get('/voucherType', purchaseInvoice.getVoucherType);
PurchaseRoute.get('/stockItemLedgerName', purchaseInvoice.getStockItemLedgerName);


export default PurchaseRoute;