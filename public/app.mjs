/**
 * Hydra Multi-Model Rubberduck - Frontend JavaScript
 * Handles API key persistence, model fetching, filtering, and selection
 */

// DOM Elements
const apiKeyInput = document.getElementById("api-key");
const saveApiKeyBtn = document.getElementById("save-api-key");

const modelsContainer = document.getElementById("models-container");
const questionTextarea = document.getElementById("question");
const sendButton = document.getElementById("send-button");
const loadingIndicator = document.getElementById("loading");
const errorContainer = document.getElementById("error-container");
const errorMessage = document.getElementById("error-message");
const resultsGrid = document.getElementById("results-grid");
const resultsTitle = document.getElementById("results-title");
const resultsHeader = document.getElementById("results-header");
const resultsSection = document.getElementById("results");
const rateLimitDiv = document.getElementById("rate-limit");

// Streaming state
let streamingCards = {}; // model -> { element, markdownEl, footerEl, fullText }
let currentAbortController = null;

/**
 * Show error message in error container
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorMessage.textContent = message;
  errorContainer.classList.remove("hidden");
}

/**
 * Hide error container
 */
function hideError() {
  errorContainer.classList.add("hidden");
  errorMessage.textContent = "";
}

/**
 * Update rate limit display from response headers
 * @param {Response} response - Fetch response object
 */
function updateRateLimitDisplay(response) {
  if (!rateLimitDiv) return;
  const remaining = response.headers.get("X-RateLimit-Remaining");
  const limit = response.headers.get("X-RateLimit-Limit") || 30;
  if (remaining !== null) {
    rateLimitDiv.textContent = `Remaining requests: ${remaining}/${limit}`;
    rateLimitDiv.classList.remove("hidden");
  }
}

/**
 * Save API key to localStorage
 * @param {string} apiKey - API key to save
 */
function saveApiKey(apiKey) {
  localStorage.setItem("rubberduck_api_key", apiKey);
}

/**
 * Load API key from localStorage
 * @returns {string|null} - Stored API key or null if not found
 */
function loadApiKey() {
  return localStorage.getItem("rubberduck_api_key");
}

/**
 * Fetch models from the API
 * @param {string} apiKey - API key for authorization (optional, endpoint is public)
 * @returns {Promise<Array>} - Array of model objects
 */
