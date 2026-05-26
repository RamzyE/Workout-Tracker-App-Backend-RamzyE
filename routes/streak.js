import express from "express";
import { PrismaClient } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import { authMiddleware } from "./auth.js";

const router = express.Router();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

router.use(authMiddleware);

// Get current streak + points
router.get("/", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
      select: {
        streak: true,
        points: true,
        lastCheckedIn: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch streak data",
    });
  }
});

// Daily workout check-in
router.post("/checkin", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
    });

    // Find active workout
    const activeWorkout = await prisma.workout.findFirst({
      where: {
        userId: req.user.userId,
        isActive: true,
      },
    });

    if (!activeWorkout) {
      return res.status(400).json({
        error: "No active workout",
      });
    }

    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayName = now.toLocaleDateString("en-US", {
      weekday: "long",
    });

    // Get today's exercises
    const todaysExercises = await prisma.exercise.findMany({
      where: {
        workoutId: activeWorkout.id,
        day: todayName,
      },
    });

    // Rest day if no exercises
    if (todaysExercises.length === 0) {
      return res.status(400).json({
        error: "Today is a rest day",
      });
    }

    // Check if all exercises completed
    const allCompleted = todaysExercises.every(
      (exercise) => exercise.completed,
    );

    if (!allCompleted) {
      return res.status(400).json({
        error: "Complete all exercises first",
      });
    }

    // Prevent double check-in
    if (user.lastCheckedIn) {
      const lastCheckin = new Date(user.lastCheckedIn);

      const lastCheckinDay = new Date(
        lastCheckin.getFullYear(),
        lastCheckin.getMonth(),
        lastCheckin.getDate(),
      );

      if (lastCheckinDay.getTime() === today.getTime()) {
        return res.status(400).json({
          error: "Already checked in today",
        });
      }

      // Missed a day → reset streak
      const diffDays = (today - lastCheckinDay) / (1000 * 60 * 60 * 24);

      if (diffDays > 1) {
        const resetStreak = 1;

        const pointsEarned = resetStreak * 10 + 100;

        const updatedUser = await prisma.user.update({
          where: {
            id: req.user.userId,
          },
          data: {
            streak: resetStreak,
            lastCheckedIn: now,
            points: user.points + pointsEarned,
          },
        });

        // Reset today's exercises
        await prisma.exercise.updateMany({
          where: {
            workoutId: activeWorkout.id,
            day: todayName,
          },
          data: {
            completed: false,
          },
        });

        return res.json({
          message: "Streak reset and restarted",
          streak: updatedUser.streak,
          pointsEarned,
          totalPoints: updatedUser.points,
        });
      }
    }

    // Increment streak normally
    const newStreak = user.streak + 1;

    const pointsEarned = newStreak * 10 + 100;

    const updatedUser = await prisma.user.update({
      where: {
        id: req.user.userId,
      },
      data: {
        streak: newStreak,
        lastCheckedIn: now,
        points: user.points + pointsEarned,
      },
    });

    // Reset exercises after successful check-in
    await prisma.exercise.updateMany({
      where: {
        workoutId: activeWorkout.id,
        day: todayName,
      },
      data: {
        completed: false,
      },
    });

    res.json({
      message: "Checked in successfully",
      streak: updatedUser.streak,
      pointsEarned,
      totalPoints: updatedUser.points,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to process check-in",
    });
  }
});

// Rest day
router.post("/restday", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
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

      // Missed a day before rest day
      if (diffDays > 1) {
        await prisma.user.update({
          where: {
            id: req.user.userId,
          },
          data: {
            streak: 0,
            lastCheckedIn: now,
          },
        });

        return res.json({
          message: "Streak reset due to missed day",
          streak: 0,
        });
      }
    }

    // Keep streak alive without incrementing
    await prisma.user.update({
      where: {
        id: req.user.userId,
      },
      data: {
        lastCheckedIn: now,
      },
    });

    res.json({
      message: "Rest day logged",
      streak: user.streak,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to process rest day",
    });
  }
});

// Manual reset
router.post("/reset", async (req, res) => {
  try {
    const updatedUser = await prisma.user.update({
      where: {
        id: req.user.userId,
      },
      data: {
        streak: 0,
        lastCheckedIn: null,
      },
    });

    res.json({
      message: "Streak reset",
      streak: updatedUser.streak,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to reset streak",
    });
  }
});

export default router;