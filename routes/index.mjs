import express from 'express';
// import authenticateToken from '../middleware/auth.mjs'

import AttendanceRouter from './attendance.mjs';
import AuthorizationRouter from './authorization.mjs';
import DashboardRouter from './dashboard.mjs';
import dataEntryRouter from './dataEntry.mjs';
import TopicsRouter from './discussionForem.mjs';
import MastersRouter from './masters.mjs';
import projectRoute from './projectsAndTasks.mjs';
import UserModule from './userModule.mjs';
import ReportRouter from './reports.mjs';
import SalesRouter from './sales.mjs';
import PurchaseRouter from './purchase.mjs'
import inventoryRouter from './inventory.mjs';
import DeliveryRouter from './delivery.mjs';
import ReceiptsRouter from './receipts.mjs';
import PaymentRouter from './payment.mjs';
const indexRouter = express.Router();

indexRouter.use('/empAttendance', AttendanceRouter);
indexRouter.use('/authorization', AuthorizationRouter);
indexRouter.use('/dashboard', DashboardRouter);
indexRouter.use('/dataEntry', dataEntryRouter);
indexRouter.use('/discussionForum', TopicsRouter);
indexRouter.use('/masters', MastersRouter);
indexRouter.use('/sales', SalesRouter);
indexRouter.use('/purchase', PurchaseRouter);
indexRouter.use('/inventory', inventoryRouter);
indexRouter.use('/taskManagement', projectRoute);
indexRouter.use('/reports', ReportRouter)
indexRouter.use('/userModule', UserModule);
indexRouter.use('/delivery', DeliveryRouter);
indexRouter.use('/receipt', ReceiptsRouter);
indexRouter.use('/payment', PaymentRouter);


export default indexRouter;