async function fetchModels(apiKey) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch("/api/models", {
    method: "GET",
    headers: headers,
  });

  if (rateLimitDiv) {
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const limit = response.headers.get("X-RateLimit-Limit") || 30;
    if (remaining !== null) {
      rateLimitDiv.textContent = `Remaining requests: ${remaining}/${limit}`;
      rateLimitDiv.classList.remove("hidden");
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.models || [];
}

/**
 * Render model checkboxes
 * Only chat models are shown.
 * @param {Array} models - Array of model objects
 */
function renderModels(models) {
  hideError();

  // Only show chat models
  const filteredModels = Array.isArray(models)
    ? models.filter((model) => model.mode === "chat")
    : [];

  modelsContainer.innerHTML = "";

  // Select All checkbox — styled as Regolo pill
  const selectAllWrapper = document.createElement("div");
  selectAllWrapper.className =
    "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-green-400/40 bg-green-400/10 cursor-pointer hover:border-green-400 hover:bg-green-400/20 transition-colors duration-150 select-all-wrapper";

  const selectAllCheckbox = document.createElement("input");
  selectAllCheckbox.type = "checkbox";
  selectAllCheckbox.id = "select-all-models";
  selectAllCheckbox.name = "select-all";
  selectAllCheckbox.value = "select-all";
  selectAllCheckbox.className = "w-4 h-4 cursor-pointer";

  const selectAllLabel = document.createElement("label");
  selectAllLabel.htmlFor = "select-all-models";
  selectAllLabel.className =
    "text-sm font-semibold text-green-400 cursor-pointer select-none";
  selectAllLabel.textContent = "Select all";

  selectAllWrapper.appendChild(selectAllCheckbox);
  selectAllWrapper.appendChild(selectAllLabel);
  modelsContainer.appendChild(selectAllWrapper);

  selectAllCheckbox.addEventListener("change", (e) => {
    const modelCheckboxes = modelsContainer.querySelectorAll(
      '.model-checkbox input[type="checkbox"]',
    );
    modelCheckboxes.forEach((checkbox) => {
      checkbox.checked = e.target.checked;
      // Update visual state
      const wrapper = checkbox.closest(".model-checkbox");
      if (e.target.checked) {
        wrapper.classList.add("border-green-400/60", "bg-green-400/10");
        wrapper.classList.remove("border-slate-800/80", "bg-slate-950/95");
      } else {
        wrapper.classList.remove("border-green-400/60", "bg-green-400/10");
        wrapper.classList.add("border-slate-800/80", "bg-slate-950/95");
      }
    });
  });

  // Create checkbox for each filtered model — Regolo card style
  filteredModels.forEach((model, index) => {
    const wrapper = document.createElement("div");
    wrapper.className =
      "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800/80 bg-slate-950/95 cursor-pointer hover:border-green-400/60 hover:bg-green-400/10 transition-all duration-200 model-checkbox";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `model-${index}`;
    checkbox.name = "models";
    checkbox.value = model.id || model.name || `model-${index}`;
    checkbox.className = "w-4 h-4 cursor-pointer";

    const label = document.createElement("label");
    label.htmlFor = `model-${index}`;
    label.className =
      "text-sm font-medium text-slate-300 cursor-pointer select-none";
    label.textContent = model.name || model.id || `Model ${index + 1}`;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    modelsContainer.appendChild(wrapper);

    // Toggle visual state on individual check
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        wrapper.classList.add("border-green-400/60", "bg-green-400/10");
        wrapper.classList.remove("border-slate-800/80", "bg-slate-950/95");
      } else {
        wrapper.classList.remove("border-green-400/60", "bg-green-400/10");
        wrapper.classList.add("border-slate-800/80", "bg-slate-950/95");
      }
    });
  });

  // Update Select All when individual checkboxes change
  const modelCheckboxes = modelsContainer.querySelectorAll(
    '.model-checkbox input[type="checkbox"]',
  );
  modelCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const allChecked = Array.from(modelCheckboxes).every((cb) => cb.checked);
      const someChecked = Array.from(modelCheckboxes).some((cb) => cb.checked);
      selectAllCheckbox.checked = allChecked;
      selectAllCheckbox.indeterminate = someChecked && !allChecked;
    });
  });

  if (filteredModels.length === 0) {
    const noModelsMessage = document.createElement("p");
    noModelsMessage.className = "text-sm text-slate-400 py-2";
    noModelsMessage.textContent = "No models found for the selected filter.";
    modelsContainer.appendChild(noModelsMessage);
  }
}

/**
 * Get selected models from checkboxes
 * @returns {string[]} - Array of selected model IDs
 */
