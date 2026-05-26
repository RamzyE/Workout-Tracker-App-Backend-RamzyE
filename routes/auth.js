import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import express from "express";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const router = express.Router();
const adapter = new PrismaPg({connectionString: process.env.DATABASE_URL,});
const prisma = new PrismaClient({ adapter });

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // optional validation
    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Username, email, and password are required.",
      });
    }

    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return res.status(400).json({
        error: "Email already registered.",
      });
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      return res.status(400).json({
        error: "Username already taken.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Something went wrong during registration.",
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({
        error: "Invalid password",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      },
    );

    res.json({
      token,
      username: user.username,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Something went wrong during login.",
    });
  }
});

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Unauthenticated",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid token",
    });
  }
};

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        streak: true,
        points: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to fetch profile.",
    });
  }
});

export default router;
