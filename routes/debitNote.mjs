import express from "express";
import { getDebitNote, getDebitNoteById, createDebitNote, updateDebitNote, deleteDebitNote } from "../controller/debitNote/debitNoteCRUD.mjs";

const DebitNoteRouter = express.Router();

DebitNoteRouter.get('/debitNote', getDebitNote);
DebitNoteRouter.get('/debitNote/withId', getDebitNoteById);
DebitNoteRouter.post('/debitNote', createDebitNote);
DebitNoteRouter.put('/debitNote', updateDebitNote);
DebitNoteRouter.delete('/debitNote', deleteDebitNote);

export default DebitNoteRouter;
