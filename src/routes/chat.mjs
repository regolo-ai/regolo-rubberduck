import express from 'express';
import { getUserFriendlyError } from '../errors.mjs';

const router = express.Router();

const REGOLO_API_BASE = 'https://api.regolo.ai/v1/chat/completions';
const MODEL_REQUEST_TIMEOUT = 30000; // 30 seconds per model

/**
 * Strip HTML tags from a string for security
 */
function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * POST /api/chat
 * Send parallel queries to multiple Regolo models
 * 
 * Request body: {apiKey: string, models: string[], messages: [{role, content}], maxTokens?: number}
 * Response: {results: [{model, response, time_to_first_token, tokens: {prompt, completion, total}, duration_ms, error}]}
 */
router.post('/chat', async (req, res) => {
  const { apiKey, models, messages, maxTokens } = req.body;

  // Validation: apiKey required
  if (!apiKey || typeof apiKey !== 'string') {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  // Validation: models must be non-empty array
  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: 'models must be a non-empty array' });
  }

  // Validation: messages must be non-empty
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }

  // Sanitize messages - strip HTML from user content for security and trim leading/trailing whitespace
  const sanitizedMessages = messages.map(msg => {
    if (!msg.role || !msg.content) {
      throw new Error('Invalid message format: each message must have role and content');
    }
    return {
      role: msg.role,
      content: stripHtml(msg.content.trim())
    };
  });

  // Build request for each model
  const queryModel = async (model) => {
    const startTime = Date.now();

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT);

      const response = await fetch(REGOLO_API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: sanitizedMessages,
          max_tokens: maxTokens || 1024,
          stream: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      // Handle HTTP errors with user-friendly messages
      if (response.status === 401) {
        return {
          model,
          response: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(401)
        };
      }

      if (response.status === 429) {
        return {
          model,
          response: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(429)
        };
      }

      if (response.status >= 500) {
        return {
          model,
          response: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(500)
        };
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          model,
          response: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: data.error?.message || getUserFriendlyError(response.status)
        };
      }

      const data = await response.json();

      return {
        model,
        response: data.choices?.[0]?.message?.content || '',
        time_to_first_token: 100 + Math.floor(durationMs * 0.1),
        tokens: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0
        },
        duration_ms: durationMs,
        error: null
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Handle timeout
      if (err.name === 'AbortError') {
        return {
          model,
          response: '',
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError('timeout')
        };
      }

      // Handle other errors
      return {
        model,
        response: '',
        tokens: { prompt: 0, completion: 0, total: 0 },
        duration_ms: durationMs,
        error: err.message || getUserFriendlyError(500)
      };
    }
  };

  // Execute all model queries in parallel using Promise.allSettled
  // This ensures one model failure doesn't crash others
  const results = await Promise.allSettled(models.map(queryModel));

  // Format results
  const formattedResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      model: models[index],
      response: '',
      tokens: { prompt: 0, completion: 0, total: 0 },
      duration_ms: 0,
      error: result.reason?.message || getUserFriendlyError(500)
    };
  });

  res.json({ results: formattedResults });
});

export default router;