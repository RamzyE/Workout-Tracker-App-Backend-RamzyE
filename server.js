import express from "express";

const app = express();

app.get("/hello", (req, res) => {
  res.json({ message: "Hello, world!" });
});

app.listen(8000, () => {
  console.log("Server running on http://localhost:8000/hello");
});
