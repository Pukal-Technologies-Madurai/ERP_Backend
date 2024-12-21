import express from 'express';
import DashboardController from '../controller/Dashboard/counts.mjs' 
const DashboardRouter = express.Router();
import dbconnect from '../middleware/otherDB.mjs';

DashboardRouter.get('/dashboardData', DashboardController.getDashboardData);
DashboardRouter.get('/getTallyData', DashboardController.getTallyWorkDetails);
DashboardRouter.get('/employeeAbstract', DashboardController.getEmployeeAbstract);
DashboardRouter.get('/erp/dashboardData', DashboardController.getERPDashboardData);
DashboardRouter.get('/salesInfo', dbconnect, DashboardController.getSalesInfo);
DashboardRouter.get('/purchaseInfo', DashboardController.getPurchaseInfo);
DashboardRouter.get('/newEmployeeAbstract', DashboardController.getnewEmployeeAbstract);
DashboardRouter.get('/usernewEmployeeAbstract', DashboardController.usergetnewEmployeeAbstract);


export default DashboardRouter;