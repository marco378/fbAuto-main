import express from 'express'
import { deleteCandidate, getCandidates } from '../controllers/candidate.controllers.js';

const candidateRouter = express.Router()

candidateRouter.get("/", getCandidates);

candidateRouter.delete("/:id", deleteCandidate);

export default candidateRouter