function getSelectedModels() {
  const checkboxes = modelsContainer.querySelectorAll(
    '.model-checkbox input[type="checkbox"]:checked',
  );
  return Array.from(checkboxes).map((cb) => cb.value);
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text safe for rendering
 */
function escapeHtml(text) {
  if (typeof text !== "string") return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Convert markdown to HTML
 * Simple implementation for basic markdown formatting
 * @param {string} markdown - Markdown text to convert
 * @returns {string} - HTML string
 */
function markdownToHtml(markdown) {
  let html = markdown;

  // Code blocks (``` ... ```)
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings (# through ######)
  html = html.replace(/^###### (.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^##### (.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Unordered lists (- or * )
  html = html.replace(/^[*\-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Ordered lists (1. 2. 3. )
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Blockquotes (> )
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr>");

  // Paragraphs - wrap double newlines
  html = html
    .split("\n\n")
    .map((block) => {
      return block
        .replace(/^/gm, "")
        .replace(/<h[1-6]|<pre|<ul|<ol|<blockquote|<hr/gi, "\n$&")
        .replace(/<\/h[1-6]|<\/pre|<\/ul|<\/ol|<\/blockquote|<\/hr/gi, "$&\n");
    })
    .join("<p>");

  return html;
}

/**
 * Show loading indicator and disable send button
 */
function showLoading() {
  if (loadingIndicator) {
    loadingIndicator.classList.remove("hidden");
  }
  if (sendButton) {
    sendButton.disabled = true;
  }
  hideError();
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  if (loadingIndicator) {
    loadingIndicator.classList.add("hidden");
  }
  if (sendButton) {
    sendButton.disabled = false;
  }
}

/**
 * Initialize streaming results: create empty cards for each model
 * @param {string[]} modelNames - Array of model names
 */
function initStreamingResults(modelNames) {
  resultsGrid.innerHTML = "";
  streamingCards = {};

  const section = document.getElementById("results");
  const header = document.getElementById("results-header");
  const title = document.getElementById("results-title");

  if (section) section.classList.remove("hidden");
  if (header) header.classList.remove("hidden");
  if (title) title.classList.remove("hidden");
  resultsGrid.classList.remove("hidden");

  // Hide the empty-state placeholder
  const placeholder = document.getElementById("results-placeholder");
  if (placeholder) placeholder.classList.add("hidden");

  modelNames.forEach((model) => {
    const cardInfo = createStreamingCard(model);
    streamingCards[model] = cardInfo;
    resultsGrid.appendChild(cardInfo.element);
  });
}

/**
 * Create a single streaming result card for a model
 * @param {string} model - Model name
 * @returns {{ element: HTMLElement, markdownEl: HTMLElement, footerEl: HTMLElement, fullText: string }}
 */
function createStreamingCard(model) {
  const card = document.createElement("div");
  card.className =
    "rounded-xl border border-white/60 p-6 shadow-[0_0_0_1px_rgba(15,23,42,1),0_20px_60px_rgba(0,0,0,0.9)] hover:shadow-[0_0_0_1px_rgba(21,128,61,0.85),0_0px_28px_rgba(22,163,74,0.9)] transition-all duration-200 overflow-hidden min-w-0";

  const modelNameEl = document.createElement("h3");
  modelNameEl.className = "text-base font-semibold text-green-400 mb-3";
  modelNameEl.textContent = model;

  const contentWrapper = document.createElement("div");
  contentWrapper.className = "mb-4";

  // Reasoning section (collapsible, initially hidden)
  const reasoningWrapper = document.createElement("div");
  reasoningWrapper.className = "hidden mb-3";

  const reasoningToggle = document.createElement("button");
  reasoningToggle.className =
    "flex items-center gap-2 text-xs text-yellow-400/80 hover:text-yellow-300 cursor-pointer mb-2";
  reasoningToggle.innerHTML =
    '<svg class="w-3.5 h-3.5 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> Thinking process';

  const reasoningEl = document.createElement("div");
  reasoningEl.className =
    "text-xs leading-relaxed text-yellow-200/60 max-h-[200px] overflow-y-auto p-3 bg-yellow-900/10 rounded-lg border border-yellow-500/10 font-mono italic";
  reasoningEl.style.display = "none";

  reasoningToggle.addEventListener("click", () => {
    const isOpen = reasoningEl.style.display !== "none";
    reasoningEl.style.display = isOpen ? "none" : "block";
    reasoningToggle.querySelector("svg").style.transform = isOpen
      ? ""
      : "rotate(180deg)";
  });

  reasoningWrapper.appendChild(reasoningToggle);
  reasoningWrapper.appendChild(reasoningEl);

  // Main content area
  const markdownEl = document.createElement("div");
  markdownEl.className =
    "markdown-content text-sm leading-relaxed text-gray-200 max-h-[400px] overflow-y-auto p-4 bg-[#0d1117] rounded-xl border border-white/10 font-mono text-xs sm:text-sm";
  markdownEl.innerHTML = '<span class="animate-pulse text-green-400">▌</span>';

  contentWrapper.appendChild(reasoningWrapper);
  contentWrapper.appendChild(markdownEl);

  const footerEl = document.createElement("div");
  footerEl.className =
    "flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-800/80";
  footerEl.innerHTML =
    '<span class="text-xs text-slate-400 status-label">Waiting...</span><span class="text-xs text-slate-400"></span>';

  card.appendChild(modelNameEl);
  card.appendChild(contentWrapper);
  card.appendChild(footerEl);

  return {
    element: card,
    markdownEl,
    reasoningEl,
    reasoningWrapper,
    reasoningToggle,
    footerEl,
    fullText: "",
    reasoningText: "",
  };
}

/**
 * Append a reasoning chunk to a model's card (thinking process from reasoning models)
 * @param {string} model - Model name
 * @param {string} content - Reasoning text chunk
 */
function appendReasoningChunk(model, content) {
  const card = streamingCards[model];
  if (!card) return;

  card.reasoningText += content;

  // Show the reasoning section on first chunk
  card.reasoningWrapper.classList.remove("hidden");
  card.reasoningToggle.innerHTML =
    '<svg class="w-3.5 h-3.5 transition-transform duration-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> Thinking process';

  card.reasoningEl.textContent = card.reasoningText;
  card.reasoningEl.scrollTop = card.reasoningEl.scrollHeight;

  // Update status to Thinking...
  const statusLabel = card.footerEl.querySelector(".status-label");
  if (statusLabel) statusLabel.textContent = "Thinking...";
}

/**
 * Append a streaming text chunk to a model's card
 * @param {string} model - Model name
 * @param {string} content - Text chunk to append
 */
function appendStreamChunk(model, content) {
  const card = streamingCards[model];
  if (!card) return;

  // Update status to Streaming...
  const statusLabel = card.footerEl.querySelector(".status-label");
  if (statusLabel) statusLabel.textContent = "Streaming...";

  card.fullText += content;
  card.markdownEl.innerHTML =
    markdownToHtml(card.fullText) +
    '<span class="animate-pulse text-green-400">▌</span>';
  card.markdownEl.scrollTop = card.markdownEl.scrollHeight;
}

/**
 * Finalize a model's streaming card with usage info
 * @param {string} model - Model name
 * @param {{prompt: number, completion: number, total: number}} tokens - Token usage
 * @param {number} durationMs - Total duration in ms
 * @param {number} ttft - Time to first token in ms
 */
function finalizeStreamCard(model, tokens, durationMs, ttft) {
  const card = streamingCards[model];
  if (!card) return;

  // Final markdown render without blinking cursor
  card.markdownEl.innerHTML = markdownToHtml(card.fullText);

  // Collapse reasoning section if present
  if (card.reasoningText) {
    card.reasoningEl.style.display = "none";
    card.reasoningToggle.querySelector("svg").style.transform = "";
  }

  const promptTokens = tokens.prompt || 0;
  const completionTokens = tokens.completion || 0;
  const totalTokens = tokens.total || 0;
  const totalTime = (durationMs / 1000).toFixed(2);
  const ttftStr = ttft ? `${ttft}ms` : "";

  card.footerEl.innerHTML = `
    <span class="text-xs text-slate-400">Prompt: ${promptTokens} | Completion: ${completionTokens} | Total: ${totalTokens}</span>
    <span class="text-xs text-slate-400">Duration: ${totalTime}s ${ttftStr ? "| TTFT: " + ttftStr : ""}</span>
  `;
}

/**
 * Show an error state on a model's streaming card
 * @param {string} model - Model name
 * @param {string} error - Error message
 */
function setStreamCardError(model, error) {
  const card = streamingCards[model];
  if (!card) return;

  const contentWrapper = card.markdownEl.parentElement;
  contentWrapper.innerHTML = `
    <div class="flex items-start gap-3 p-4 rounded-xl border border-red-500/50 bg-red-500/10 text-red-400 text-sm">
      <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <p class="flex-1 m-0">${escapeHtml(error)}</p>
    </div>
  `;
  card.footerEl.innerHTML =
    '<span class="text-xs text-slate-400">Failed</span>';
}

/**
 * Send query to the API via streaming
 * Collects API key, selected models, and question, then POSTs to /api/chat/stream
 */
async function sendQuery() {
  const apiKey = apiKeyInput.value.trim() || loadApiKey();
  if (!apiKey) {
    showError("Please enter an API key");
    return;
  }

  const selectedModels = getSelectedModels();
  if (selectedModels.length === 0) {
    showError("Please select at least one model");
    return;
  }

  let question = questionTextarea.value.trim();
  if (!question) {
    showError("Please enter a question");
    return;
  }

  // Abort previous stream if still active
  if (currentAbortController) {
    currentAbortController.abort();
  }
  const myController = new AbortController();
  currentAbortController = myController;

  showLoading();

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apiKey,
        models: selectedModels,
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
      }),
      signal: myController.signal,
    });

    updateRateLimitDisplay(response);

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After") || 60;
      const minutes = Math.ceil(retryAfter / 60);
      showError(`Too many requests, try again in ${minutes} minutes`);
      hideLoading();
      return;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      showError(errorData.error || `Error: ${response.status}`);
      hideLoading();
      return;
    }

    // Read SSE stream from the server
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let invalidApiKey = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split by double newline (SSE event separator)
      const events = buffer.split("\n\n");
      buffer = events.pop(); // Keep potentially incomplete event

      for (const eventStr of events) {
        if (!eventStr.trim()) continue;

        let eventType = null;
        let eventData = null;

        for (const line of eventStr.split("\n")) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6).trim();
          }
        }

        if (!eventType || !eventData) continue;

        try {
          const data = JSON.parse(eventData);

          switch (eventType) {
            case "init":
              hideLoading();
              initStreamingResults(data.models);
              break;
            case "reasoning":
              if (!invalidApiKey) {
                appendReasoningChunk(data.model, data.content);
              }
              break;
            case "chunk":
              if (!invalidApiKey) {
                appendStreamChunk(data.model, data.content);
              }
              break;
            case "usage":
              finalizeStreamCard(
                data.model,
                data.tokens,
                data.duration_ms,
                data.ttft,
              );
              break;
            case "error":
              if (data.error && data.error.includes("Invalid API key")) {
                showError(
                  "Invalid API key. Please check your API key and try again.",
                );
                invalidApiKey = true;
              } else {
                setStreamCardError(data.model, data.error);
              }
              break;
            case "done":
              break;
          }
        } catch (e) {
          // Skip unparseable events
        }
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      // Stream was aborted (user sent a new query)
      return;
    }
    if (err.name === "TypeError" && err.message.includes("Failed to fetch")) {
      showError("Connection error");
    } else {
      showError(err.message || "Unknown error");
    }
  } finally {
    // Only update UI if this is still the active stream
    if (currentAbortController === myController) {
      hideLoading();
      currentAbortController = null;
    }
  }
}

