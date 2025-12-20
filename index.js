// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const Replicate = require("replicate");
const fetch = require("node-fetch");
const sharp = require("sharp");

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
app.post("/generate-svg", async (req, res) => {
  try {
    const model = process.env.REPLICATE_MODEL || "recraft-ai/recraft-v3-svg";
    const prompt =
      (req.body && (req.body.prompt || req.body.text)) ||
      "minimal vector logo, clean, modern, flat design, no gradients";

    // 1) 先生成（得到 delivery url）
    const output = await replicate.run(model, { input: { prompt: String(prompt) } });
    const svgUrl = output.url();

    // 2) 立刻由后端去拉 SVG 文本
    const r = await fetch(svgUrl, { redirect: "follow" });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: `Failed to fetch SVG from delivery (status ${r.status})`,
        detail: t.slice(0, 300),
        svg_url: svgUrl,
      });
    }

    const svgText = await r.text();

    // 3) 返回给前端：浏览器直接显示 SVG
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.status(200).send(svgText);
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
});
app.post("/generate-png", async (req, res) => {
  try {
    const model = process.env.REPLICATE_MODEL || "recraft-ai/recraft-v3-svg";
    const prompt =
      (req.body && (req.body.prompt || req.body.text)) ||
      "minimal vector logo, clean, modern, flat design, no gradients";

    // 1) 生成 SVG（通过 Replicate）
    const output = await replicate.run(model, {
      input: { prompt: String(prompt) },
    });
    const svgUrl = output.url();

    // 2) 后端拉回 SVG
    const r = await fetch(svgUrl);
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({ ok: false, error: "fetch svg failed", detail: t.slice(0,200) });
    }
    const svgText = await r.text();

    // 3) SVG -> PNG（1024x1024）
    const pngBuffer = await sharp(Buffer.from(svgText))
      .png()
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.status(200).send(pngBuffer);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
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
