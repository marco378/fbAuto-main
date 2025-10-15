import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET, NODE_ENV } from "../credentials.js";
import { decrypt } from "../lib/encrypt.js";

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassowrd = await bcrypt.hash(password, 10);

    const oldUser = await prisma.user.findUnique({
      where: { email },
    });

    if (oldUser) {
      res.status(400).json({ message: "User already exists" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassowrd,
      },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      message: "User created successfully",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login Successfull",
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });

  res.json({ message: "Logged out succesfully" });
};

export const profile = async (req, res) => {
  try {
    const userId = req.user.userId;

    // First, fetch the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, email: true }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Then, fetch Facebook credentials separately
    const credentials = await prisma.facebookCredentials.findUnique({
      where: { userId },
      select: { email: true, password: true }
    });

    res.json({
      username: user.username,
      email: user.email,
      facebookCredentials: credentials
        ? {
            email: credentials.email,
            password: decrypt(credentials.password)
          }
        : null,
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: error.message });
  }
};
