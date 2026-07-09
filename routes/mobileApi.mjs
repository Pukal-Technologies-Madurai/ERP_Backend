import express from 'express';
import { getErpVoucherTransactions } from '../controller/mobileAPI/dashboard.mjs';

const MobileAPIRouter = express.Router();

MobileAPIRouter.get('/erpVoucherTransactions', getErpVoucherTransactions);

export default MobileAPIRouter;