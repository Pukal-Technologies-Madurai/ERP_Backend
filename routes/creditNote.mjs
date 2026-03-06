import express from "express";
import { getCreditNote, getCreditNoteById, createCreditNote, updateCreditNote, deleteCreditNote } from "../controller/creditNote/creditNoteCRUD.mjs";

const CreditNoteRouter = express.Router();

CreditNoteRouter.get('/creditNote', getCreditNote);
CreditNoteRouter.get('/creditNote/withId', getCreditNoteById);
CreditNoteRouter.post('/creditNote', createCreditNote);
CreditNoteRouter.put('/creditNote', updateCreditNote);
CreditNoteRouter.delete('/creditNote', deleteCreditNote);

export default CreditNoteRouter;