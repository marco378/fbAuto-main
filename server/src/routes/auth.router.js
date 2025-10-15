import express from 'express'
import { login, logout, profile, register } from '../controllers/auth.controller.js'
import { verifyToken } from '../middlewares/auth.middleware.js'

const authRouter = express.Router()

authRouter.post("/register", register)
authRouter.post("/login", login)
authRouter.post("/logout", logout)

authRouter.get("/profile", verifyToken, profile)

authRouter.get("/cookie", (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(404).json({ error: "No cookie found" });
  }
  res.json({ token });
});

export default authRouter