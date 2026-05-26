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

const getUserWorkout = async (userId) => {
  return await prisma.workout.findFirst({
    where: { userId },
  });
};

// ==========================
// GET EXERCISES
// ==========================
router.get("/", async (req, res) => {
  try {
    const workout = await getUserWorkout(req.user.userId);

    if (!workout) {
      return res.status(404).json({ error: "Workout not found" });
    }

    const exercises = await prisma.exercise.findMany({
      where: { workoutId: workout.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      exercises,
      isActive: workout.isActive,
      workoutId: workout.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch exercises" });
  }
});

// ==========================
// TOGGLE SCHEDULE ACTIVE
// ==========================
router.put("/activate", async (req, res) => {
  try {
    const workout = await getUserWorkout(req.user.userId);

    if (!workout) {
      return res.status(404).json({ error: "Workout not found" });
    }

    const { isActive } = req.body;

    const updated = await prisma.workout.update({
      where: { id: workout.id },
      data: { isActive },
    });

    if (!isActive) {
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { streak: 0, lastCheckedIn: null },
      });
    }

    res.json({ isActive: updated.isActive });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to toggle activation" });
  }
});

// ==========================
// CREATE EXERCISE
// ==========================
router.post("/", async (req, res) => {
  try {
    const workout = await getUserWorkout(req.user.userId);

    if (!workout) {
      return res.status(404).json({ error: "Workout not found" });
    }

    if (workout.isActive) {
      return res
        .status(403)
        .json({ error: "Cannot edit active workout schedule" });
    }

    const { name, sets, reps, day, isRestDay } = req.body;

    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Exercise name is required!" });
    }

    const exercise = await prisma.exercise.create({
      data: {
        name,
        sets: parseInt(sets),
        reps: parseInt(reps),
        day,
        isRestDay: isRestDay || false,
        completed: false,
        workout: { connect: { id: workout.id } },
      },
    });

    res.status(201).json(exercise);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create exercise" });
  }
});

// ==========================
// UPDATE EXERCISE
// ==========================
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      include: { workout: true },
    });

    if (!exercise || exercise.workout.userId !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (exercise.workout.isActive) {
      return res
        .status(403)
        .json({ error: "Cannot edit active workout schedule" });
    }

    const { name, sets, reps, day, isRestDay } = req.body;

    if (typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Exercise name is required!" });
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id },
      data: {
        name,
        sets: parseInt(sets),
        reps: parseInt(reps),
        day,
        isRestDay: isRestDay || false,
      },
    });

    res.json(updatedExercise);
  } catch (error) {
    console.error(error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Exercise not found" });
    }
    res.status(500).json({ error: "Failed to update exercise" });
  }
});

// ==========================
// TOGGLE COMPLETE
// ==========================
router.patch("/:id/complete", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      include: {
        workout: {
          include: { exercises: true },
        },
      },
    });

    if (!exercise || exercise.workout.userId !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (!exercise.workout.isActive) {
      return res
        .status(400)
        .json({ error: "Workout must be active to track streak" });
    }

    const updatedExercise = await prisma.exercise.update({
      where: { id },
      data: { completed: !exercise.completed },
    });

    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });

    const todaysExercises = exercise.workout.exercises.filter(
      (e) => e.day === today && !e.isRestDay,
    );

    const completedExercises = todaysExercises.filter((e) =>
      e.id === updatedExercise.id ? updatedExercise.completed : e.completed,
    );

    const allCompleted =
      todaysExercises.length > 0 &&
      completedExercises.length === todaysExercises.length;

    if (allCompleted && updatedExercise.completed) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
      });

      const now = new Date();
      const todayDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

      let newStreak = 1;

      if (user.lastCheckedIn) {
        const lastCheck = new Date(user.lastCheckedIn);
        const lastDate = new Date(
          lastCheck.getFullYear(),
          lastCheck.getMonth(),
          lastCheck.getDate(),
        );
        const diffDays = (todayDate - lastDate) / (1000 * 60 * 60 * 24);

        if (diffDays === 0) return res.json(updatedExercise);
        if (diffDays === 1) newStreak = user.streak + 1;
        if (diffDays > 1) newStreak = 1;
      }

      const pointsEarned = newStreak * 10 + 100;

      await prisma.user.update({
        where: { id: req.user.userId },
        data: {
          streak: newStreak,
          points: user.points + pointsEarned,
          lastCheckedIn: now,
        },
      });

      // Reset today's exercises so they're fresh next time this day comes around
      await prisma.exercise.updateMany({
        where: {
          workoutId: exercise.workout.id,
          day: today,
        },
        data: { completed: false },
      });

      // Return the exercise as unchecked since it just got reset
      return res.json({ ...updatedExercise, completed: false });
    }

    res.json(updatedExercise);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to toggle exercise" });
  }
});

// ==========================
// DELETE EXERCISE
// ==========================
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      include: { workout: true },
    });

    if (!exercise || exercise.workout.userId !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (exercise.workout.isActive) {
      return res
        .status(403)
        .json({ error: "Cannot edit active workout schedule" });
    }

    await prisma.exercise.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Exercise not found" });
    }
    res.status(500).json({ error: "Failed to delete exercise" });
  }
});

export default router;
