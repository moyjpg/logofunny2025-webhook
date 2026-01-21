// index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const multer = require("multer");
const upload = multer(); // 内存模式：只解析字段/文件，不落盘
const { buildPrompts } = require("./utils/promptEngine");
const path = require("path");
const debugRoutes = require("./routes/debugRoutes");
const aiRoutes = require("./routes/aiRoutes");
const Replicate = require("replicate");
const fetch = require("node-fetch");
const sharp = require("sharp");

const app = express();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
const port = process.env.PORT || 3000;

// Step C-1｜Elementor Form → Standard Input
function normalizeElementorForm(body) {
  const ff = body?.form_fields || {};

  return {
    uploadLogo: ff.uploadLogo || null,
    brandName: ff.brandName?.trim() || "",
    brandTagline: ff.brandTagline?.trim() || null,
    keywords: ff.keywords?.trim() || "",
    industry: ff.industry || "",
    colorTheme: Array.isArray(ff.colorTheme)
      ? ff.colorTheme
      : ff.colorTheme
      ? [ff.colorTheme]
      : [],
    notes: ff.notes?.trim() || null,
  };
}

function buildLogoPrompt({ brandName, keywords }) {
  return `
  Design a professional SaaS logo icon.

  Brand name: ${brandName}
  Style keywords: ${keywords}

  Logo category:
  - abstract geometric logo
  - animal-inspired but NON-representational
  - inspired by motion or energy, NOT animal shape

  Rules:
  - the logo must NOT clearly depict any real animal
  - no head, no eyes, no mouth, no tail, no legs
  - no body anatomy
  - no pose or action

  Design intent:
  This is a modern SaaS logo, not a symbol, badge, emblem, or illustration.

  STRICT RULES (DO NOT VIOLATE):
  - NO people
  - NO characters
  - NO animals
  - NO mascots
  - NO landscape
  - NO scene
  - NO illustration
  - NO storytelling
  - NO photography
  - NO shadows
  - NO gradients
  - NO 3D
  - NO background decoration
  - NO crossing lines
  - NO diagonal decorative lines
  - NO line art
  - NO outline-only shapes
  - NO strokes
  - use filled shapes only
  - solid geometric forms only
  - STRICTLY avoid any symbol resembling hate, extremist, political, religious, or prohibited insignia

  LOGO ENGINEERING (CRITICAL):
  - single solid symbol only
  - one primary geometric shape
  - no crossing lines
  - no decorative strokes
  - no freeform curves unless part of a closed shape
  - must look clear and recognizable at 24px
  - must work as app icon and favicon
  - design should feel intentional, not artistic

  Geometry:
  - simple closed geometric construction
  - filled shapes only
  - strong outer silhouette
  - minimal shapes (max 2)
  - no internal decoration
  - balanced negative space

  Style:
  - modern SaaS
  - professional
  - flat
  - scalable
  - works at favicon size (24px)

  Reference feel:
  - similar clarity to Stripe, Shopify, Notion symbol marks

  Output:
  - abstract logo mark only
  - centered
  - black & white or transparent background
  - SVG vector
 `;
}
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Step C-1.3｜Elementor Webhook Receiver (multipart-safe)
app.post("/webhook/elementor", upload.any(), (req, res) => {
  try {
    // multer 解析后：文本字段在 req.body，文件在 req.files
    const input = normalizeElementorForm({ form_fields: req.body });

    console.log("[webhook/elementor] body keys:", Object.keys(req.body || {}));
    console.log(
      "[webhook/elementor] files:",
      (req.files || []).map(f => ({
        fieldname: f.fieldname,
        size: f.size,
      }))
    );
    console.log("[webhook/elementor] normalized input:", input);

    // 先只返回成功，确认 webhook 真正打通
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[webhook/elementor] error:", e);
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
});

// 静态站点（前端页面）
app.use(express.static(path.join(__dirname, "public")));

// Debug + AI API
app.use("/debug", debugRoutes);
app.use("/api", aiRoutes);
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
    const brandName = req.body?.brandName || "Brand";
    const keywords = req.body?.keywords || "modern, minimal, saas";
    const prompt = buildLogoPrompt({ brandName, keywords });

    // 1) 先生成（得到 delivery url）
    const output = await replicate.run(model, {
    input: {
    prompt: String(prompt),
    }
   });
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
    const brandName = req.body?.brandName || "Brand";
    const keywords = req.body?.keywords || "modern, minimal, saas";
    const prompt = buildLogoPrompt({ brandName, keywords });

    // 1) 生成 SVG（通过 Replicate）
    const output = await replicate.run(model, {
    input: {
    prompt: String(prompt),
    }
   });
    const svgUrl = output.url();

    // 2) 后端拉回 SVG
    const r = await fetch(svgUrl, { redirect: "follow" });
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
