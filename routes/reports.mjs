import express from 'express';
import dbconnect from '../middleware/otherDB.mjs';
import stockAndPurchase from '../controller/Reports/stockAndPurchase.mjs';
import template from '../controller/Reports/template.mjs';
import tallyReport from '../controller/Reports/tallyReport.mjs';
import tripReports from '../controller/Reports/tripReports.mjs';
import collectionReport from '../controller/Reports/collectionReport.mjs';
import tallyPullAPI from '../controller/Reports/tallyPullAPI.mjs';
import customerClosingStock from '../controller/Reports/customerClosingStock.mjs';
import storageStockReport from '../controller/Reports/storageStockReport.mjs';
import costCenterReports from '../controller/Reports/costCenterReports.mjs';
import nagalReports from '../controller/Reports/nakalReports.mjs';
import reportsColumnVisiblity from '../controller/Reports/reportsColumnVisiblity.mjs';
import deliveryReports from '../controller/Reports/deliveryReports.mjs';
import expences from '../controller/Masters/expences.mjs';
import templateMobile from '../controller/Reports/templateMobile.mjs';



const ReportRouter = express.Router();

// stock Report
ReportRouter.get('/stockReport', dbconnect, stockAndPurchase.stockReport);
ReportRouter.get('/liveStockReport', stockAndPurchase.liveStockReport);
ReportRouter.get('/PurchaseOrderReportCard', dbconnect, stockAndPurchase.purchaseReport);
ReportRouter.get('/salesReport/ledger', dbconnect, stockAndPurchase.salesReport);
ReportRouter.get('/salesReport/ledger/groupSales', dbconnect, stockAndPurchase.ledgersGroupingSales);
ReportRouter.get('/salesReport/ledger/itemDetails', dbconnect, stockAndPurchase.salesItemDetails);
ReportRouter.get('/salesReport/products', dbconnect, stockAndPurchase.porductBasedSalesResult);

// --- tally pull apis
ReportRouter.get('/tally-test-api-sales', tallyPullAPI.externalAPI);
ReportRouter.get('/tally-test-api-purchase', tallyPullAPI.externalAPIPurchase);
ReportRouter.get('/tally-test-api-saleOrder', tallyPullAPI.externalAPISaleOrder);
ReportRouter.get('/tally-test-api-stockJournal', tallyPullAPI.externalAPIStockJournal);
ReportRouter.get('/tally-test-api-receipt', tallyPullAPI.externalAPIReceipt);
ReportRouter.get('/tally-test-api-payment', tallyPullAPI.externalAPIPayment);
ReportRouter.get('/tally-test-api-journal', tallyPullAPI.externalAPIJournal);
ReportRouter.get('/tally-test-api-contra', tallyPullAPI.externalAPIContra);

//---- admin api -- 
ReportRouter.get('/tally-stockJournal-admin-api', tallyPullAPI.tallyAdminStockJournalAPI);
ReportRouter.get('/tally-purchase-admin-api', tallyPullAPI.tallyAdminPurchaseAPI);
ReportRouter.get('/tally-sales-admin-api', tallyPullAPI.tallyAdminSaleAPI);
ReportRouter.get('/tally-payment-admin-api', tallyPullAPI.tallyAdminPaymentAPI);
ReportRouter.get('/tally-receipt-admin-api', tallyPullAPI.tallyAdminReceiptAPI);
ReportRouter.get('/tally-journal-admin-api', tallyPullAPI.tallyAdminReceiptAPI);

//---- update api --

ReportRouter.get('/tally-sales-update-api', tallyPullAPI.tallySalesUpdateAPI);
ReportRouter.get('/tally-purchase-update-api', tallyPullAPI.tallyPurchaseUpdateAPI);
ReportRouter.get('/tally-journal-update-api', tallyPullAPI.tallyJournalUpdateApi);
ReportRouter.get('/tally-payment-update-api', tallyPullAPI.tallyPaymentUpdateAPI);
ReportRouter.get('/tally-receipt-update-api', tallyPullAPI.tallyReceiptUpdateAPI);
ReportRouter.get('/tally-stockJournal-update-api', tallyPullAPI.tallyStockJournalUpdateAPI);


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
ReportRouter.get('/customerClosingStock/withLOS', customerClosingStock.losBasedReport);
ReportRouter.get('/customerClosingStock/itemSearch', customerClosingStock.searchWhoHasTheItem);
ReportRouter.get('/customerClosingStock/retailerBased', customerClosingStock.ledgerBasedClosingStock);
ReportRouter.get('/customerClosingStock/retailerBased/detailedInfo', customerClosingStock.ledgerClosingStock);
ReportRouter.get('/customerClosingStock/retailerBased/salesPersonGrouped', customerClosingStock.ledgerSalesPersonGroupingClosingStock);
ReportRouter.get('/customerClosingStock/retailerBased/withLOL', customerClosingStock.ledgerBasedClosingStockWithLOL);
ReportRouter.get('/customerClosingStock/itemWithRetailer', customerClosingStock.itemAndRetailerBasedReport);

