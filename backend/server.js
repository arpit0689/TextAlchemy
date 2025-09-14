import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// List of models to try in order
const GEMINI_MODELS = [
  "gemini-pro:generateContent",
  "gemini-1.5-flash:generateContent"
];

async function callGeminiAPI(prompt) {
  for (let model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${GEMINI_API_KEY}`;
    const body = { contents: [{ parts: [{ text: prompt }] }] };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const raw = await response.text();

      if (!response.ok) {
        console.error(`❌ Gemini API Raw Response (model: ${model}):`, raw);
        continue; // try next model
      }

      const data = JSON.parse(raw);
      const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (result) return result;

    } catch (err) {
      console.error(`❌ Network/Error with model ${model}:`, err);
      continue; // try next model
    }
  }

  throw new Error(
    "All Gemini models failed or returned no result. Check your API key and internet connection."
  );
}

// ------------------ Routes ------------------

app.post("/api/humanize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const result = await callGeminiAPI(
      `Paraphrase this text to sound natural:\n${text}`
    );
    res.json({ result });
  } catch (error) {
    console.error("Humanize Error:", error);
    res.status(500).json({ error: "Error contacting Gemini API" });
  }
});

app.post("/api/summarize", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const result = await callGeminiAPI(
      `Summarize this text in 3-4 concise sentences:\n${text}`
    );
    res.json({ result });
  } catch (error) {
    console.error("Summarize Error:", error);
    res.status(500).json({ error: "Error contacting Gemini API" });
  }
});

app.post("/api/tone", async (req, res) => {
  try {
    const { text, mode } = req.body;
    if (!text || !mode)
      return res.status(400).json({ error: "Text and mode required" });

    const tone = mode === "formal" ? "formal" : "casual";
    const result = await callGeminiAPI(
      `Rewrite this text in a ${tone} tone:\n${text}`
    );
    res.json({ result });
  } catch (error) {
    console.error("Tone Error:", error);
    res.status(500).json({ error: "Error contacting Gemini API" });
  }
});

// ------------------ Start Server ------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Gemini Humanizer API running on port ${PORT}`)
);
