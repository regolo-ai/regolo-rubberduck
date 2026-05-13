/**
 * Hydra Multi-Model Rubberduck - Frontend JavaScript
 * Handles API key persistence, model fetching, filtering, and selection
 */

// DOM Elements
const apiKeyInput = document.getElementById('api-key');
const saveApiKeyBtn = document.getElementById('save-api-key');
const modelTypeSelect = document.getElementById('model-type');
const modelsContainer = document.getElementById('models-container');
const questionTextarea = document.getElementById('question');
const sendButton = document.getElementById('send-button');
const loadingIndicator = document.getElementById('loading');
const errorContainer = document.getElementById('error-container');
const errorMessage = document.getElementById('error-message');
const resultsGrid = document.getElementById('results-grid');
const resultsTitle = document.getElementById('results-title');
const resultsHeader = document.getElementById('results-header');
const resultsSection = document.getElementById('results');
const rateLimitDiv = document.getElementById('rate-limit');

/**
 * Show error message in error container
 * @param {string} message - Error message to display
 */
function showError(message) {
  errorMessage.textContent = message;
  errorContainer.hidden = false;
}

/**
 * Hide error container
 */
function hideError() {
  errorContainer.hidden = true;
  errorMessage.textContent = '';
}

/**
 * Update rate limit display from response headers
 * @param {Response} response - Fetch response object
 */
function updateRateLimitDisplay(response) {
  if (!rateLimitDiv) return;
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const limit = response.headers.get('X-RateLimit-Limit') || 30;
  if (remaining !== null) {
    rateLimitDiv.textContent = `Remaining requests: ${remaining}/${limit}`;
  }
}

/**
 * Save API key to localStorage
 * @param {string} apiKey - API key to save
 */
function saveApiKey(apiKey) {
  localStorage.setItem('rubberduck_api_key', apiKey);
}

/**
 * Load API key from localStorage
 * @returns {string|null} - Stored API key or null if not found
 */
function loadApiKey() {
  return localStorage.getItem('rubberduck_api_key');
}

/**
 * Fetch models from the API
 * @param {string} apiKey - API key for authorization (optional, endpoint is public)
 * @returns {Promise<Array>} - Array of model objects
 */
async function fetchModels(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // Add Authorization header only if API key is provided
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  const response = await fetch('/api/models', {
    method: 'GET',
    headers: headers
  });
  
  // Update rate limit display from response headers
  if (rateLimitDiv) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const limit = response.headers.get('X-RateLimit-Limit') || 30;
    if (remaining !== null) {
      rateLimitDiv.textContent = `Remaining requests: ${remaining}/${limit}`;
    }
  }
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.models || [];
}

/**
 * Filter models by mode/type
 * @param {Array} models - Array of model objects
 * @param {string} modeFilter - Filter mode (chat, completion, embedding)
 * @returns {Array} - Filtered models
 */
function filterModels(models, modeFilter) {
  if (!modeFilter || modeFilter === 'all') {
    return models;
  }
  // Ensure models is an array
  if (!Array.isArray(models)) {
    return [];
  }
  return models.filter(model => model.mode === modeFilter);
}

/**
 * Render model checkboxes
 * @param {Array} models - Array of model objects
 * @param {string} modeFilter - Current filter mode
 */
