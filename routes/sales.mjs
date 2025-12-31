import express from 'express';
import salesOrder from '../controller/Sales/salesOrder.mjs';
import salesEntry from '../controller/Sales/salesEntry.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import {
    getSalesInvoice, createSalesInvoice, updateSalesInvoice, salesTallySync, liveSalesCreation
} from '../controller/Sales/salesInvoice/salesInvoceCrud.mjs';
import {
    getFilterValues, getStockInHandGodownWise, getSalesExpenceAccount
} from '../controller/Sales/salesInvoice/invoiceDependency.mjs';
import { getSalesInvoiceForAssignCostCenter, invoiceCopyPrintOut, katchathCopyPrintOut, multipleSalesInvoiceStaffUpdate, postAssignCostCenterToSalesInvoice,deliverySlipPrintOut, salesInvoicePaper } from '../controller/Sales/salesInvoice/salesLRReport.mjs';
import salesInvoice from '../controller/Sales/salesInvoice.mjs';
import salesReports from '../controller/Sales/reports.mjs';
const SalesRouter = express.Router();

SalesRouter.get('/saleOrder', salesOrder.getSaleOrder);
SalesRouter.post('/saleOrder', salesOrder.saleOrderCreation);
SalesRouter.put('/saleOrder', salesOrder.editSaleOrder);
SalesRouter.get('/saleDelivery', salesOrder.getDeliveryorder);
SalesRouter.get('/saleOrder/importPosOrders', salesOrder.importFromPos);
SalesRouter.get('/saleOrder/retailers', salesOrder.getRetailerNameForSearch);



SalesRouter.get('/stockInGodown', getStockInHandGodownWise);
SalesRouter.get('/salesInvoice/filterValues', getFilterValues);
SalesRouter.get('/salesInvoice/expenceAccount', getSalesExpenceAccount);

SalesRouter.get('/saleOrderMobile', salesOrder.getSaleOrderMobile);
SalesRouter.get('/salesInvoiceMobile', salesInvoice.getSalesInvoiceMobileFilter1);
SalesRouter.get('/salesInvoiceMobileFilter', salesInvoice.getSalesInvoiceMobileFilter2);
SalesRouter.get('/salesFilterDropdown', salesInvoice.getMobileReportDropdowns)

SalesRouter.get('/salesInvoice', getSalesInvoice);
SalesRouter.post('/salesInvoice', createSalesInvoice);
SalesRouter.get('/salesInvoice/tallySync', salesTallySync);
SalesRouter.put('/salesInvoice', updateSalesInvoice);
SalesRouter.post('/salesInvoice/liveSales', liveSalesCreation);

SalesRouter.get('/presaleOrder/getList', salesOrder.getPresaleOrder)
SalesRouter.post('/presaleOrder/saleOrderCreationWithPso', salesOrder.saleOrderCreationWithPso)
SalesRouter.put('/presaleOrder/saleOrderCreationWithPso', salesOrder.updatesaleOrderWithPso)



SalesRouter.get('/partyWiseReport', dbconnect, salesEntry.partyWiseSalesReport);
SalesRouter.get('/partyWiseReport/details', dbconnect, salesEntry.partyDetailsReport);


SalesRouter.get('/salesInvoiceReport', salesInvoice.salesInvoiceReport)
SalesRouter.get('/saleOrderReport', salesOrder.saleOrderReport)



SalesRouter.post('/salesOrderSalesInvoice', salesInvoice.createSalesTransaction)
SalesRouter.get('/salesInvoice/Details', salesInvoice.getSaleOrderWithDeliveries)
SalesRouter.get('/invoicesNumber',salesInvoice.getSalesOrderInvoice)

// sales LR Report routes
SalesRouter.get('/salesInvoice/lrReport', getSalesInvoiceForAssignCostCenter);
SalesRouter.post('/salesInvoice/lrReport', postAssignCostCenterToSalesInvoice);
SalesRouter.post('/salesInvoice/lrReport/multiple', multipleSalesInvoiceStaffUpdate);

// sales Invoice Paper
SalesRouter.get('/salesInvoice/salesInvoicePaper', salesInvoicePaper);

// sales print out routes
SalesRouter.get('/salesInvoice/printOuts/katchath', katchathCopyPrintOut);
SalesRouter.get('/salesInvoice/printOuts/invoicePrint', invoiceCopyPrintOut);

//delivery slip printout
SalesRouter.get('/salesInvoice/printOuts/deliverySlip', deliverySlipPrintOut);


SalesRouter.get('/lrReport', salesReports.getLRreport)
SalesRouter.post('/lrReport', salesReports.costCenterUpdate)

export default SalesRouter;