const REGOLO_API_URL = 'https://api.regolo.ai/model_group/info';
const REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * GET /api/models handler
 * Returns list of available models from Regolo API (public, no auth required)
 */
export async function getModelsHandler(req, res) {
  // No authorization required - public endpoint
  
  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    // Forward request to Regolo API (without Authorization header)
    const response = await fetch(REGOLO_API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    // Handle Regolo API errors
    if (response.status === 401) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!response.ok) {
      return res.status(500).json({ error: 'Regolo API error', status: response.status });
    }

    // Parse Regolo API response and normalize model data
    const modelsData = await response.json();

    // Regolo returns { data: [...] } with model_group as the ID
    const rawModels = modelsData.data || modelsData.models || modelsData;
    const models = Array.isArray(rawModels)
      ? rawModels.map(m => ({
          id: m.model_group || m.id || m.name,
          name: m.model_group || m.name || m.id,
          mode: m.mode || 'chat'
        }))
      : [];

    return res.json({ models });

  } catch (error) {
    // Handle timeout
    if (error.name === 'AbortError') {
      return res.status(500).json({ error: 'Request timeout' });
    }
    
    // Handle other errors (Regolo down, network issues)
    return res.status(500).json({ error: 'Failed to fetch models' });
  }
}
