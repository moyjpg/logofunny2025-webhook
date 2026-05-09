// routes/aiRoutes.js
const express = require("express");
const router = express.Router();

const {
  getAdvisorConfig,
  isAdvisorConfigured,
  attemptBrandAdvisorLLM,
} = require("../services/brandAdvisorService");

function requireInternalKey(req, res, next) {
  const serverKey = process.env.LOGOFUNNY_INTERNAL_API_KEY;
  if (!serverKey) {
    console.warn('[security] LOGOFUNNY_INTERNAL_API_KEY is not configured');
    return res.status(500).json({ success: false, error: 'Server security key is not configured.' });
  }
  const clientKey = req.headers['x-logofunny-internal-key'];
  if (!clientKey || clientKey !== serverKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

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
      "Lead direction: use a restrained symbol-plus-wordmark system that signals clarity before decoration. Keep the symbol simple enough for favicon scale, pair it with a clean sans wordmark, and avoid adding extra motifs too early. Color strategy: Primary carries the core mark emphasis, Secondary holds neutral contrast, and Accent is reserved for small highlights only.",
    brandRead:
      "This direction tends to suit categories that need quick recognition and reliable usability across web and product touchpoints. Prioritize clarity, trust, and restraint; avoid overabstracted geometry or heavy gradients that reduce distinctiveness at small sizes.",
    leadConceptWhy:
      "Option 1 is a strong starting point because it establishes hierarchy, readability, and scalable structure before stylistic detail. Do keep visual weight balanced and forms intentional; don't let decorative complexity outrun legibility.",
    nextIterationBrief:
      "Next pass: tighten spacing, normalize stroke/weight contrast, and validate monochrome performance at favicon and social-avatar sizes. Then define dark/light usage rules and align product headline typography with the wordmark rhythm before expanding palette complexity.",
  };
}

// ===== Brand Plan (fallback + optional AI text layer) =====
router.post("/brand-plan", requireInternalKey, async (req, res) => {
  console.log("[brand-plan] hit");

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  const finish = (data) => res.status(200).json({ ok: true, data });

  try {
    const base = buildFallbackBrandPlan(body);
    let textLayer = buildStaticAdvisorTextLayer(base);
    let advisorAiOk = false;

    const cfg = getAdvisorConfig();
    if (cfg.enabled && isAdvisorConfigured(cfg)) {
      const ai = await attemptBrandAdvisorLLM({
        brandName: body.brandName,
        industry: body.industry,
        keywords: body.keywords,
        logoStructure: body.logoStructure,
        brandStyleRoute: body.brandStyleRoute,
        visualMood: body.visualMood,
        colorDirection: body.colorDirection,
        typographyDirection: body.typographyDirection,
        styleCues: body.styleCues,
        otherNotes: body.otherNotes || body.notes,
        designDecision: body.designDecision,
        prompt: body.prompt,
        tagline: body.tagline,
      });

      if (ai.ok) {
        textLayer = ai.textLayer;
        advisorAiOk = true;
        console.log("[brand-advisor] ai_success");
      } else if (ai.failure === "timeout") {
        console.log("[brand-advisor] ai_timeout");
        console.log("[brand-advisor] static_fallback_used");
      } else if (ai.failure === "parse") {
        console.log("[brand-advisor] ai_parse_fail");
        console.log("[brand-advisor] static_fallback_used");
      } else {
        console.log("[brand-advisor] ai_error_fallback_used");
        console.log("[brand-advisor] static_fallback_used");
      }
    } else {
      console.log("[brand-advisor] static_fallback_used");
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

    return finish(data);
  } catch (err) {
    console.error("[brand-advisor] brand-plan handler error:", err?.message || err);
    try {
      const base = buildFallbackBrandPlan(body);
      const data = { ...base, ...buildStaticAdvisorTextLayer(base) };
      console.log("[brand-advisor] ai_error_fallback_used");
      console.log("[brand-advisor] static_fallback_used");
      return finish(data);
    } catch (_) {
      const base = buildFallbackBrandPlan({});
      const data = { ...base, ...buildStaticAdvisorTextLayer(base) };
      console.log("[brand-advisor] ai_error_fallback_used");
      console.log("[brand-advisor] static_fallback_used");
      return finish(data);
    }
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
