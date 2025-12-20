// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const Replicate = require("replicate");

const app = express();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get('/', (req, res) => {
  res.send('logofunny backend online');
});
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    timestamp: Date.now()
  });
});
app.post("/generate", async (req, res) => {
  try {
    const model = process.env.REPLICATE_MODEL || "recraft-ai/recraft-v3-svg";
    const prompt =
      (req.body && (req.body.prompt || req.body.text)) ||
      "minimal vector logo, clean, modern, flat design, no gradients";

    const input = { prompt: String(prompt) };
    const output = await replicate.run(model, { input });

    return res.status(200).json({
      ok: true,
      model,
      svg_url: output.url(),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});
const logoRoutes = require('./routes/logoRoutes');

// Enable /generate route via dedicated router
const generateRoutes = require('./routes/generateRoutes');
const logoApiRoutes = require('./routes/logoApiRoutes');
app.use('/', logoApiRoutes);
app.use('/', generateRoutes);
app.use('/', logoRoutes);

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
