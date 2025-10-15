import express from 'express'
import { verifyToken } from '../middlewares/auth.middleware.js'
import { facebookCredentials, getAutomationStatus, getFacebookCredentials, getJobPostStatus, runCustomAutomation, runFacebookAutomation, runJobPostForAllUsers, stopFacebookAutomation, stopJobPostAutomation } from '../controllers/facebook.controller.js'
import { runJobPostAutomation } from '../../../src/automation/job-post-runner.js'

const facebookRouter = express.Router()

facebookRouter.use(verifyToken)

facebookRouter.post('/credentials', facebookCredentials);
facebookRouter.get('/credentials', getFacebookCredentials);

// Regular automation routes
facebookRouter.post('/automation/run', runFacebookAutomation);
facebookRouter.get('/automation/status', getAutomationStatus);
facebookRouter.post('/automation/stop', stopFacebookAutomation);
facebookRouter.post('/automation/custom', runCustomAutomation);

// Job posting automation routes
facebookRouter.post('/job-post/run', runJobPostAutomation);
facebookRouter.post('/job-post/run-all', runJobPostForAllUsers);
facebookRouter.get('/job-post/status', getJobPostStatus);
facebookRouter.post('/job-post/stop', stopJobPostAutomation);
export default facebookRouter