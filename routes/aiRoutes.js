// routes/aiRoutes.js
const express = require("express");
const router = express.Router();

const {
  getAdvisorConfig,
  isAdvisorConfigured,
  generateBrandAdvisorCopy,
} = require("../services/brandAdvisorService");

function buildFallbackBrandPlan(body = {}) {
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
    notes = "",
  } = body;

  const notesMerged = otherNotes || notes || "";
  const kwList = String(keywords)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
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
      notesMerged,
      tagline,
    ]
      .filter(Boolean)
      .join(" | ")
      .slice(0, 220),
  };
}

function buildStaticAdvisorTextLayer(base) {
  return {
    designRecommendation:
      "Prioritize a clean symbol-and-wordmark or wordmark-led system that stays legible and scales.",
    brandRead:
      base.oneLiner ||
      "Position the brand for clarity, trust, and recall in its market.",
    leadConceptWhy:
      "Starting with a restrained lockup reveals hierarchy and contrast before adding detail.",
    nextIterationBrief:
      "Refine spacing and monochrome use; validate at favicon and small UI sizes next.",
  };
}

// ===== Brand Plan (fallback + optional AI text layer) =====
router.post("/brand-plan", async (req, res) => {
  console.log("[brand-plan] hit");

  try {
    const base = buildFallbackBrandPlan(req.body || {});
    let textLayer = buildStaticAdvisorTextLayer(base);
    let advisorAiOk = false;

    const cfg = getAdvisorConfig();
    if (cfg.enabled && isAdvisorConfigured(cfg)) {
      try {
        textLayer = await generateBrandAdvisorCopy({
          brandName: req.body?.brandName,
          industry: req.body?.industry,
          keywords: req.body?.keywords,
          logoStructure: req.body?.logoStructure,
          brandStyleRoute: req.body?.brandStyleRoute,
          visualMood: req.body?.visualMood,
          colorDirection: req.body?.colorDirection,
          typographyDirection: req.body?.typographyDirection,
          styleCues: req.body?.styleCues,
          otherNotes: req.body?.otherNotes || req.body?.notes,
          designDecision: req.body?.designDecision,
          prompt: req.body?.prompt,
          tagline: req.body?.tagline,
        });
        advisorAiOk = true;
        console.log(`[brand-advisor] success provider=${cfg.provider}`);
      } catch (e) {
        console.log(
          `[brand-advisor] fallback provider=${cfg.provider} reason=${e?.message || e}`
        );
      }
    } else if (cfg.enabled) {
      console.log("[brand-advisor] fallback misconfigured (missing key/baseUrl/model)");
    }

    const data = { ...base, ...textLayer };
    if (advisorAiOk) {
      const rec = String(textLayer.designRecommendation || "").trim();
      const read = String(textLayer.brandRead || "").trim();
      const merged = [rec, read]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (merged) data.oneLiner = merged.slice(0, 500);
      const brief = String(textLayer.nextIterationBrief || "").trim();
      data.promptSeed = (brief || base.promptSeed || "").slice(0, 220);
    }

    return res.json({
      ok: true,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
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

module.exports = router;
