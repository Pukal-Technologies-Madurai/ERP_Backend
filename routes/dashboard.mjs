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

DashboardRouter.get('/dayBook/sales', dbconnect, tallyModules.getTallySalesDetails);
DashboardRouter.get('/dayBook/journal', dbconnect, tallyModules.getTallyJournalDetails);
DashboardRouter.get('/dayBook/payment', dbconnect, tallyModules.getTallyPaymentDetails);
DashboardRouter.get('/dayBook/receipt', dbconnect, tallyModules.getTallyReceiptDetails);
DashboardRouter.get('/dayBook/contra', dbconnect, tallyModules.getTallyContraDetails);


export default DashboardRouter;