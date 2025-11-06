// script.js — robust frontend that calls http://localhost:5000
document.addEventListener("DOMContentLoaded", () => {
  // elements
  const inputText = document.getElementById("inputText");
  const charCount = document.getElementById("charCount");
  const wordCount = document.getElementById("wordCount");
  const processBtn = document.getElementById("processBtn");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const outputCard = document.getElementById("outputCard");
  const outputText = document.getElementById("outputText");
  const loader = document.getElementById("loader");
  const regenerateBtn = document.getElementById("regenerateBtn");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const status = document.getElementById("status");
  const darkModeToggle = document.getElementById("darkModeToggle");

  // initial sample text so user sees something immediately
  const SAMPLE = `Artificial intelligence has become a major driving force in nearly every industry today. From healthcare and finance to education and entertainment, AI technologies are reshaping how organizations operate and how people interact with digital systems. However, as automation and algorithms continue to advance, it’s important to maintain human creativity, empathy, and ethical judgment in decision-making processes.`;
  inputText.value = SAMPLE;
  updateCounts();

  let currentAction = "humanize";
  let lastInput = "";

  // update counts
  function updateCounts() {
    const val = inputText.value || "";
    charCount.textContent = val.length;
    const words = val.trim() ? val.trim().split(/\s+/).length : 0;
    wordCount.textContent = words;
  }

  inputText.addEventListener("input", updateCounts);

  // tabs
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentAction = btn.dataset.action;
    });
  });

  // show/hide loader helpers
  function showLoader(msg = "Processing...") {
    loader.classList.remove("hidden");
    outputText.textContent = "";
    outputCard.classList.remove("hidden");
    status.textContent = msg;
  }
  function hideLoader(successMsg = "") {
    loader.classList.add("hidden");
    status.textContent = successMsg;
  }

  // normalize various backend response shapes into text
  function extractTextFromResponse(data) {
    // check several possible fields
    if (!data) return null;
    if (typeof data === "string") return data;
    if (data.result) return data.result;
    if (data.humanized) return data.humanized;
    if (data.humanizedText) return data.humanizedText;
    if (data.summary) return data.summary;
    if (data.toned) return data.toned;
    if (data.output) return data.output;
    // sometimes backend wraps under 'candidates' etc.
    if (data.candidates && Array.isArray(data.candidates) && data.candidates[0]) {
      const c = data.candidates[0];
      // try nested paths
      const p = c?.content?.parts?.[0]?.text || c?.content?.[0]?.text || c?.text;
      if (p) return p;
    }
    // fallback to JSON string
    try { return JSON.stringify(data); } catch { return null; }
  }

  // process (calls backend)
  async function processText(action) {
    const text = (inputText.value || "").trim();
    if (!text) { alert("Please enter text to process."); return; }

    lastInput = text;
    showLoader();

    let endpoint = "/api/humanize";
    let body = { text };

    if (action === "summarize") endpoint = "/api/summarize";
    if (action === "formal" || action === "casual") {
      endpoint = "/api/tone";
      body.mode = action;
    }

    try {
      // use full url to avoid relative path issues
      const res = await fetch(`http://localhost:5000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        hideLoader();
        outputText.textContent = `⚠️ Server error: ${res.status} - ${errText}`;
        return;
      }

      const data = await res.json();
      const out = extractTextFromResponse(data);

      if (!out) {
        hideLoader();
        outputText.textContent = "⚠️ No text returned from backend. Check console/logs.";
        console.warn("Raw response:", data);
        return;
      }

      // render cleaned markdown-ish text (basic)
      const html = out
        .replace(/^### (.*$)/gim, "<h3>$1</h3>")
        .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
        .replace(/\n\n/g, "<br><br>")
        .replace(/\n/g, "<br>");

      outputText.innerHTML = html;
      hideLoader("✅ Done");
    } catch (err) {
      console.error("Fetch error:", err);
      hideLoader();
      outputText.textContent = "❌ Could not reach backend. Is it running on http://localhost:5000 ?";
    }
  }

  // click handlers
  processBtn.addEventListener("click", () => processText(currentAction));
  regenerateBtn.addEventListener("click", () => {
    if (!lastInput) { alert("No previous input to regenerate."); return; }
    inputText.value = lastInput; updateCounts();
    processText(currentAction);
  });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(outputText.innerText || outputText.textContent);
      status.textContent = "Copied to clipboard ✅";
      setTimeout(()=> status.textContent = "", 1500);
    } catch {
      alert("Copy failed");
    }
  });

  downloadBtn.addEventListener("click", () => {
    const blob = new Blob([outputText.innerText || outputText.textContent], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "textalchemy_output.txt";
    a.click();
  });

  // dark mode toggle (simple)
  darkModeToggle?.addEventListener("click", () => {
    document.documentElement.classList.toggle("dark");
  });
  

  // Immediately process sample once so user sees result quickly
  // (comment out if you don't want auto-run)
  // processText(currentAction);
});
