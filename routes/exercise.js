import express from "express";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { authMiddleware } from "./auth.js";
const router = express.Router();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

router.use(authMiddleware);

// Get Section
router.get("/:workoutId", async (req, res) => {
  const workoutId = parseInt(req.params.workoutId);

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
  });

  if (!workout || workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const exercises = await prisma.exercise.findMany({
    where: { workoutId },
  });

  res.json(exercises);
});

// Post Section
router.post("/:workoutId", async (req, res) => {
  const workoutId = parseInt(req.params.workoutId);
  const { name, sets, reps, day, isRestDay } = req.body;

  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
  });

  if (!workout || workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  if (typeof name !== "string" || name.length === 0 || name.trim() === "") {
    return res.status(400).json({ error: "Exercise name is required!" });
  }

  const exercise = await prisma.exercise.create({
    data: {
      name,
      sets: parseInt(sets),
      reps: parseInt(reps),
      day,
      isRestDay: isRestDay || false,
      workout: {
        connect: { id: workoutId },
      },
    },
  });

  res.status(201).json(exercise);
});

// Put Section
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: { workout: true },
  });

  if (!exercise || exercise.workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  const { name, sets, reps, day, isRestDay } = req.body;

  if (typeof name !== "string" || name.length === 0 || name.trim() === "") {
    return res.status(400).json({ error: "Exercise name is required!" });
  }

  try {
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
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Exercise not found" });
    }
    return res.status(500).json({ error: "Failed to update exercise" });
  }
});

// Patch Section
router.patch("/:id/complete", async (req, res) => {
  const id = parseInt(req.params.id);

  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: { workout: true },
  });

  if (!exercise || exercise.workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    const updatedExercise = await prisma.exercise.update({
      where: { id },
      data: {
        completed: !exercise.completed,
      },
    });

    res.json(updatedExercise);
  } catch (error) {
    return res.status(500).json({ error: "Failed to toggle exercise" });
  }
});

// Delete Section
router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: { workout: true },
  });

  if (!exercise || exercise.workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    await prisma.exercise.delete({
      where: { id },
    });

    res.status(204).json({ message: "Exercise deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Exercise not found" });
    }
    return res.status(500).json({ error: "Failed to delete exercise" });
  }
});

export default router;