function renderModels(models, modeFilter) {
  hideError();
  
  const filteredModels = filterModels(models, modeFilter);
  
  // Clear existing checkboxes
  modelsContainer.innerHTML = '';
  
  // Create Select All checkbox
  const selectAllWrapper = document.createElement('div');
  selectAllWrapper.className = 'checkbox-item select-all-wrapper';
  
  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.id = 'select-all-models';
  selectAllCheckbox.name = 'select-all';
  selectAllCheckbox.value = 'select-all';
  
  const selectAllLabel = document.createElement('label');
  selectAllLabel.htmlFor = 'select-all-models';
  selectAllLabel.textContent = 'Select all';
  
  selectAllWrapper.appendChild(selectAllCheckbox);
  selectAllWrapper.appendChild(selectAllLabel);
  modelsContainer.appendChild(selectAllWrapper);
  
  // Handle Select All toggle
  selectAllCheckbox.addEventListener('change', (e) => {
    const modelCheckboxes = modelsContainer.querySelectorAll('.model-checkbox input[type="checkbox"]');
    modelCheckboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
    });
  });
  
  // Create checkbox for each filtered model
  filteredModels.forEach((model, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'checkbox-item model-checkbox';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `model-${index}`;
    checkbox.name = 'models';
    checkbox.value = model.id || model.name || `model-${index}`;
    
    const label = document.createElement('label');
    label.htmlFor = `model-${index}`;
    label.textContent = model.name || model.id || `Model ${index + 1}`;
    
    // Add mode indicator if available
    if (model.mode) {
      label.textContent += ` (${model.mode})`;
    }
    
    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    modelsContainer.appendChild(wrapper);
  });
  
  // Update Select All when individual checkboxes change
  const modelCheckboxes = modelsContainer.querySelectorAll('.model-checkbox input[type="checkbox"]');
  modelCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const allChecked = Array.from(modelCheckboxes).every(cb => cb.checked);
      const someChecked = Array.from(modelCheckboxes).some(cb => cb.checked);
      selectAllCheckbox.checked = allChecked;
      selectAllCheckbox.indeterminate = someChecked && !allChecked;
    });
  });
  
  // Show message if no models match filter
  if (filteredModels.length === 0) {
    const noModelsMessage = document.createElement('p');
    noModelsMessage.className = 'no-models-message';
    noModelsMessage.textContent = 'No models found for the selected filter.';
    modelsContainer.appendChild(noModelsMessage);
  }
}

/**
 * Get selected models from checkboxes
 * @returns {string[]} - Array of selected model IDs
 */
function getSelectedModels() {
  const checkboxes = modelsContainer.querySelectorAll('.model-checkbox input[type="checkbox"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - Escaped text safe for rendering
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
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
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code (`code`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Headings (# through ######)
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Bold (**text** or __text__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  
  // Italic (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  
  // Images ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  
  // Unordered lists (- or * )
  html = html.replace(/^[*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Ordered lists (1. 2. 3. )
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // (Already handled by ul pattern above)
  
  // Blockquotes (> )
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');
  
  // Paragraphs - wrap double newlines
  html = html.split('\n\n').map(block => {
    return block.replace(/^/gm, '').replace(/<h[1-6]|<pre|<ul|<ol|<blockquote|<hr/ig, '\n$&').replace(/<\/h[1-6]|<\/pre|<\/ul|<\/ol|<\/blockquote|<\/hr/ig, '$&\n');
  }).join('<p>');
  
  return html;
}

/**
 * Show loading indicator and disable send button
 */
function showLoading() {
  if (loadingIndicator) {
    loadingIndicator.hidden = false;
  }
  hideError();
}

/**
 * Hide loading indicator
 */
function hideLoading() {
  if (loadingIndicator) {
    loadingIndicator.hidden = true;
  }
}

/**
 * Send query to the API
 * Collects API key, selected models, and question, then POSTs to /api/chat
 */
async function sendQuery() {
  // Validation: get API key
  const apiKey = apiKeyInput.value.trim() || loadApiKey();
  if (!apiKey) {
    showError('Please enter an API key');
    return;
  }
  
  // Validation: get selected models
  const selectedModels = getSelectedModels();
  if (selectedModels.length === 0) {
    showError('Please select at least one model');
    return;
  }
  
  // Validation: get question
  let question = questionTextarea.value.trim();
  if (!question) {
    showError('Please enter a question');
    return;
  }

  // Show loading state
  showLoading();
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey,
        models: selectedModels,
        messages: [
          {
            role: 'user',
            content: question
          }
        ]
      })
    });

    updateRateLimitDisplay(response);

    // Handle rate limit (429)
    if (response.status === 429) {
      // Try to get retry-after header, otherwise default to 1 minute
      const retryAfter = response.headers.get('Retry-After') || 60;
      const minutes = Math.ceil(retryAfter / 60);
      showError(`Too many requests, try again in ${minutes} minutes`);
      hideLoading();
      return;
    }
    
    // Handle other HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      showError(errorData.error || `Error: ${response.status}`);
      hideLoading();
      return;
    }
    
    // Parse and display results
    const data = await response.json();
    
    if (data.results && Array.isArray(data.results)) {
      // Check for API errors in results
      const apiErrors = data.results.filter(r => r.error && r.error.includes('Invalid API key'));
      if (apiErrors.length > 0) {
        showError('Invalid API key. Please check your API key and try again.');
        hideLoading();
        return;
      }
      renderResults(data.results);
    } else {
      showError('Invalid response from server');
    }
    
  } catch (err) {
    // Handle network errors
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      showError('Connection error');
    } else {
      showError(err.message || 'Unknown error');
    }
  } finally {
    // Hide loading and re-enable button
    hideLoading();
  }
}

