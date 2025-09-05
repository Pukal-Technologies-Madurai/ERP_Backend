import express from 'express';
import salesOrder from '../controller/Sales/salesOrder.mjs';
import salesEntry from '../controller/Sales/salesEntry.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import salesInvoice from '../controller/Sales/salesInvoice.mjs';

const SalesRouter = express.Router();

SalesRouter.get('/saleOrder', salesOrder.getSaleOrder);
SalesRouter.post('/saleOrder', salesOrder.saleOrderCreation);
SalesRouter.put('/saleOrder', salesOrder.editSaleOrder);
SalesRouter.get('/saleDelivery', salesOrder.getDeliveryorder);
SalesRouter.get('/saleOrder/importPosOrders', salesOrder.importFromPos);
SalesRouter.get('/saleOrder/retailers', salesOrder.getRetailerNameForSearch);



SalesRouter.get('/stockInGodown', salesInvoice.getStockInHandGodownWise);
SalesRouter.get('/salesInvoice/filterValues', salesInvoice.getFilterValues);
SalesRouter.get('/salesInvoice/expenceAccount', salesInvoice.getSalesExpenceAccount);

SalesRouter.get('/saleOrderMobile', salesOrder.getSaleOrderMobile);
SalesRouter.get('/salesInvoiceMobile', salesInvoice.getSalesInvoiceMobile);

SalesRouter.get('/salesInvoice/tallySync', salesInvoice.salesTallySync);
SalesRouter.get('/salesInvoice', salesInvoice.getSalesInvoice);
SalesRouter.post('/salesInvoice', salesInvoice.createSalesInvoice);
SalesRouter.put('/salesInvoice', salesInvoice.updateSalesInvoice);
SalesRouter.post('/salesInvoice/liveSales', salesInvoice.liveSalesCreation);

SalesRouter.get('/presaleOrder/getList', salesOrder.getPresaleOrder)
SalesRouter.post('/presaleOrder/saleOrderCreationWithPso', salesOrder.saleOrderCreationWithPso)
SalesRouter.put('/presaleOrder/saleOrderCreationWithPso', salesOrder.updatesaleOrderWithPso)



SalesRouter.get('/partyWiseReport', dbconnect, salesEntry.partyWiseSalesReport);
SalesRouter.get('/partyWiseReport/details', dbconnect, salesEntry.partyDetailsReport);


SalesRouter.get('/salesInvoiceReport',salesInvoice.salesInvoiceReport)
SalesRouter.get('/saleOrderReport',salesOrder.saleOrderReport)

export default SalesRouter;