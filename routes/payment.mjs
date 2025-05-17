import express from 'express';
import paymentMaster from '../controller/Payment/paymentMaster.mjs';
import paymentDependency from '../controller/Payment/dataDependency.mjs';

const PaymentRouter = express.Router();

PaymentRouter.get('/paymentMaster', paymentMaster.getPayments);
PaymentRouter.post('/paymentMaster', paymentMaster.createGeneralInfoPayments);
PaymentRouter.put('/paymentMaster', paymentMaster.updateGeneralInfoPayments);

PaymentRouter.get('/paymentMaster/search', paymentDependency.searchPaymentInvoice);
PaymentRouter.get('/accountGroup', paymentDependency.getAccountGroups);
PaymentRouter.get('/accounts', paymentDependency.getAccounts);


export default PaymentRouter;