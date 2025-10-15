// In your main server file or routes index
import express from 'express'
import { getAllActiveContexts, getJobContext, linkContextToUser, storeJobContext } from '../controllers/job-context.controller.js';
const contextRouter = express.Router()

contextRouter.post('store-job-context', storeJobContext);
contextRouter.get('/job-context/:sessionId', getJobContext);
contextRouter.post('/link-context-to-user', linkContextToUser);
contextRouter.get('/active-contexts', getAllActiveContexts); // For debugging

export default contextRouter