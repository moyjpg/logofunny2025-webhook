// routes/aiRoutes.js
const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  getAdvisorConfig,
  isAdvisorConfigured,
  attemptBrandAdvisorLLM,
} = require("../services/brandAdvisorService");

const {
  generateOnboardingFollowup,
} = require("../services/onboardingFollowupService");

const {
  runOnboardingResearch,
} = require("../services/onboardingResearchService");

const {
  analyzeOnboardingImage,
} = require("../services/onboardingImageAnalysisService");

const {
  generateOnboardingSummary,
  normalizeOnboardingInput,
  buildDeterministicDirectionDraft,
} = require("../services/onboardingSummaryService");

const {
  normalizeConfirmedDirection,
} = require("../services/confirmedDirectionContract");

const {
  generateInternalBrandBrief,
} = require("../services/internalBrandBriefService");

const {
  generateCreativeDirections,
} = require("../services/creativeDirectionsService");

function requireInternalKey(req, res, next) {
  const serverKey = process.env.LOGOFUNNY_INTERNAL_API_KEY;
  if (!serverKey) {
    console.warn('[security] LOGOFUNNY_INTERNAL_API_KEY is not configured');
    return res.status(500).json({ success: false, error: 'Server security key is not configured.' });
  }
  const clientKey = req.headers['x-logofunny-internal-key'];
  if (!clientKey || clientKey !== serverKey) {
    console.warn(`[security] invalid internal API key method=${req.method} path=${req.originalUrl || req.path || ""}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

const ONBOARDING_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const onboardingImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ONBOARDING_IMAGE_TYPES.has(file.mimetype);
    callback(allowed ? null : new Error("Reference image must be PNG, JPEG, or WebP."), allowed);
  },
}).single("reference_image");

function handleOnboardingImageUpload(req, res, next) {
  onboardingImageUpload(req, res, (error) => {
    if (!error) return next();
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Reference image must be 5 MB or smaller."
      : (error.message || "Invalid reference image.");
    return res.status(400).json({ ok: false, error: message });
  });
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

router.post("/generate__ai", requireInternalKey, async (req, res) => {
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

// ===== Onboarding Brand Conversation (P0.4 preview) =====
// Layer 1 -> Layer 2 only. Returns a short brand-guide response and at most
// one plain-language follow-up. It never generates Creative Directions,
// prompts, images, or credit-affecting work and always has a safe fallback.
router.post("/onboarding-followup", requireInternalKey, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};

  const toText = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

  const input = {
    brand_name: toText(body.brand_name).trim(),
    business_description: toText(body.business_description).trim(),
    rough_feeling: toText(body.rough_feeling).trim(),
    primary_use: toText(body.primary_use).trim(),
    voluntary_extra_context: toText(body.voluntary_extra_context).trim(),
    latest_message: toText(body.latest_message).trim(),
    conversation_language: ["en", "zh-CN", "es", "ja"].includes(body.conversation_language)
      ? body.conversation_language
      : "en",
    adaptive_answers: Array.isArray(body.adaptive_answers) ? body.adaptive_answers : [],
    guided_choices: body.guided_choices && typeof body.guided_choices === "object" && !Array.isArray(body.guided_choices)
      ? body.guided_choices
      : {},
  };

  if (!/[A-Za-z0-9]/.test(input.brand_name) || !/^[A-Za-z0-9 &'().,+\-]+$/.test(input.brand_name)) {
    return res.status(400).json({
      ok: false,
      error: "Logo text currently supports English letters, numbers, and simple punctuation only.",
    });
  }

  try {
    const result = await generateOnboardingFollowup(input);
    const questions = Array.isArray(result.questions)
      ? result.questions.map((q) => ({ id: q.id, question: q.question, reason: q.reason, target_field: q.targetField }))
      : [];

    return res.status(200).json({
      ok: true,
      data: {
        source: result.source === "ai" ? "ai" : "deterministic_fallback",
        assistant_message: toText(result.assistant_message).trim(),
        ready_to_review: result.ready_to_review === true,
        research: result.research && typeof result.research === "object"
          ? result.research
          : { offered: false, reason: "", confirmation_question: "" },
        needs_followup: questions.length > 0,
        questions,
      },
    });
  } catch (err) {
    console.error("[onboarding-followup] handler error:", err?.message || err);
    return res.status(200).json({
      ok: true,
      data: {
        source: "deterministic_fallback",
        assistant_message: "I can help you think through the idea, not just record it. Tell me the one thing people should remember after seeing the brand once.",
        ready_to_review: true,
        research: { offered: false, reason: "", confirmation_question: "" },
        needs_followup: false,
        questions: [],
      },
    });
  }
});

// ===== Onboarding Public Research =====
// The authenticated frontend owns end-user confirmation and credit charging.
// This internal route only performs the approved public-web research and
// returns the answer plus the exact source URLs supplied by OpenAI.
router.post("/onboarding-research", requireInternalKey, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  try {
    const result = await runOnboardingResearch(body);
    return res.status(200).json({
      ok: true,
      data: {
        summary: result.summary,
        sources: result.sources,
        model: result.model,
        response_id: result.response_id,
      },
    });
  } catch (err) {
    const notConfigured = err?.code === "RESEARCH_NOT_CONFIGURED";
    console.error("[onboarding-research] failed:", err?.message || err);
    return res.status(notConfigured ? 503 : 502).json({
      ok: false,
      error: notConfigured
        ? "Public research is not configured."
        : "Public research is temporarily unavailable.",
    });
  }
});

// ===== Onboarding Visual Reference Analysis =====
// The authenticated frontend obtains the user's explicit consent before this
// route is called. The image is processed in memory, is not persisted here,
// and this route never charges credits or starts generation.
router.post(
  "/onboarding-image-analysis",
  requireInternalKey,
  handleOnboardingImageUpload,
  async (req, res) => {
    const requestId = String(req.body?.request_id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
    if (req.body?.image_analysis_consent !== "true") {
      return res.status(412).json({ ok: false, error: "Confirm image analysis before continuing." });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "A reference image is required." });
    }

    try {
      const result = await analyzeOnboardingImage({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        source_type: req.body?.source_type,
        brand_name: req.body?.brand_name,
        business_description: req.body?.business_description,
        rough_feeling: req.body?.rough_feeling,
      });
      return res.status(200).json({
        ok: true,
        data: {
          analysis: result.analysis,
          model: result.model,
          response_id: result.response_id,
        },
      });
    } catch (error) {
      const notConfigured = error?.code === "IMAGE_ANALYSIS_NOT_CONFIGURED";
      const diagnosticCode = String(error?.code || "IMAGE_ANALYSIS_UNAVAILABLE").slice(0, 120);
      console.error(`[onboarding-image-analysis] request_id=${requestId || "none"} code=${diagnosticCode} failed:`, error?.message || error);
      return res.status(notConfigured ? 503 : 502).json({
        ok: false,
        error: notConfigured
          ? "Image analysis is not configured."
          : "Image analysis is temporarily unavailable.",
        diagnostic_code: diagnosticCode,
        request_id: requestId || undefined,
      });
    }
  }
);

// ===== Onboarding Direction Summary (P0.4 isolated preview) =====
// Layer 1 -> editable Layer 2 only. Never generates an Internal Brand Brief,
// Creative Directions, prompts, images, or credit-affecting work.
router.post("/onboarding-summary", requireInternalKey, async (req, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const input = normalizeOnboardingInput(body);

  if (!input.brand_name || !input.business_description) {
    return res.status(400).json({
      ok: false,
      error: "brand_name and business_description are required.",
    });
  }
  if (!/[A-Za-z0-9]/.test(input.brand_name) || !/^[A-Za-z0-9 &'().,+\-]+$/.test(input.brand_name)) {
    return res.status(400).json({
      ok: false,
      error: "Logo text currently supports English letters, numbers, and simple punctuation only.",
    });
  }

  try {
    const result = await generateOnboardingSummary(input);
    if (result.source === "ai") console.log("[onboarding-summary] ai_success");
    else console.log(`[onboarding-summary] fallback_used reason=${result.failure || "unknown"}`);

    return res.status(200).json({
      ok: true,
      data: {
        source: result.source,
        draft: result.draft,
      },
    });
  } catch (err) {
    console.error("[onboarding-summary] handler error:", err?.message || err);
    return res.status(200).json({
      ok: true,
      data: {
        source: "deterministic_fallback",
        draft: buildDeterministicDirectionDraft(input),
      },
    });
  }
});

// ===== Internal Brand Brief (Layer 3 isolated preview) =====
// Consumes only a user-approved confirmed_direction.v1. It does not build
// Creative Directions, prompts, images, or touch credits/generation.
router.post("/onboarding-brief", requireInternalKey, async (req, res) => {
  const raw = req.body?.confirmed_direction;
  const confirmedDirection = normalizeConfirmedDirection(raw);
  if (!confirmedDirection) {
    return res.status(400).json({ ok: false, error: "Invalid confirmed_direction.v1." });
  }

  try {
    const result = await generateInternalBrandBrief(confirmedDirection);
    if (result.source === "ai") console.log("[onboarding-brief] strategist_success");
    else console.log(`[onboarding-brief] fallback_used reason=${result.failure || "unknown"}`);
    return res.status(200).json({
      ok: true,
      data: {
        source: result.source,
        coverage_passed: result.coveragePassed,
        brief: result.brief,
      },
    });
  } catch (err) {
    console.error("[onboarding-brief] handler error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Internal Brand Brief is temporarily unavailable." });
  }
});

// ===== Creative Directions (Layer 4 isolated preview) =====
// Consumes only a verified internal_brand_brief.v1 and returns four distinct
// strategic routes. It never creates provider prompts or generated assets.
router.post("/onboarding-creative-directions", requireInternalKey, async (req, res) => {
  try {
    const result = await generateCreativeDirections(req.body?.internal_brand_brief);
    if (!result.ok) {
      if (result.failure === "invalid_brief") {
        return res.status(400).json({ ok: false, error: "Invalid internal_brand_brief.v1." });
      }
      console.log(`[onboarding-creative-directions] unavailable reason=${result.failure || "unknown"}`);
      return res.status(503).json({
        ok: false,
        error: "Creative Directions are not configured for this isolated preview.",
        code: result.failure || "unavailable",
      });
    }

    console.log("[onboarding-creative-directions] strategist_success");
    return res.status(200).json({
      ok: true,
      data: { source: result.source, creative_directions: result.directions },
    });
  } catch (err) {
    console.error("[onboarding-creative-directions] handler error:", err?.message || err);
    return res.status(500).json({ ok: false, error: "Creative Directions are temporarily unavailable." });
  }
});

module.exports = router;
