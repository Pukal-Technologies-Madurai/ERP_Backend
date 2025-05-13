import express from 'express';
import paymentMaster from '../controller/Payment/paymentMaster.mjs';

const PaymentRouter = express.Router();

PaymentRouter.get('/paymentMaster', paymentMaster.getPayments);
PaymentRouter.post('/paymentMaster', paymentMaster.createGeneralInfoPayments);
PaymentRouter.put('/paymentMaster', paymentMaster.updateGeneralInfoPayments);

export default PaymentRouter;