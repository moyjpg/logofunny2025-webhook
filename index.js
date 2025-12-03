// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check: GET /
app.get('/', (req, res) => {
  res.send('logofunny backend online');
});

// Simple test route: POST /test-generate-logo
app.post('/test-generate-logo', (req, res) => {
  return res.json({
    success: true,
    source: 'test-generate-logo',
    received: req.body || null
  });
});

// Enable /generate route via dedicated router
const generateRoutes = require('./routes/generateRoutes');
app.use('/', generateRoutes);

// Helpful GET handler to guide usage of /generate
app.get('/generate', (req, res) => {
  res.status(405).json({
    success: false,
    message: 'Use POST /generate with JSON body',
    example: {
      brandName: 'Acme',
      tagline: 'We build things',
      keywords: 'modern, minimal',
      colorTheme: 'blue',
      styleFont: 'Sans',
      taglineFont: 'Serif',
      notes: 'clean logo',
      industry: 'tech',
      uploadImage: null
    }
  });
});

app.listen(port, () => {
  console.log(`logofunny backend running on port ${port}`);
});
