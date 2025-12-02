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

// Keep other routes disabled until these work
// const logoRoutes = require('./routes/logoRoutes');
// app.use('/', logoRoutes);

app.listen(port, () => {
  console.log(`logofunny backend running on port ${port}`);
});