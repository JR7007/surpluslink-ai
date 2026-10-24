import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import express from "express";

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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Gemini proxy server running on port ${PORT}`),
);
