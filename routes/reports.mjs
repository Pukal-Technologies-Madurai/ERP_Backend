import express from 'express';
import dbconnect from '../middleware/otherDB.mjs';
import stockAndPurchase from '../controller/Reports/stockAndPurchase.mjs';
import template from '../controller/Reports/template.mjs';
import tallyReport from '../controller/Reports/tallyReport.mjs';
import tripReports from '../controller/Reports/tripReports.mjs';
import collectionReport from '../controller/Reports/collectionReport.mjs';
import tallyPullAPI from '../controller/Reports/tallyPullAPI.mjs';
import customerClosingStock from '../controller/Reports/customerClosingStock.mjs';

const ReportRouter = express.Router();

// stock Report
ReportRouter.get('/stockReport', dbconnect, stockAndPurchase.stockReport);
ReportRouter.get('/liveStockReport', stockAndPurchase.liveStockReport);
ReportRouter.get('/PurchaseOrderReportCard', dbconnect, stockAndPurchase.purchaseReport);
ReportRouter.get('/salesReport/ledger', dbconnect, stockAndPurchase.salesReport);
ReportRouter.get('/salesReport/ledger/itemDetails', dbconnect, stockAndPurchase.salesItemDetails);
ReportRouter.get('/salesReport/products', dbconnect, stockAndPurchase.porductBasedSalesResult);


ReportRouter.get('/tally-test-api-sales', tallyPullAPI.externalAPI);
ReportRouter.get('/tally-test-api-purchase', tallyPullAPI.externalAPIPurchase);
ReportRouter.get('/tally-test-api-saleOrder', tallyPullAPI.externalAPISaleOrder);
ReportRouter.get('/tally-test-api-stockJournal', tallyPullAPI.externalAPIStockJournal);
ReportRouter.get('/tally-test-api-receipt', tallyPullAPI.externalAPIReceipt);
ReportRouter.get('/tally-test-api-payment', tallyPullAPI.externalAPIPayment);

//---- admin api -- 
ReportRouter.get('/tally-purchase-admin-api', tallyPullAPI.tallyAdminPurchaseAPI);
ReportRouter.get('/tally-sales-admin-api', tallyPullAPI.tallyAdminSaleAPI);
ReportRouter.get('/tally-payment-admin-api', tallyPullAPI.tallyAdminPaymentAPI);
ReportRouter.get('/tally-receipt-admin-api', tallyPullAPI.tallyAdminReceiptAPI);


ReportRouter.get('/template', template.getTemplates);
ReportRouter.post('/template/executeQuery', dbconnect, template.executeTemplateSQL);
ReportRouter.post('/template', template.insertTemplate);
ReportRouter.put('/template', template.updateTemplate);
ReportRouter.delete('/template', template.deleteTemplate);
ReportRouter.post('/template/templateState', template.saveReportState);

ReportRouter.get('/tablesAndColumns', template.getTablesandColumnsForReport);


ReportRouter.get('/tallyReports/qPay', tallyReport.getQpayData);
ReportRouter.get('/tallyReports/productBased', dbconnect, tallyReport.productBasedSalesDetails);

ReportRouter.get('/tallyReports/qpay/columnVisiblity', tallyReport.getQPayColumns)
ReportRouter.post('/tallyReports/qpay/columnVisiblity', tallyReport.postColumnVisiblity)

ReportRouter.get('/tallyReports/qPay/salesTransaction', tallyReport.getSalesData);
ReportRouter.get('/tallyLOL', tallyReport.getTallyLOLData);
ReportRouter.get('/tallyLOS', tallyReport.getTallyLOSData);

ReportRouter.get('/tripReports', tripReports.getReports);
ReportRouter.get('/collectionReport', collectionReport.getPayments)

ReportRouter.get('/cummulativeReport', collectionReport.getCummulative);

ReportRouter.get('/customerClosingStock/soldItems', customerClosingStock.getSoldItems);
ReportRouter.get('/customerClosingStock/itemSearch', customerClosingStock.searchWhoHasTheItem);


export default ReportRouter;