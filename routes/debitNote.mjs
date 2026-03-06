import express from "express";
import { getDebitNote, getDebitNoteById, createDebitNote, updateDebitNote, deleteDebitNote, getFilterValues } from "../controller/debitNote/debitNoteCRUD.mjs";

const DebitNoteRouter = express.Router();

DebitNoteRouter.get('/filterValues', getFilterValues);
DebitNoteRouter.get('/', getDebitNote);
DebitNoteRouter.get('/withId', getDebitNoteById);
DebitNoteRouter.post('/', createDebitNote);
DebitNoteRouter.put('/', updateDebitNote);
DebitNoteRouter.delete('/', deleteDebitNote);

export default DebitNoteRouter;
