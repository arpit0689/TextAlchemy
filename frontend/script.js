document.addEventListener("DOMContentLoaded", () => {
  let lastInput = "";
  let currentAction = "humanize";

  const inputField = document.getElementById("inputText");
  const outputContainer = document.getElementById("outputContainer");
  const outputText = document.getElementById("outputText");
  const loader = document.getElementById("loader");
  const charCount = document.getElementById("charCount");
  const wordCount = document.getElementById("wordCount");
  const tabButtons = document.querySelectorAll(".tab-btn");

  function updateCounts() {
    const text = inputField.value;
    charCount.textContent = text.length;
    wordCount.textContent = text.trim().split(/\s+/).filter(Boolean).length;
  }
  inputField.addEventListener("input", updateCounts);

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentAction = btn.dataset.action;
      if (inputField.value.trim()) runAI(inputField.value.trim(), currentAction);
    });
  });

  async function runAI(text, action) {
    lastInput = text;
    outputContainer.classList.remove("hidden");
    loader.classList.remove("hidden");
    outputText.style.opacity = 0;
    outputText.textContent = "";

    try {
      const payload = action === "formal" || action === "casual"
        ? { text, mode: action }
        : { text };

      const response = await fetch(`http://localhost:5000/api/${action === "formal" || action === "casual" ? "tone" : action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      outputText.textContent = data.result;
      outputText.style.opacity = 1;
    } catch (err) {
      outputText.textContent = "❌ Error: " + err.message;
      outputText.style.opacity = 1;
    } finally {
      loader.classList.add("hidden");
    }
  }

  document.getElementById("regenerateBtn").addEventListener("click", () => {
    if (!lastInput) return alert("No previous input!");
    runAI(lastInput, currentAction);
  });

  document.getElementById("copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(outputText.textContent);
      alert("✅ Copied!");
    } catch {
      alert("❌ Failed to copy.");
    }
  });

  document.getElementById("darkModeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
});
