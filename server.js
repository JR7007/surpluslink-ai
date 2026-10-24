import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "15mb" }));

const KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.8-flash";

app.post("/api/gemini", async (req, res) => {
  if (!KEY)
    return res.status(500).json({ error: "Missing GEMINI_API_KEY on server" });

  try {
    const { contents, generationConfig } = req.body;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, generationConfig }),
    });

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the built frontend
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));
app.use((req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`),
);
