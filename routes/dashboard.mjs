import express from 'express';
import DashboardController from '../controller/Dashboard/counts.mjs' ;
import tallyModules from '../controller/Dashboard/tallyModules.mjs';
const DashboardRouter = express.Router();
import dbconnect from '../middleware/otherDB.mjs';

DashboardRouter.get('/dashboardData', DashboardController.getDashboardData);
DashboardRouter.get('/getTallyData', DashboardController.getTallyWorkDetails);
DashboardRouter.get('/employeeAbstract', DashboardController.getEmployeeAbstract);
DashboardRouter.get('/erp/dashboardData', DashboardController.getERPDashboardData);
DashboardRouter.get('/salesInfo', dbconnect, DashboardController.getSalesInfo);
DashboardRouter.get('/purchaseInfo', DashboardController.getPurchaseInfo);
DashboardRouter.get('/purchaseInfo/moreInfo', DashboardController.getPurchaseMoreInfo);
DashboardRouter.get('/newEmployeeAbstract', DashboardController.getnewEmployeeAbstract);
DashboardRouter.get('/usernewEmployeeAbstract', DashboardController.usergetnewEmployeeAbstract);
DashboardRouter.get('/dayBook', dbconnect, DashboardController.getDayBookOfERP);
DashboardRouter.get('/lastSyncedTime', dbconnect, DashboardController.getLastSyncedTime);


// Day book api

DashboardRouter.get('/dayBook/PurchaseOrder', dbconnect, tallyModules.getTallyPurchaseOrderDetails);
DashboardRouter.get('/dayBook/PurchaseInvoice', dbconnect, tallyModules.getTallyPurchaseInvoiceDetails);

DashboardRouter.get('/dayBook/SaleOrder', dbconnect, tallyModules.getTallySalesOrderDetails);
DashboardRouter.get('/dayBook/SalesInvoice', dbconnect, tallyModules.getTallySalesInvoiceDetails);

DashboardRouter.get('/dayBook/StockJournal', dbconnect, tallyModules.getTallyStockJournalDetails);
DashboardRouter.get('/dayBook/Journal', dbconnect, tallyModules.getTallyJournalDetails);
DashboardRouter.get('/dayBook/Payment', dbconnect, tallyModules.getTallyPaymentDetails);
DashboardRouter.get('/dayBook/Receipt', dbconnect, tallyModules.getTallyReceiptDetails);
DashboardRouter.get('/dayBook/Contra', dbconnect, tallyModules.getTallyContraDetails);


export default DashboardRouter;