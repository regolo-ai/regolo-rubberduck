# Hydra Multi-Model Test
[![License](https://img.shields.io/badge/License-MIT%20v1-blue.svg)](https://spdx.org/licenses/MIT.html#licenseText)   

Standalone web application to compare responses from multiple Hydra.ai LLMs to the same question in a single, simple interface.

**Fork of**: [mcp-rubber-duck](https://github.com/nesquikm/mcp-rubber-duck) - Original MCP Rubber Duck project

## Features

- **Parallel Queries**: Send the same question to N Regolo.ai models simultaneously
- **Side-by-Side Display**: View all responses in cards for easy comparison
- **Model Filtering**: Select models by type (chat, completion, embedding)
- **Rate Limiting**: 30 requests/hour per IP to prevent abuse
- **API Key Persistence**: Your key is saved in localStorage, no need to re-enter
- **Dual Deployment**: Run locally with npm or containerized with Docker

## Prerequisites

- Node.js 18+
- Docker (optional, for containerized deployment)
- Regolo.ai API key (get one at https://regolo.ai)

## Quick Start

### Option 1: Run Without Docker (npm)

This is the simplest way to run the app locally.

```bash
# Clone the repository (if you haven't already)
git clone <your-fork-url>
cd regolo-rubberduck

# Install dependencies
npm install

# Compile the CSS
npm run build:css

# Start the server
npm start
```

The server will be available at **http://localhost:3000**

### Option 2: Run With Docker

For containerized deployment.

```bash
# Build and start the container
docker compose up --build

# Or run in background
docker compose up -d --build
```

The server will be available at **http://localhost:3000**

### Option 3: Development Mode

For development with hot-reloading (if you need to modify code).

```bash
# Install dependencies
npm install

# Compile the CSS
npm run build:css

# Start in development mode
npm run dev
```

## Usage

1. **Get API Key**: Visit https://hydra.ai and register to get your API key
2. **Open the app**: Navigate to http://localhost:3000 in your browser
3. **Enter API Key**: Type your key in the top-right field and click "Salva"
4. **Select Models**: Choose which models to query (up to 10)
5. **Ask Question**: Type your question in the textarea
6. **Compare Responses**: Click "Invia" and view all responses side-by-side

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=3600000
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `RATE_LIMIT_MAX` | 30 | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_MS` | 3600000 | Rate limit window in ms (1 hour) |

## API Endpoints

### GET /api/models

Fetches the list of available models from Hydra.ai.

**Headers:**
- `Authorization: Bearer <your-api-key>`

**Response:**
```json
{
  "models": [
    { "id": "model-1", "name": "Model 1", "mode": "chat" },
    { "id": "model-2", "name": "Model 2", "mode": "completion" }
  ]
}
```

### POST /api/chat

Sends parallel queries to multiple models.

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
{
  "apiKey": "your-api-key",
  "models": ["model-1", "model-2"],
  "messages": [
    { "role": "user", "content": "What is the capital of France?" }
  ],
  "maxTokens": 1024
}
```

**Response:**
```json
{
  "results": [
    {
      "model": "model-1",
      "response": "The capital of France is Paris.",
      "tokens": { "prompt": 10, "completion": 8, "total": 18 },
      "duration_ms": 1234,
      "error": null
    },
    {
      "model": "model-2",
      "response": "",
      "tokens": { "prompt": 0, "completion": 0, "total": 0 },
      "duration_ms": 0,
      "error": "API key non valida"
    }
  ]
}
```

## Rate Limiting

The application implements rate limiting to prevent abuse:

- **Limit**: 30 requests per hour per IP address
- **Window**: Resets every hour
- **Response**: HTTP 429 with `Retry-After` header when exceeded

## Troubleshooting

### Server won't start

- Verify Node.js 18+ is installed: `node --version`
- Ensure `npm install` completed without errors
- Check that port 3000 is not already in use

### Invalid API key

- Verify the key is correct and copied entirely from https://regolo.ai
- Make sure you clicked "Salva" after entering the key
- Try removing and re-entering the key

### Models not loading

- Check internet connection
- Verify API key is valid (see above)
- Open browser console (F12) to see any errors

### Rate limit exceeded

- Wait for the timer to expire (1 hour from first request)
- Or restart the server to reset the in-memory counter

## License

MIT

## Credits

- **Original Project**: [mcp-rubber-duck](https://github.com/nesquikm/mcp-rubber-duck) by nesquikm
