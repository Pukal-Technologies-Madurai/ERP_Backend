import express from "express";
import { getCreditNote, getCreditNoteById, createCreditNote, updateCreditNote, deleteCreditNote, getFilterValues } from "../controller/creditNote/creditNoteCRUD.mjs";

const CreditNoteRouter = express.Router();

CreditNoteRouter.get('/filterValues', getFilterValues);
CreditNoteRouter.get('/', getCreditNote);
CreditNoteRouter.get('/withId', getCreditNoteById);
CreditNoteRouter.post('/', createCreditNote);
CreditNoteRouter.put('/', updateCreditNote);
CreditNoteRouter.delete('/', deleteCreditNote);

export default CreditNoteRouter;