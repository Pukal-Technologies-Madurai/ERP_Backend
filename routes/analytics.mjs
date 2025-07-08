import express from 'express';

import erpAndTallyComparison from '../controller/Analytics/erpAndTallyComparison.mjs';


const AnalalyticsRouter = express.Router();

AnalalyticsRouter.get('/dataComparison/salesInvoice/alterBased', erpAndTallyComparison.getERPAndTallySalesDifference);
AnalalyticsRouter.get('/dataComparison/salesInvoice/invoiceBased', erpAndTallyComparison.getERPSalesDataStatus);
AnalalyticsRouter.get('/dataComparison/salesInvoice/itemWise', erpAndTallyComparison.getSalesDifferenceItemWise);

AnalalyticsRouter.get('/dataComparison/purchaseInvoice/alterBased', erpAndTallyComparison.getERPAndTallyPurchaseDifference);
AnalalyticsRouter.get('/dataComparison/purchaseInvoice/invoiceBased', erpAndTallyComparison.getERPPurchaseDataStatus);
AnalalyticsRouter.get('/dataComparison/purchaseInvoice/itemWise', erpAndTallyComparison.getPurchaseDifferenceItemWise);


export default AnalalyticsRouter;