import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../credentials.js";

export const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    console.log("token",token);
    
    if (!token) {
      return res
        .status(401)
        .json({ error: "Access denied. No token provided." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach decoded user to request for later use
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
