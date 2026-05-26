import express from "express";
import { PrismaClient } from "@prisma/client";
import { authMiddleware } from "./auth.js";

const prisma = new PrismaClient();
const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  const workouts = await prisma.workout.findMany({
    where: {
      userId: req.user.userId,
    },
  });

  res.json(workouts);
});

router.post("/", async (req, res) => {
  const { name, isActive } = req.body;

  if (typeof name !== "string" || name.length === 0 || name.trim() === "") {
    return res.status(400).json({
      error: "A Schedule Name is required!",
    });
  }

  const workout = await prisma.workout.create({
    data: {
      name,
      isActive,
      user: {
        connect: {
          id: req.user.userId,
        },
      },
    },
  });

  res.status(201).json(workout);
});

router.put("/:id", async (req, res) => {
  const workout = await prisma.workout.findUnique({
    where: {
      id: parseInt(req.params.id),
    },
  });

  if (!workout || workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized!" });
  }

  const { name, isActive } = req.body;

  if (typeof name !== "string" || name.length === 0 || name.trim() === "") {
    return res.status(400).json({
      error: "Name is required!",
    });
  }

  const id = parseInt(req.params.id);
  try {
    const updatedWorkout = await prisma.workout.update({
      where: { id },
      data: {
        name,
        isActive,
      },
    });

    res.json(updatedWorkout);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        error: "Workout not found",
      });
    }

    console.log(error);
    return res.status(500).json({
      error: "Failed to update workout",
    });
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  const workout = await prisma.workout.findUnique({
    where: { id },
  });

  if (!workout || workout.userId !== req.user.userId) {
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    await prisma.exercise.deleteMany({ where: { workoutId: id } });
    await prisma.workout.delete({
      where: { id },
    });

    res.status(204).json({ message: "Workout deleted successfully" });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        error: "Workout not found",
      });
    }
    return res.status(500).json({
      error: "Failed to delete workout",
    });
  }
});

export default router;