ReportRouter.get('/storageStock/itemWise', storageStockReport.getStorageStockItemWise);
ReportRouter.get('/storageStock/godownWise', storageStockReport.getStorageStockGodownWise);
ReportRouter.get('/itemGroup/stockInfo', storageStockReport.itemGroupWiseClosingDetails);
ReportRouter.get('/itemGroup/stockInfo/grouped', storageStockReport.StockGroupWiseClosingDetails);



ReportRouter.get('/storageStock/itemWiseMobile', storageStockReport.getStorageStockItemWiseMobile);
ReportRouter.get('/storageStock/godownWiseMobile', storageStockReport.getStorageStockGodownWiseMobile);
ReportRouter.get('/itemGroup/stockInfoMobile', storageStockReport.itemGroupWiseClosingDetailsMobile);



ReportRouter.get('/brokerageReport/getInvolvedBroker', costCenterReports.getBrokerInvolvedInPurchase);
ReportRouter.get('/brokerageReport/purchaseInvoice', costCenterReports.purchaseBrokerageReport);
ReportRouter.get('/brokerageReport/salesInvoice', costCenterReports.salesDeliveryBrokerageReport);

ReportRouter.get('/brokerageNakalReport/sales', nagalReports.nakalSalesReport)
ReportRouter.get('/brokerageNakalReport/purchase', nagalReports.nakalPurchaseReport)
ReportRouter.post('/brokerageNakal/deliveryCreate', nagalReports.postnagalPurchase)

ReportRouter.post('/brokerageNagal/create', nagalReports.postNakalReport)
ReportRouter.get('/brokerageNagal/list', nagalReports.getNakalReport);

ReportRouter.get('/brokerageNagalDelivery/list', nagalReports.getNagalPurchase)

ReportRouter.get('/reportsNonconvert/sales', deliveryReports.getNonConvertedSales)


ReportRouter.get('/reportState/columnVisiblity', reportsColumnVisiblity.getReportColumnVisiblityState);
ReportRouter.post('/reportState/columnVisiblity', reportsColumnVisiblity.createReportColumnVisiblityState);

ReportRouter.get('/brokerageNakalReport/salesEntry', nagalReports.nakalSalesDataEntryReport)

ReportRouter.post('/brokerageNagal/createSales', nagalReports.postNakalSales)
ReportRouter.get('/brokerageNagalSales/list', nagalReports.getSalesReport)
ReportRouter.delete('/brokerageNagalSales/list', nagalReports.deleteSalesNagal)
ReportRouter.delete('/brokerageNagalPurchase/list', nagalReports.nagalPurchaseBulkDelete)

ReportRouter.put('/brokerageNagalPurchase/list', nagalReports.nagalUpdateItemwise)
ReportRouter.get('/expenseReport', expences.getExpences)
ReportRouter.post('/expenseByAccId', expences.expensesExpandable)
ReportRouter.post('/smtreports', deliveryReports.closingReport)


ReportRouter.post('/syncPosPending',deliveryReports.SyncPosPending)



ReportRouter.get('/templateMobile', templateMobile.getMobileTemplates);
ReportRouter.post('templateMobile/executeQuery', dbconnect, templateMobile.executeMobileTemplateSQL);
ReportRouter.post('/templateMobile',templateMobile.insertMobileTemplate),
ReportRouter.put('/templateMobile',templateMobile.updateMobileTemplate),
ReportRouter.delete('/templateMobile', templateMobile.deleteMobileTemplate);
ReportRouter.post('templateMobile/templateState', templateMobile.saveMobileReportState);
ReportRouter.get('/tablesAndColumnsMobile', templateMobile.getTablesandColumnsForMobileReport)

ReportRouter.get('/returnReports',deliveryReports.ReturnDelivery)

export default ReportRouter;