/**
 * Render results to the results grid
 * Swaps out the entire grid and header section
 */
function renderResults(results) {
  if (!resultsGrid) return;
  
  const resultsTitle = document.getElementById('results-title');
  const resultsHeader = document.getElementById('results-header');
  const resultsSection = document.getElementById('results');
  
  if (!resultsHeader || !resultsTitle) {
    return;
  }
  
  // Show results section, header and grid (ensure they're all visible)
  if (resultsSection) {
    resultsSection.classList.remove('hidden');
  }
  if (resultsHeader && resultsTitle) {
    resultsHeader.hidden = false;
    resultsTitle.hidden = false;
  }
  resultsGrid.hidden = false;
  
  // Clear grid before rendering new results
  resultsGrid.innerHTML = '';
  
  let firstTokenTime = null;
  let totalTime = 0;
  
  results.forEach(result => {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    const modelName = escapeHtml(result.model || 'Unknown Model');
    const hasError = result.error && result.error.length > 0;
    
    let contentHtml = '';
    
    if (hasError) {
      contentHtml = `
        <div class="result-error">
          <span class="error-icon">⚠️</span>
          <p>${escapeHtml(result.error)}</p>
        </div>
      `;
    } else {
      // Remove leading/trailing newlines from response
      const cleanedResponse = result.response.replace(/^\s+|\s+$/g, '');
      
      // Convert markdown to HTML
      const markdownHtml = markdownToHtml(cleanedResponse);
      
      contentHtml = `
        <div class="result-response">
          <div class="result-text markdown-content">${markdownHtml}</div>
        </div>
      `;
    }
    
    if (result.time_to_first_token !== undefined) {
      firstTokenTime = `${result.time_to_first_token}ms`;
      totalTime = result.duration_ms ? (result.duration_ms / 1000).toFixed(2) : '0.00';
    }
    
    const tokens = result.tokens || {};
    const promptTokens = tokens.prompt || 0;
    const completionTokens = tokens.completion || 0;
    const totalTokens = tokens.total || 0;
    
    card.innerHTML = `
      <h3 class="model-name">${modelName}</h3>
      ${contentHtml}
      <div class="result-meta">
        <span class="tokens">Prompt: ${promptTokens} | Completion: ${completionTokens} | Total: ${totalTokens}</span>
        <span class="duration">Duration: ${totalTime}s ${firstTokenTime ? `| TTFT: ${firstTokenTime}` : ''}</span>
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
  saveApiKeyBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showError('Please enter a valid API key.');
      return;
    }
    
    hideError();
    saveApiKey(apiKey);
    // Don't reload models - keep existing selection
  });
  
  // Allow Enter key in API key input
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        saveApiKey(apiKey);
        const models = fetchModels(apiKey);
        const modeFilter = modelTypeSelect.value;
        renderModels(models, modeFilter);
      }
    }
  });
  
  // Model filter dropdown
  modelTypeSelect.addEventListener('change', () => {
    const apiKey = loadApiKey();
    if (apiKey) {
      const models = fetchModels(apiKey);
      const modeFilter = modelTypeSelect.value;
      renderModels(models, modeFilter);
    }
  });
  
  // Question textarea - handle Ctrl+Enter to send
  if (questionTextarea) {
    questionTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        sendQuery();
      }
    });
  }
  
  // Send button
  if (sendButton) {
    sendButton.addEventListener('click', sendQuery);
  }
}

/**
 * Initialize app on page load
 */
async function init() {
  initEventListeners();
  
  // Always load models on startup (endpoint is public)
  try {
    const models = await fetchModels(); // No API key required
    const modeFilter = modelTypeSelect.value;
    // Ensure models is an array
    if (models && Array.isArray(models)) {
      renderModels(models, modeFilter);
    } else {
      console.error('Invalid models data received:', models);
    }
  } catch (error) {
    console.error('Failed to load models:', error);
  }
  
  // Load API key from localStorage if available
  const savedApiKey = loadApiKey();
  
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
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
  filterModels,
  getSelectedModels,
  escapeHtml,
  showLoading,
  hideLoading,
  sendQuery
};
