import express from "express";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { authMiddleware } from "./auth.js";
const router = express.Router();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

router.use(authMiddleware);

// Get current streak and points
router.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { streak: true, points: true, lastCheckedIn: true },
  });

  res.json(user);
});

// Check in for the day — called when user checks off all exercises
router.post("/checkin", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // If already checked in today, don't increment
  if (user.lastCheckedIn) {
    const lastCheckin = new Date(user.lastCheckedIn);
    const lastCheckinDay = new Date(
      lastCheckin.getFullYear(),
      lastCheckin.getMonth(),
      lastCheckin.getDate(),
    );

    if (lastCheckinDay.getTime() === today.getTime()) {
      return res.status(400).json({ error: "Already checked in today" });
    }

    // If last checkin was more than 1 day ago, reset streak
    const diffDays = (today - lastCheckinDay) / (1000 * 60 * 60 * 24);
    if (diffDays > 1) {
      const updatedUser = await prisma.user.update({
        where: { id: req.user.userId },
        data: {
          streak: 1,
          lastCheckedIn: now,
          points: user.points + 110, // streak 1 = 1 * 10 + 100
        },
      });
      return res.json({
        message: "Streak reset",
        streak: updatedUser.streak,
        points: updatedUser.points,
      });
    }
  }

  // Increment streak
  const newStreak = user.streak + 1;
  const pointsEarned = newStreak * 10 + 100;

  const updatedUser = await prisma.user.update({
    where: { id: req.user.userId },
    data: {
      streak: newStreak,
      lastCheckedIn: now,
      points: user.points + pointsEarned,
    },
  });

  res.json({
    message: "Checked in successfully",
    streak: updatedUser.streak,
    pointsEarned,
    totalPoints: updatedUser.points,
  });
});

// Rest day — doesn't increment streak but doesn't break it either
router.post("/restday", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (user.lastCheckedIn) {
    const lastCheckin = new Date(user.lastCheckedIn);
    const lastCheckinDay = new Date(
      lastCheckin.getFullYear(),
      lastCheckin.getMonth(),
      lastCheckin.getDate(),
    );

    const diffDays = (today - lastCheckinDay) / (1000 * 60 * 60 * 24);
    if (diffDays > 1) {
      // missed a day before rest day, reset streak
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { streak: 0, lastCheckedIn: now },
      });
      return res.json({ message: "Streak reset due to missed day", streak: 0 });
    }
  }

  // Just update lastCheckedIn without changing streak or points
  await prisma.user.update({
    where: { id: req.user.userId },
    data: { lastCheckedIn: now },
  });

  res.json({ message: "Rest day logged", streak: user.streak });
});

// Reset streak manually
router.post("/reset", async (req, res) => {
  const updatedUser = await prisma.user.update({
    where: { id: req.user.userId },
    data: { streak: 0, lastCheckedIn: null },
  });

  res.json({ message: "Streak reset", streak: updatedUser.streak });
});

export default router;
