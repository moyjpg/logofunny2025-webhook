// routes/aiRoutes.js
const express = require("express");
const router = express.Router();
// ===== Brand Plan (safe fallback) =====
router.post("/brand-plan", (req, res) => {
  console.log("[brand-plan] hit");

  return res.json({
    ok: true,
    data: {
      oneLiner: "This brand should focus on clarity, simplicity, and strong visual contrast.",
      keywords: ["clean", "distinct", "scalable"],
      palette: [
        { name: "Primary", hex: "#3B82F6" },
        { name: "Secondary", hex: "#FFFFFF" },
        { name: "Accent", hex: "#111827" }
      ],
      typeStyle: {
        logoFont: "Bold sans-serif for readability",
        taglineFont: "Lighter sans-serif for hierarchy"
      },
      doDont: {
        do: [
          "Keep it simple",
          "Maintain strong contrast",
          "Ensure legibility at small sizes"
        ],
        dont: [
          "Overly complex shapes",
          "Too many gradients",
          "Tiny decorative details"
        ]
      },
      promptSeed: "minimal clean scalable high-contrast brand logo"
    }
  });
});

const { buildPrompts } = require("../utils/promptEngine");
const { generateSvgFromPrompt, svgToPngBuffer } = require("../services/aiGenerateService");

router.post("/generate__ai", async (req, res) => {
  try {
    const type = req.body?.type || "letter";
    const brand = req.body?.brand || "LOGOFUNNY";
    const letter = req.body?.letter;
    const concept = req.body?.concept;
    const color = req.body?.color || "black and white";
    const strictSafe = Boolean(req.body?.strict_safe);

    const meta = buildPrompts({
      logo_type: type,
      brand_name: brand,
      letter,
      concept,
      color_style: color,
      strict_safe: strictSafe,
    });

    // 如果你想 strict_safe=true 时强制拦截非 SAFE_B4，可打开下面这段：
    // if (meta.logo_type === "letter" && meta.strict_safe && !meta.use_safe_b4) {
    //   return res.status(400).json({ ok: false, error: "strict_safe enabled: letter not in SAFE_B4", meta });
    // }

    // 真实生成：把 prompt + magic_prompt 合并
    const finalPrompt = `${meta.prompt}\n\n${meta.magic_prompt}`;

    const { svgUrl, svgText, model } = await generateSvgFromPrompt(finalPrompt);

    const pngBuffer = await svgToPngBuffer(svgText, 1024);
    const pngBase64 = pngBuffer.toString("base64");

    return res.json({
      ok: true,
      svg_url: svgUrl,
      model,
      meta,
      png_base64: pngBase64,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

// ===== Brand Plan (mock) =====
router.post("/brand-plan", (req, res) => {
  const {
    brandName = "",
    tagline = "",
    keywords = "",
    style = "",
    iconStyle = "",
    detailLevel = "",
    colorTheme = "",
    customColors = "",
    industry = "",
    brandFontVibe = "",
    taglineFontVibe = "",
    otherNotes = "",
  } = req.body || {};

  const kwList = String(keywords)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return res.json({
    ok: true,
    data: {
      oneLiner: `${brandName || "Your brand"}${
        industry ? ` (${industry})` : ""
      } should use a ${style || "modern"} ${
        iconStyle || ""
      } approach, focusing on clarity and scalability.`,
      keywords: (kwList.length ? kwList : ["clean", "distinct", "trustworthy"]).slice(0, 3),
      palette: [
        { name: "Primary", hex: "#3B82F6" },
        { name: "Secondary", hex: "#FFFFFF" },
        { name: "Accent", hex: "#111827" },
      ],
      typeStyle: {
        logoFont: brandFontVibe
          ? `Logo font vibe: ${brandFontVibe}`
          : "Bold sans-serif for readability",
        taglineFont: taglineFontVibe
          ? `Tagline font vibe: ${taglineFontVibe}`
          : "Lighter weight for hierarchy",
      },
      doDont: {
        do: ["Keep it simple", "Ensure legibility at small sizes", "Use strong contrast"],
        dont: ["Overly complex shapes", "Too many gradients", "Tiny details"],
      },
      promptSeed: [
        style,
        iconStyle,
        detailLevel,
        kwList.join(", "),
        colorTheme || customColors,
        otherNotes,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 220),
    },
  });
});

module.exports = router;