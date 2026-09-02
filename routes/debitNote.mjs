import express from "express";
import { getDebitNote, getDebitNoteById, createDebitNote, updateDebitNote, getFilterValues, cancelDebitNote } from "../controller/debitNote/debitNoteCRUD.mjs";
import { alterHistory } from "../middleware/alterHistory.mjs";

const DebitNoteRouter = express.Router();

DebitNoteRouter.get('/filterValues', getFilterValues);
DebitNoteRouter.get('/', getDebitNote);
DebitNoteRouter.get('/withId', getDebitNoteById);
DebitNoteRouter.post('/', createDebitNote);
DebitNoteRouter.put('/', alterHistory({
    alteredTable: 'tbl_Debit_Note_Gen_Info',
    rowIdField: 'DB_Id',
    userField: 'Altered_by',
    reason: 'Alter_Reason',
}), updateDebitNote);
DebitNoteRouter.delete('/', alterHistory({
    alteredTable: 'tbl_Debit_Note_Gen_Info',
    rowIdField: 'DB_Id',
    userField: 'Altered_by',
    reason: 'Alter_Reason',
}), cancelDebitNote);

export default DebitNoteRouter;
