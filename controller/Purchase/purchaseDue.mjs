import sql from 'mssql';
import { isEqualNumber, ISOString, toNumber } from "../../helper_functions.mjs";
import { sentData, servError } from "../../res.mjs";

export const getPurchaseDue = async (req, res) => {
    try {
        const
            Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString(),
            Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        const request = await new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .query(`
                -- DECLARE @Fromdate DATE = '2026-02-01', @Todate DATE = '2026-02-23';
                -- GETTING OPENING BALANCE
                	DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                -- GETTING PURCHASE RETURN
                	DECLARE @purchaseReturn TABLE (invoiceId INT NOT NULL);
                	INSERT INTO @purchaseReturn (invoiceId)
                	SELECT purchase.PIN_Id 
                	FROM tbl_Sales_Delivery_Gen_Info AS sales 
                	JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON purchase.Ref_Po_Inv_No = sales.Do_Inv_No 
                	WHERE 
                		sales.Do_Date >= @OB_Date AND 
                		sales.Cancel_status <> 0 AND 
                		purchase.Cancel_status = 0 AND
                		COALESCE(purchase.Ref_Po_Inv_No, '') <> '';
                -- SALES RETURN 
                	DECLARE @salesReturn TABLE (invoiceId INT NOT NULL);
                	INSERT INTO @salesReturn (invoiceId)
                	SELECT purchase.PIN_Id 
                	FROM tbl_Sales_Delivery_Gen_Info AS sales 
                	JOIN tbl_Purchase_Order_Inv_Gen_Info AS purchase ON purchase.Po_Inv_No = sales.Ref_Inv_Number
                	WHERE 
                		purchase.Po_Entry_Date <= @Fromdate
                		AND purchase.Cancel_status <> 0 
                		AND sales.Cancel_status <> 0
                		AND COALESCE(sales.Ref_Inv_Number, '') <> '';
                -- FOR INVOICE FILTERS
                    DECLARE @parchaseInvoice TABLE(invoiceId INT NOT NULL, invoiceNum NVARCHAR(50) NOT NULL);
                    INSERT INTO @parchaseInvoice (invoiceId, invoiceNum)
                    SELECT DISTINCT PIN_Id, Po_Inv_No 
                    FROM tbl_Purchase_Order_Inv_Gen_Info 
                    WHERE 
                        Po_Entry_Date BETWEEN @Fromdate AND @Todate
                        AND Cancel_status = 0
                		AND PIN_Id NOT IN (SELECT invoiceId FROM @purchaseReturn UNION SELECT invoiceId FROM @salesReturn)
                -- PURCHASE INVOICE GENERAL INFO
                    SELECT 
                    	pigi.PIN_Id AS invoiceId,
                    	pigi.Po_Inv_No AS invoiceNumber,
                    	bm.BranchCode AS branchNameGet,
                    	COALESCE(pigi.PaymentDays, 0) AS paymentDueDays,
                    	pigi.Po_Entry_Date invoiceDate,
                    	DATEADD(DAY, COALESCE(pigi.PaymentDays, 0), pigi.Po_Entry_Date) AS paymentDueDate,
                    	pigi.Retailer_Id AS retailerId,
                    	rm.Retailer_Name AS retailerNameGet,
                    	pigi.Total_Invoice_value AS invoiceValue,
                        COALESCE(pigi.Discount, 0) AS discountValue,
                    	pigi.Narration AS invoiceNarration
                    FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                    LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = pigi.Branch_Id
                    LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = pigi.Retailer_Id
                    WHERE pigi.PIN_Id IN (SELECT invoiceId FROM @parchaseInvoice)
                    ORDER BY pigi.Po_Entry_Date DESC;
                -- PRODUCT DETAILS
                    SELECT
                        pigi.PIN_Id AS invoiceId,
                        pigi.Po_Inv_No AS invoiceNumber,
                    	pisi.Item_Id AS itemId,
                    	pm.Product_Name AS productNameGet,
                    	pisi.Bill_Qty AS kgsValue,
                    	pisi.Bill_Alt_Qty AS bagsValue,
                    	pisi.Item_Rate AS rateValue,
                    	pisi.Amount AS amountValue
                    FROM tbl_Purchase_Order_Inv_Stock_Info AS pisi
                    JOIN tbl_Purchase_Order_Inv_Gen_Info AS pigi ON pigi.PIN_Id = pisi.PIN_Id
                    JOIN tbl_Product_Master AS pm ON pm.Product_Id = pisi.Item_Id
                    WHERE pigi.PIN_Id IN (SELECT invoiceId FROM @parchaseInvoice);
                -- PAYMENT REFERENCES
                    SELECT 
                    	pgi.payment_date AS refDate,
                    	pgi.payment_invoice_no AS refVoucherNumber,
                    	pbi.pay_bill_id AS refId,
                    	pbi.bill_name AS refNumber,
                    	pbi.Debit_Amo AS refAmount,
                    	'PAYMENT' AS refSource
                    FROM tbl_Payment_Bill_Info AS pbi
                    JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pbi.payment_id
                    WHERE 
                		pbi.bill_name IN (SELECT invoiceNum FROM @parchaseInvoice)
                		AND pgi.status <> 0;
                -- JOURNAL REFERENCES
                    SELECT 
                    	jgi.JournalDate AS refDate,
                    	jgi.JournalVoucherNo AS refVoucherNumber,
                    	jbi.RefId AS refId,
                    	jbi.RefNo AS refNumber,
                    	jbi.Amount AS refAmount,
                    	'JOURNAL' AS refSource
                    FROM tbl_Journal_Bill_Reference AS jbi
                    JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jbi.JournalAutoId
                    WHERE 
                		jbi.RefNo IN (SELECT invoiceNum FROM @parchaseInvoice)
                		AND jgi.JournalStatus <> 0;`
            );

        const [invoiceDetails, productDetails, paymentReferences, journalReferences] = request.recordsets;

        const result = invoiceDetails.map(invoice => {
            const product = productDetails.filter(
                product => isEqualNumber(product.invoiceId, invoice.invoiceId)
            );
            const payRefs = paymentReferences.filter(
                ref => ref.refNumber === invoice.invoiceNumber
            );
            const journalRefs = journalReferences.filter(
                ref => ref.refNumber === invoice.invoiceNumber
            );

            const totalInvoiceValue = toNumber(invoice.invoiceValue);
            const totalPaymentReference = payRefs.reduce((acc, ref) => acc + toNumber(ref.refAmount), 0);
            const totalJournalReference = journalRefs.reduce((acc, ref) => acc + toNumber(ref.refAmount), 0);
            const totalReference = totalPaymentReference + totalJournalReference;
            const paymentDue = totalInvoiceValue - totalReference;

            return {
                ...invoice,
                paymentDue,
                totalPaymentReference,
                totalJournalReference,
                totalReference,
                product,
                payRefs,
                journalRefs,
            }
        });

        sentData(res, result);
    } catch (e) {
        servError(e, res);
    }
}