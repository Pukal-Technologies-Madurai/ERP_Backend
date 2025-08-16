import express from 'express';
import paymentMaster from '../controller/Payment/paymentMaster.mjs';
import paymentDependency from '../controller/Payment/dataDependency.mjs';
import paymentReport from '../controller/Payment/paymentReport.mjs';
import debtorsCreditors from '../controller/Payment/debtorsCreditors.mjs';

const PaymentRouter = express.Router();

PaymentRouter.get('/paymentMaster', paymentMaster.getPayments);
PaymentRouter.post('/paymentMaster', paymentMaster.createGeneralInfoPayments);
PaymentRouter.put('/paymentMaster', paymentMaster.updateGeneralInfoPayments);

PaymentRouter.get('/paymentMaster/filtersValues', paymentDependency.getFilterValues);
PaymentRouter.get('/paymentMaster/againstRef', paymentDependency.getPaymentInvoiceBillInfo);
PaymentRouter.get('/paymentMaster/againstRef/costingDetails', paymentDependency.getPaymentInvoiceCostingInfo);
PaymentRouter.post('/paymentMaster/againstRef', paymentMaster.addAgainstRef);
PaymentRouter.post('/paymentMaster/searchStockJournal', paymentDependency.searchStockJournal);

PaymentRouter.get('/paymentMaster/search', paymentDependency.searchPaymentInvoice);
PaymentRouter.get('/accountGroup', paymentDependency.getAccountGroups);
PaymentRouter.get('/accounts', paymentDependency.getAccounts);
PaymentRouter.get('/paymentPendingInvoices', paymentDependency.getPendingPayments);

PaymentRouter.get('/reports/pendingReference', paymentReport.getPendingPaymentReference);
PaymentRouter.get('/reports/accountsTransaction', paymentReport.getAccountsTransaction);
PaymentRouter.get('/reports/itemExpences', paymentReport.itemTotalExpenceWithStockGroup);

PaymentRouter.post('/debtorsCreditors', debtorsCreditors.getDebtorsCrditors)
PaymentRouter.get('/getDebtorsCreditors', debtorsCreditors.getDebtorsCreditorsId)


export default PaymentRouter;