/**
 * Render results to the results grid
 * Uses Regolo design system card patterns
 */
function renderResults(results) {
  if (!resultsGrid) return;

  const resultsTitle = document.getElementById("results-title");
  const resultsHeader = document.getElementById("results-header");
  const resultsSection = document.getElementById("results");

  if (!resultsHeader || !resultsTitle) {
    return;
  }

  if (resultsSection) {
    resultsSection.classList.remove("hidden");
  }
  if (resultsHeader && resultsTitle) {
    resultsHeader.classList.remove("hidden");
    resultsTitle.classList.remove("hidden");
  }
  resultsGrid.classList.remove("hidden");

  resultsGrid.innerHTML = "";

  let firstTokenTime = null;
  let totalTime = 0;

  results.forEach((result) => {
    const card = document.createElement("div");
    card.className =
      "rounded-xl border border-white/60 p-6 shadow-[0_0_0_1px_rgba(15,23,42,1),0_20px_60px_rgba(0,0,0,0.9)] hover:shadow-[0_0_0_1px_rgba(21,128,61,0.85),0_0px_28px_rgba(22,163,74,0.9)] transition-all duration-200 overflow-hidden min-w-0";

    const modelName = escapeHtml(result.model || "Unknown Model");
    const hasError = result.error && result.error.length > 0;

    let contentHtml = "";

    if (hasError) {
      contentHtml = `
        <div class="flex items-start gap-3 p-4 rounded-xl border border-red-500/50 bg-red-500/10 text-red-400 text-sm">
          <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p class="flex-1 m-0">${escapeHtml(result.error)}</p>
        </div>
      `;
    } else {
      const cleanedResponse = result.response.replace(/^\s+|\s+$/g, "");
      const markdownHtml = markdownToHtml(cleanedResponse);

      contentHtml = `
        <div class="mb-4">
          <div class="markdown-content text-sm leading-relaxed text-gray-200 max-h-[400px] overflow-y-auto p-4 bg-[#0d1117] rounded-xl border border-white/10 font-mono text-xs sm:text-sm">${markdownHtml}</div>
        </div>
      `;
    }

    if (result.time_to_first_token !== undefined) {
      firstTokenTime = `${result.time_to_first_token}ms`;
      totalTime = result.duration_ms
        ? (result.duration_ms / 1000).toFixed(2)
        : "0.00";
    }

    const tokens = result.tokens || {};
    const promptTokens = tokens.prompt || 0;
    const completionTokens = tokens.completion || 0;
    const totalTokens = tokens.total || 0;

    card.innerHTML = `
      <h3 class="text-base font-semibold text-green-400 mb-3">${modelName}</h3>
      ${contentHtml}
      <div class="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-800/80">
        <span class="text-xs text-slate-400">Prompt: ${promptTokens} | Completion: ${completionTokens} | Total: ${totalTokens}</span>
        <span class="text-xs text-slate-400">Duration: ${totalTime}s ${firstTokenTime ? `| TTFT: ${firstTokenTime}` : ""}</span>
      </div>
    `;

    resultsGrid.appendChild(card);
  });
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Save API key button
  saveApiKeyBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showError("Please enter a valid API key.");
      return;
    }

    hideError();
    saveApiKey(apiKey);
  });

  // Allow Enter key in API key input
  apiKeyInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        saveApiKey(apiKey);
        const models = await fetchModels(apiKey);
        renderModels(models);
      }
    }
  });

  // Question textarea - handle Ctrl+Enter to send
  if (questionTextarea) {
    questionTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        sendQuery();
      }
    });
  }

  // Send button
  if (sendButton) {
    sendButton.addEventListener("click", sendQuery);
  }
}

/**
 * Initialize app on page load
 */
async function init() {
  initEventListeners();

  try {
    const models = await fetchModels();
    if (models && Array.isArray(models)) {
      renderModels(models);
    } else {
      console.error("Invalid models data received:", models);
    }
  } catch (error) {
    console.error("Failed to load models:", error);
  }

  const savedApiKey = loadApiKey();

  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Export functions for testing (if needed)
export {
  fetchModels,
  renderModels,
  saveApiKey,
  loadApiKey,
  showError,
  hideError,
  getSelectedModels,
  escapeHtml,
  showLoading,
  hideLoading,
  sendQuery,
};
