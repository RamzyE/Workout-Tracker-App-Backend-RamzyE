import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
  }),
);

app.use("/auth", authRouter);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
