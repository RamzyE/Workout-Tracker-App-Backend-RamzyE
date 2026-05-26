import express from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "./auth.js";

const prisma = new PrismaClient();
const router = express.Router();

// Registration Feature
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return res.status(400).json({ error: "Email already registered." });
    // We send the error if the Email is not unique
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    // Save user in the database
    data: {
      email,
      password: hashedPassword,
    },
  });

  res.json({ id: user.id, email: user.email });
});

// Login Feature
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ error: "User not found" });
    // Error if they dont exist
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: "Invalid password" });
    // Incorrect Password
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
    // Send A token that will last for one hour
  });

  res.json({ token });
});

// Checking Token on Protected Routes
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
    res.status(401).json({ error: "Invalid token" });
  }
};

router.get("/profile", authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, streak: true, points: true },
  });
  res.json(user);
});

export default router;
