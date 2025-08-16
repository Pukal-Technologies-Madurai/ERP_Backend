import express from 'express';
import journalMaster from '../controller/Journal/journalMaster.mjs';
import journalDependency from '../controller/Journal/journalDependency.mjs';

const JournalRouter = express.Router();

JournalRouter.get('/journalMaster', journalMaster.getJournal);
JournalRouter.post('/journalMaster', journalMaster.createJournal);
JournalRouter.put('/journalMaster', journalMaster.editJournal);

JournalRouter.get('/filtersValues', journalDependency.getFilterValues);


export default JournalRouter;