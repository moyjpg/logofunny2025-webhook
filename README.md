# Mock AI Logo Generator Backend (Node.js + Express)

This project provides a minimal, clean, and well-structured backend API that simulates the behavior of a future AI logo generator.

## Project Structure
- `index.js` — main server
- `routes/logoRoutes.js` — all routes
- `services/logoService.js` — logic for mock generation
- `config/env.js` — load environment variables via dotenv
- `utils/logger.js` — simple logger utility

## Requirements
- Node.js + Express only
- Uses `dotenv` for environment variables
- Unified response format: `{ success, data, error }`
- No direct `console.log` in app code; uses logger utility
- Runs on port `3000` by default (or `PORT` from environment)

## Installation
1. Ensure you have Node.js installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

## Example cURL
Send a test request to generate a mock logo preview:

```bash
curl -X POST http://localhost:3000/test-generate-logo \
  -H "Content-Type: application/json" \
  -d '{
    "brandName": "Acme",
    "tagline": "Fast and Reliable",
    "keywords": "modern,minimal,flat",
    "colorTheme": "blue"
  }'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "previewUrl": "https://example.com/mock-logo.png",
    "received": {
      "brandName": "Acme",
      "tagline": "Fast and Reliable",
      "keywords": "modern,minimal,flat",
      "colorTheme": "blue"
    }
  },
  "error": null
}
```

