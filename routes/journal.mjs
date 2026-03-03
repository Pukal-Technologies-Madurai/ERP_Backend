import express from 'express';
import journalMaster from '../controller/Journal/journalMaster.mjs';
import journalDependency from '../controller/Journal/journalDependency.mjs';
import { alterHistory } from '../middleware/alterHistory.mjs';

const JournalRouter = express.Router();

JournalRouter.get('/journalMaster', journalMaster.getJournal);
JournalRouter.post('/journalMaster', journalMaster.createJournal);
JournalRouter.put(
    '/journalMaster', 
    alterHistory({
        alteredTable: 'tbl_Journal_General_Info',
        rowIdField: 'JournalAutoId',
        userField: 'CreatedBy',
        reason: 'Alter_Reason',
    }),
    journalMaster.editJournal
);

JournalRouter.get('/filtersValues', journalDependency.getFilterValues);
JournalRouter.get('/accountPendingReference', journalDependency.getAccountPendingReference);
JournalRouter.get('/accounts', journalDependency.getJournalAccounts)


export default JournalRouter;