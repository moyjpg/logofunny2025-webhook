// routes/debugRoutes.js
const express = require("express");
const router = express.Router();

const { buildPrompts } = require("../utils/promptEngine");

router.get("/prompt-test", (req, res) => {
  try {
    const result = buildPrompts({
      // type: letter | symbol | wordmark
      logo_type: req.query.type || "letter",
      brand_name: req.query.brand || "LOGOFUNNY",
      letter: req.query.letter,
      concept: req.query.concept,
      tagline: req.query.tagline,
      keywords: req.query.keywords,
      industry: req.query.industry,
      color_style: req.query.color || "black and white",
      font_style: req.query.font,
      tagline_font_style: req.query.tagline_font,
      notes: req.query.notes,
      strict_safe: req.query.strict_safe === "1" || req.query.strict_safe === "true",
    });

    res.json({
      ok: true,
      input: req.query,
      prompt: result,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

module.exports = router;