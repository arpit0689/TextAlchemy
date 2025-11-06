// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in .env. Add it and restart.");
  process.exit(1);
}

// Candidate models to try (priority order). Add/remove as needed.
const CANDIDATE_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.0"
];

let cachedModel = null; // store working model id once found

// Helper: call ListModels (v1beta then v1) and log results
async function listAvailableModels() {
  const endpoints = [
    "https://generativelanguage.googleapis.com/v1beta/models",
    "https://generativelanguage.googleapis.com/v1/models"
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(`${url}`, {
        method: "GET",
        headers: { "x-goog-api-key": API_KEY }
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data?.models || data?.model) {
          console.log(`\nℹ️ Models response from ${url}:`);
          console.log(JSON.stringify(data.models || data, null, 2));
          return data.models || data;
        }
      } catch (e) {
        console.warn(`⚠️ Non-JSON models response from ${url}:`, text.slice(0, 300));
      }
    } catch (err) {
      console.warn(`⚠️ Could not list models from ${url}:`, err.message);
    }
  }
  console.warn("⚠️ Could not fetch the list of models from v1beta or v1.");
  return null;
}

// Helper: attempt generateContent with a specific model. Returns { ok, text, raw }.
async function tryModelGenerate(modelId, prompt) {
  // v1beta endpoint is commonly used in docs; include key as query param and x-goog-api-key header
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    // optional generation config could go here
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
      timeout: 30000
    });

    const raw = await res.text();
    // log status for debugging
    console.log(`\n➡️ Tried model: ${modelId} -> status ${res.status}`);
    console.log("Raw response (first 800 chars):", raw?.slice(0, 800));

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: "Invalid JSON response", raw };
    }

    // Many Gemini responses vary in shape. Try a few known paths:
    const candidates = data?.candidates || data?.candidates;
    const alt1 = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const alt2 = data?.candidates?.[0]?.content?.[0]?.text;
    const alt3 = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const alt4 = data?.candidates?.[0]?.text;
    const alt5 = data?.output?.[0]?.content?.[0]?.text;
    const alt6 = data?.content?.[0]?.parts?.[0]?.text;
    const alt7 = data?.candidates?.[0]?.message?.content?.parts?.[0]?.text;

    const text = alt1 || alt2 || alt3 || alt4 || alt5 || alt6 || alt7 || null;

    if (res.ok && text) {
      return { ok: true, text, raw, data };
    } else {
      // If API returned an error object, include it
      if (data?.error) {
        return { ok: false, error: data.error, raw, data };
      }
      return { ok: false, error: "No text found in response", raw, data };
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Top-level function to pick a working model (tries cachedModel first, otherwise attempts candidates)
async function ensureWorkingModel(promptForTest = "Say hello") {
  if (cachedModel) return cachedModel;

  // Try candidate models in order
  for (const model of CANDIDATE_MODELS) {
    const attempt = await tryModelGenerate(model, promptForTest);
    if (attempt.ok) {
      console.log(`✅ Working model found: ${model}`);
      cachedModel = model;
      return model;
    } else {
      console.warn(`✖ Model ${model} failed:`, attempt.error || "no-text");
    }
  }

  // As last resort, try listing models and take the first gemini-like model returned (best-effort)
  const listed = await listAvailableModels();
  if (Array.isArray(listed) && listed.length > 0) {
    const geminiModel = listed.find(m => /gemini/i.test(m?.name || m?.model || m?.id || "")) || listed[0];
    if (geminiModel) {
      const id = geminiModel.name || geminiModel.model || geminiModel.id || geminiModel;
      console.warn(`⚠ Trying listed model id: ${id}`);
      const attempt2 = await tryModelGenerate(id, promptForTest);
      if (attempt2.ok) {
        cachedModel = id;
        console.log(`✅ Working model found from list: ${id}`);
        return id;
      }
    }
  }

  throw new Error("No usable Gemini model found for generateContent with this API key.");
}

// Generic wrapper to call Gemini with auto model selection
async function callGemini(prompt) {
  // Ensure there is a working model (this will try candidates and cache a working one)
  const modelId = await ensureWorkingModel(prompt);
  const result = await tryModelGenerate(modelId, prompt);
  if (result.ok) return result.text;
  throw new Error(result.error || "Gemini call failed");
}

// ROUTES

app.post("/api/humanize", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text required" });

  try {
    const prompt = `Make this text sound natural and human-like:\n\n${text}`;
    const output = await callGemini(prompt);
    return res.json({ original: text, humanized: output });
  } catch (err) {
    console.error("Error in /api/humanize:", err.message || err);
    return res.status(500).json({ error: "Gemini request failed", details: err.message || err });
  }
});

app.post("/api/summarize", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Text required" });

  try {
    const prompt = `Summarize this in 3-4 concise sentences:\n\n${text}`;
    const output = await callGemini(prompt);
    return res.json({ original: text, summary: output });
  } catch (err) {
    console.error("Error in /api/summarize:", err.message || err);
    return res.status(500).json({ error: "Gemini request failed", details: err.message || err });
  }
});

app.post("/api/tone", async (req, res) => {
  const { text, mode } = req.body;
  if (!text || !mode) return res.status(400).json({ error: "Text and mode required" });

  try {
    const tone = mode === "formal" ? "Formal" : "Casual";
    const prompt = `Rewrite the following text in a ${tone} tone:\n\n${text}`;
    const output = await callGemini(prompt);
    return res.json({ original: text, toned: output });
  } catch (err) {
    console.error("Error in /api/tone:", err.message || err);
    return res.status(500).json({ error: "Gemini request failed", details: err.message || err });
  }
});

app.get("/", (req, res) => res.send("TextAlchemy backend up"));

app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  // On startup, log available models (helpful for debugging)
  console.log("Attempting to list available models (for debugging)...");
  await listAvailableModels();
});
