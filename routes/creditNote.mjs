import express from "express";
import { getCreditNote, getCreditNoteById, createCreditNote, updateCreditNote, deleteCreditNote, getFilterValues } from "../controller/creditNote/creditNoteCRUD.mjs";
import { alterHistory } from "../middleware/alterHistory.mjs";

const CreditNoteRouter = express.Router();

CreditNoteRouter.get('/filterValues', getFilterValues);
CreditNoteRouter.get('/', getCreditNote);
CreditNoteRouter.get('/withId', getCreditNoteById);
CreditNoteRouter.post('/', createCreditNote);
CreditNoteRouter.put('/', alterHistory({
    alteredTable: 'tbl_Credit_Note_Gen_Info',
    rowIdField: 'CR_Id',
    userField: 'Altered_by',
    reason: 'Alter_Reason',
}), updateCreditNote);
CreditNoteRouter.delete('/', deleteCreditNote);

export default CreditNoteRouter;