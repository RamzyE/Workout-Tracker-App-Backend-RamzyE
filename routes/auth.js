import "dotenv/config"; // Loads .env file
import jwt from "jsonwebtoken"; // For JSON Tokens
import bcrypt from "bcrypt"; // For Password Encryption 
import express from "express";
import { PrismaClient } from "../generated/prisma/client.js"; // Prsima Schema
import { PrismaPg } from "@prisma/adapter-pg";

const router = express.Router();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }); // Opens PostGresSQL Connection
const prisma = new PrismaClient({ adapter });

// Resposnible for registration
router.post("/register", async (req, res) => {
  try {
    // Grab username / email / password, see if they already exist or not
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        error: "Username, email, and password are required.",
      });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return res.status(400).json({ error: "Email already registered." });
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password: hashedPassword,
      },
    });

    await prisma.workout.create({
      data: {
        name: "My Schedule",
        isActive: false,
        user: { connect: { id: user.id } },
      },
    });

    // Token Expiration when registering
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, username: user.username, email: user.email });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Something went wrong during registration." });
  }
});

// Resposnible for Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Also Expiration 
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({ token, username: user.username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong during login." });
  }
});

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Get profile + owned badges
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        username: true,
        email: true,
        streak: true,
        points: true,
        badges: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// Buy a badge
router.post("/badges/buy", authMiddleware, async (req, res) => {
  try {
    const { name, cost } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { badges: true },
    });

    // If Not enough Points
    if (user.points < cost) {
      return res.status(400).json({ error: "Not enough points" });
    }

    // Cant Buy the Same Badge Again
    const alreadyOwned = user.badges.some((b) => b.name === name);
    if (alreadyOwned) {
      return res.status(400).json({ error: "Badge already owned" });
    }

    
    await prisma.badge.create({
      data: {
        name,
        cost,
        user: { connect: { id: user.id } },
      },
    });

    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: { points: user.points - cost },
      include: { badges: true },
    });

    res.json({
      points: updatedUser.points,
      badges: updatedUser.badges,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to buy badge" });
  }
});

export default router;
