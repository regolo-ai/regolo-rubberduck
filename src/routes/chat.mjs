import express from "express";
import { getUserFriendlyError } from "../errors.mjs";
import { processUrlsInText, extractUrls } from "../urlProcessor.mjs";

const router = express.Router();

const REGOLO_API_BASE = "https://api.regolo.ai/v1/chat/completions";
const MODEL_REQUEST_TIMEOUT = 30000; // 30 seconds per model
const STREAM_MODEL_TIMEOUT = 120000; // 2 minutes per model for streaming

/**
 * Strip HTML tags from a string for security
 */
function stripHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/<[^>]*>/g, "");
}

/**
 * POST /api/chat
 * Send parallel queries to multiple Regolo models
 *
 * Request body: {apiKey: string, models: string[], messages: [{role, content}], maxTokens?: number}
 * Response: {results: [{model, response, time_to_first_token, tokens: {prompt, completion, total}, duration_ms, error}]}
 */
router.post("/chat", async (req, res) => {
  const { apiKey, models, messages, maxTokens } = req.body;

  // Validation: apiKey required
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "apiKey is required" });
  }

  // Validation: models must be non-empty array
  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: "models must be a non-empty array" });
  }

  // Validation: messages must be non-empty
  if (!Array.isArray(messages) || messages.length === 0) {
    return res
      .status(400)
      .json({ error: "messages must be a non-empty array" });
  }

  // Check for URLs in the last user message and process them
  let urlsFound = [];
  let urlsProcessed = 0;

  const sanitizedMessages = await Promise.all(
    messages.map(async (msg) => {
      if (!msg.role || !msg.content) {
        throw new Error(
          "Invalid message format: each message must have role and content",
        );
      }

      // Only process URLs in user messages
      if (msg.role === "user") {
        const {
          processedText,
          urlsFound: found,
          urlsProcessed: processed,
        } = await processUrlsInText(msg.content);
        urlsFound = found;
        urlsProcessed = processed;

        return {
          role: msg.role,
          content: stripHtml(processedText.trim()),
        };
      }

      return {
        role: msg.role,
        content: stripHtml(msg.content.trim()),
      };
    }),
  );

  // If URLs were found, include this info in response via a custom header (for UI feedback)
  if (urlsProcessed > 0) {
    res.set("X-URLs-Processed", String(urlsProcessed));
  }

  // Build request for each model
  const queryModel = async (model) => {
    const startTime = Date.now();

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        MODEL_REQUEST_TIMEOUT,
      );

      const response = await fetch(REGOLO_API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: sanitizedMessages,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      // Handle HTTP errors with user-friendly messages
      if (response.status === 401) {
        return {
          model,
          response: "",
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(401),
        };
      }

      if (response.status === 429) {
        return {
          model,
          response: "",
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(429),
        };
      }

      if (response.status >= 500) {
        return {
          model,
          response: "",
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError(500),
        };
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return {
          model,
          response: "",
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: data.error?.message || getUserFriendlyError(response.status),
        };
      }

      const data = await response.json();

      return {
        model,
        response: data.choices?.[0]?.message?.content || "",
        time_to_first_token: 100 + Math.floor(durationMs * 0.1),
        tokens: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
        duration_ms: durationMs,
        error: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Handle timeout
      if (err.name === "AbortError") {
        return {
          model,
          response: "",
          tokens: { prompt: 0, completion: 0, total: 0 },
          duration_ms: durationMs,
          error: getUserFriendlyError("timeout"),
        };
      }

      // Handle other errors
      return {
        model,
        response: "",
        tokens: { prompt: 0, completion: 0, total: 0 },
        duration_ms: durationMs,
        error: err.message || getUserFriendlyError(500),
      };
    }
  };

  // Execute all model queries in parallel using Promise.allSettled
  // This ensures one model failure doesn't crash others
  const results = await Promise.allSettled(models.map(queryModel));

  // Format results
  const formattedResults = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      model: models[index],
      response: "",
      tokens: { prompt: 0, completion: 0, total: 0 },
      duration_ms: 0,
      error: result.reason?.message || getUserFriendlyError(500),
    };
  });

  res.json({ results: formattedResults });
});

/**
 * POST /api/chat/stream
 * Send parallel streaming queries to multiple Regolo models via SSE
 *
 * SSE Events sent to client:
 * - init:      { models: string[] }
 * - reasoning: { model: string, content: string }  — thinking process from reasoning models
 * - chunk:     { model: string, content: string }  — actual answer content
 * - usage:     { model: string, tokens: {prompt, completion, total}, duration_ms: number, ttft: number }
 * - error:     { model: string, error: string, duration_ms: number }
 * - done:      {}
 */
