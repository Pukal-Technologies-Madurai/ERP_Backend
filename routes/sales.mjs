import express from 'express';
import salesOrder from '../controller/Sales/salesOrder.mjs';
import salesEntry from '../controller/Sales/salesEntry.mjs';
import dbconnect from '../middleware/otherDB.mjs';

const SalesRouter = express.Router();

SalesRouter.get('/saleOrder', salesOrder.getSaleOrder);
SalesRouter.post('/saleOrder', salesOrder.saleOrderCreation);
SalesRouter.put('/saleOrder', salesOrder.editSaleOrder);
SalesRouter.get('/saleDelivery', salesOrder.getDeliveryorder);
SalesRouter.get('/saleOrder/importPosOrders', salesOrder.importFromPos);

SalesRouter.get('/partyWiseReport', dbconnect, salesEntry.partyWiseSalesReport);
SalesRouter.get('/partyWiseReport/details', dbconnect, salesEntry.partyDetailsReport);

export default SalesRouter;