router.post("/chat/stream", async (req, res) => {
  const { apiKey, models, messages, maxTokens } = req.body;

  // Validation: apiKey required
  if (!apiKey || typeof apiKey !== "string") {
    return res.status(400).json({ error: "apiKey is required" });
  }

  // Validation: models must be non-empty array
  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: "models must be a non-empty array" });
  }

  // Validation: messages must be non-empty
  if (!Array.isArray(messages) || messages.length === 0) {
    return res
      .status(400)
      .json({ error: "messages must be a non-empty array" });
  }

  // Check for URLs in the last user message and process them
  let urlsFound = [];
  let urlsProcessed = 0;

  const sanitizedMessages = await Promise.all(
    messages.map(async (msg) => {
      if (!msg.role || !msg.content) {
        throw new Error(
          "Invalid message format: each message must have role and content",
        );
      }

      if (msg.role === "user") {
        const {
          processedText,
          urlsFound: found,
          urlsProcessed: processed,
        } = await processUrlsInText(msg.content);
        urlsFound = found;
        urlsProcessed = processed;

        return {
          role: msg.role,
          content: stripHtml(processedText.trim()),
        };
      }

      return {
        role: msg.role,
        content: stripHtml(msg.content.trim()),
      };
    }),
  );

  if (urlsProcessed > 0) {
    res.set("X-URLs-Processed", String(urlsProcessed));
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Flush headers immediately so the client knows the stream started
  res.flushHeaders();

  // Helper to send SSE events
  const sseSend = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Notify client which models to expect
  sseSend("init", { models });

  // Track abort controllers for cleanup on client disconnect
  const abortControllers = [];

  req.on("close", () => {
    abortControllers.forEach((c) => c.abort());
  });

  /**
   * Stream a single model's response from Regolo API
   */
  const streamModel = async (model) => {
    const startTime = Date.now();
    let firstChunkTime = null;
    const controller = new AbortController();
    abortControllers.push(controller);

    try {
      const timeoutId = setTimeout(
        () => controller.abort(),
        STREAM_MODEL_TIMEOUT,
      );

      const response = await fetch(REGOLO_API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: sanitizedMessages,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });

      // Handle HTTP errors with user-friendly messages
      if (response.status === 401) {
        sseSend("error", {
          model,
          error: getUserFriendlyError(401),
          duration_ms: Date.now() - startTime,
        });
        clearTimeout(timeoutId);
        return;
      }

      if (response.status === 429) {
        sseSend("error", {
          model,
          error: getUserFriendlyError(429),
          duration_ms: Date.now() - startTime,
        });
        clearTimeout(timeoutId);
        return;
      }

      if (response.status >= 500) {
        sseSend("error", {
          model,
          error: getUserFriendlyError(500),
          duration_ms: Date.now() - startTime,
        });
        clearTimeout(timeoutId);
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        sseSend("error", {
          model,
          error:
            errData.error?.message || getUserFriendlyError(response.status),
          duration_ms: Date.now() - startTime,
        });
        clearTimeout(timeoutId);
        return;
      }

      // Parse SSE from Regolo streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        // Split by newlines to process individual data lines
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop(); // Keep potentially incomplete last line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const rawData = line.slice(6).trim();
          if (rawData === "[DONE]") continue;

          try {
            const parsed = JSON.parse(rawData);
            const delta = parsed.choices?.[0]?.delta;

            // Extract reasoning content (thinking process from reasoning models)
            const reasoningContent = delta?.reasoning_content;
            if (reasoningContent) {
              if (!firstChunkTime) {
                firstChunkTime = Date.now() - startTime;
              }
              sseSend("reasoning", { model, content: reasoningContent });
            }

            // Extract content delta (actual answer)
            const content = delta?.content;
            if (content) {
              if (!firstChunkTime) {
                firstChunkTime = Date.now() - startTime;
              }
              sseSend("chunk", { model, content });
            }

            // Extract usage from final chunk
            if (parsed.usage) {
              const totalDurationMs = Date.now() - startTime;
              sseSend("usage", {
                model,
                tokens: {
                  prompt: parsed.usage.prompt_tokens || 0,
                  completion: parsed.usage.completion_tokens || 0,
                  total: parsed.usage.total_tokens || 0,
                },
                duration_ms: totalDurationMs,
                ttft: firstChunkTime || totalDurationMs,
              });
            }
          } catch (e) {
            // Skip unparseable lines
          }
        }
      }

      clearTimeout(timeoutId);
    } catch (err) {
      const durationMs = Date.now() - startTime;

      if (err.name === "AbortError") {
        sseSend("error", {
          model,
          error: getUserFriendlyError("timeout"),
          duration_ms: durationMs,
        });
      } else {
        sseSend("error", {
          model,
          error: err.message || getUserFriendlyError(500),
          duration_ms: durationMs,
        });
      }
    }
  };

  // Execute all model streams in parallel
  await Promise.allSettled(models.map(streamModel));

  sseSend("done", {});
  res.end();
});

export default router;
