const express = require('express');
const multer = require('multer');
const { generateLogoMock, buildPromptFromBody } = require('../services/logoGenerateMock');
const { uploadLogoImageToR2, uploadLogoSvgTextToR2, uploadBufferToR2 } = require('../services/r2Upload');
const { generateDesignDecision, buildPromptFromDesignDecision, generateBrandInsight } = require('../services/designDecision');
const { generateIdeogramLogos } = require('../services/ideogramService');
const { analyzeReferenceImage } = require('../services/referenceVisionService');
const { judgeLogo, isCommercialLogoPass } = require('../services/openaiJudge');
const { generateOpenAILogoConcept } = require('../services/openaiImageService');
// const { runLogoPipeline } = require('../services/logoPipeline'); // temporarily disabled: single-candidate mode

const router = express.Router();

/** Safe preview for logging: never log full SVG or long strings. Returns { preview, length }. */
function safePreview(str, max = 120) {
  if (str == null) return { preview: '', length: 0 };
  const s = String(str);
  const len = s.length;
  const preview = len <= max ? s : s.slice(0, max) + '…';
  return { preview, length: len };
}

/**
 * Normalize one generateLogoMock result to a dual-track item (imageUrl, svgUrl, prompt, model, mode, r2Key).
 * Uploads to R2 when needed. Never logs raw SVG.
 */
async function normalizeResultToItem(result, reqId = null) {
  let imageUrl = null;
  let svgUrl = null;
  let r2Key = null;
  const prompt = result?.prompt ?? null;
  const model = result?.model ?? 'mock';
  const mode = result?.mode ?? 'text2img';
  const style_name = result?.style_name ?? result?.styleName ?? null;
  const label = result?.conceptLabel ?? result?.label ?? null;

  if (result && typeof result.rawSvgText === 'string' && result.rawSvgText.includes('<svg')) {
    try {
      const uploaded = await uploadLogoSvgTextToR2(result.rawSvgText);
      svgUrl = uploaded.svgUrl;
      imageUrl = uploaded.svgUrl;
      r2Key = uploaded.r2Key;
    } catch (e) {
      console.error('[dual-track] SVG R2 upload failed:', e?.message, 'requestId=', reqId);
    }
  } else if (typeof result === 'string' && result.includes('<svg')) {
    try {
      const uploaded = await uploadLogoSvgTextToR2(result);
      svgUrl = uploaded.svgUrl;
      imageUrl = uploaded.svgUrl;
      r2Key = uploaded.r2Key;
    } catch (e) {
      console.error('[dual-track] SVG R2 upload failed:', e?.message, 'requestId=', reqId);
    }
  } else {
    const raw = typeof result === 'string' ? result : (result?.imageUrl ?? null);
    if (raw) {
      try {
        const uploaded = await uploadLogoImageToR2(raw);
        imageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
      } catch (e) {
        console.error('[dual-track] R2 upload failed:', e?.message, 'requestId=', reqId);
      }
    }
  }

  return { imageUrl, svgUrl, prompt, model, mode, r2Key, style_name, label };
}

/**
 * Shared dual-track pipeline: 2 user-driven + 2 system-recommended logos.
 * @param {Object} mapped - mapped user input
 * @returns {Promise<{ basedOnUser: Array, recommended: Array, designDecision: Object, brandInsight: string }>}
 */
async function runDualTrackPipeline(mapped, requestId = null) {
  const designDecision = generateDesignDecision(mapped);
  const brandInsight = generateBrandInsight(designDecision);

  // Ideogram-first primary path (4 outputs), keep old generation as fallback.
  try {
    if (process.env.LOGOFUNNY_DEBUG_PROMPT === "true") {
      console.log("[map-debug] brandName=%j industry=%j brandStyleRoute=%j colorDirection=%j colorTheme=%j logoStructure=%j styleCues=%j keywords=%j hasOtherNotes=%s hasPromptOverride=%s",
        mapped.brandName,
        mapped.industry,
        mapped.brandStyleRoute || "",
        mapped.colorDirection,
        mapped.colorTheme,
        mapped.logoStructure,
        mapped.styleCues,
        mapped.keywords,
        Boolean(mapped.otherNotes || mapped.notes),
        Boolean(mapped.promptOverride)
      );
    }
    console.log('[Ideogram] main generate-logo route hit');
    const ideogramResults = await generateIdeogramLogos(mapped);
    console.log(`[Ideogram] generated count=${ideogramResults.length}`);

    const normalized = await Promise.all(ideogramResults.slice(0, 4).map((item) => normalizeResultToItem(item, requestId)));

    // Quality gate: judge all concepts in parallel, annotate with qualityStatus/qualityWarnings,
    // then rank clean concepts first. All concepts are always returned — nothing is removed.
    const VIOLATION_WARNINGS = {
      hasTrademarkSymbol:    'May include trademark-like symbols',
      hasFakeText:           'May include small unreadable or extra text',
      hasPresentationLayout: 'May look like a presentation board rather than a single logo',
      hasPeople:             'May include people or human figures',
      hasHuman:              'May include human figures',
      hasMascot:             'May include a mascot or character figure',
      hasScene:              'May include a scene or background rather than a clean logo',
      tooIllustrative:       'May be too illustrative rather than a clean standalone logo',
    };
    const RANK_ORDER = { pass: 0, unchecked: 1, needs_review: 2 };

    const judgeSettled = await Promise.allSettled(
      normalized.map((item) =>
        item.imageUrl
          ? judgeLogo(item.imageUrl, mapped, { r2Key: item.r2Key })
          : Promise.resolve(null)
      )
    );

    const annotated = normalized.map((item, i) => {
      const settled = judgeSettled[i];
      const judgeResult = settled.status === 'fulfilled' ? settled.value : null;

      if (!item.imageUrl) {
        return { ...item, qualityStatus: 'unchecked', qualityWarnings: [] };
      }
      if (!judgeResult) {
        console.log('[quality-gate] concept unchecked; passing through label=%j', item.label ?? 'unknown');
        return { ...item, qualityStatus: 'unchecked', qualityWarnings: [] };
      }

      const v = judgeResult.violations || {};
      const warnings = [...new Set(
        Object.entries(VIOLATION_WARNINGS)
          .filter(([flag]) => v[flag])
          .map(([, label]) => label)
      )];

      if (warnings.length > 0) {
        console.log('[quality-gate] concept needs review label=%j warnings=%j', item.label ?? 'unknown', warnings);
        return { ...item, qualityStatus: 'needs_review', qualityWarnings: warnings };
      }

      return { ...item, qualityStatus: 'pass', qualityWarnings: [] };
    });

    const ranked = [...annotated].sort(
      (a, b) => RANK_ORDER[a.qualityStatus] - RANK_ORDER[b.qualityStatus]
    );

    const basedOnUser = ranked.slice(0, 2);
    const recommended = ranked.slice(2, 4);
    const results = ranked;

    return { basedOnUser, recommended, designDecision, brandInsight, results };
  } catch (ideogramErr) {
    console.error('[Ideogram] error:', ideogramErr?.message || ideogramErr);
  }

  const userPromptBase = buildPromptFromBody(mapped);
  const userResultAltPrompt = userPromptBase + " Alternative take: emphasis on icon clarity and negative space.";
  const userResult1Promise = generateLogoMock(mapped);
  const userResult2Promise = generateLogoMock({
    ...mapped,
    promptOverride: userResultAltPrompt,
  });

  const sysPromptBase = buildPromptFromDesignDecision(designDecision, mapped.brandName);
  const sysInput = { ...mapped, promptOverride: sysPromptBase };
  const sysResult2AltPrompt = sysPromptBase + " Slight variation: balanced proportions.";
  const sysResult1Promise = generateLogoMock(sysInput);
  const sysResult2Promise = generateLogoMock({
    ...mapped,
    promptOverride: sysResult2AltPrompt,
  });

  const [userResult1, userResult2, sysResult1, sysResult2] = await Promise.all([
    userResult1Promise,
    userResult2Promise,
    sysResult1Promise,
    sysResult2Promise,
  ]);

  const basedOnUser = await Promise.all([normalizeResultToItem(userResult1, requestId), normalizeResultToItem(userResult2, requestId)]);
  const recommended = await Promise.all([normalizeResultToItem(sysResult1, requestId), normalizeResultToItem(sysResult2, requestId)]);
  const results = [...basedOnUser, ...recommended];

  return { basedOnUser, recommended, designDecision, brandInsight, results };
}

// --- Elementor → AI 字段映射器（兼容 body.fields / 直接 body / curl） ---
function mapElementorToAI(body) {
  // Elementor webhook 常见结构：{ form: {...}, fields: {...} }
  const f = body?.fields || body?.form_fields || body || {};

  const pickStr = (k) => {
    const v = f[k];
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    return String(v);
  };

  const pickArr = (k) => {
    const v = f[k];
    if (Array.isArray(v)) return v;
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  };

  return {
    brandName: pickStr("brandName"),
    subtitle: pickStr("subtitle") || pickStr("tagline") || pickStr("brandTagline"),
    tagline: pickStr("brandTagline"),
    keywords: pickStr("keywords"),
    industry: pickStr("industry"),
    colorTheme: pickArr("colorTheme"),
    notes: pickStr("notes"),
    otherNotes: pickStr("otherNotes") || pickStr("notes"),
    brandFontStyle: pickStr("brandFontStyle"),
    logoStructure: pickStr("logoStructure"),
    brandStyleRoute: pickStr("brandStyleRoute"),
    visualMood: f["visualMood"] || null,
    colorDirection: pickStr("colorDirection"),
    typographyDirection: pickStr("typographyDirection"),
    styleCues: pickStr("styleCues"),
    style: pickStr("style"),
    detail: pickStr("detail"),
    promptOverride: pickStr("promptOverride") || pickStr("prompt"),
    conceptPrompts: f["conceptPrompts"] ?? null,
    uploadImage: f["uploadLogo"] || null,
  };
}
const REFERENCE_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const _referenceMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    REFERENCE_ALLOWED_TYPES.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Reference image must be PNG, JPEG, or WebP.'));
  },
}).single('referenceImage');

function handleReferenceUpload(req, res, next) {
  _referenceMulter(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'Reference image must be under 5MB.'
      : (err.message || 'Invalid reference image.');
    return res.status(400).json({ success: false, data: null, error: msg });
  });
}

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

// 简单测试路由：不调模型，只验证 Webhook 是否通畅
router.post('/test-generate-logo', requireInternalKey, (req, res) => {
  console.log('[/test-generate-logo] incoming body:');
  console.log(JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    success: true,
    route: '/test-generate-logo',
    received: req.body
  });
});

// POST /generate-logo  (Elementor -> backend; returns dual-track shape, same as /generate-logo-dual)
router.post('/generate-logo', requireInternalKey, handleReferenceUpload, async (req, res) => {
  const requestStart = Date.now();
  const requestId = String(Date.now()) + Math.random().toString(16).slice(2);
  const mapped = mapElementorToAI(req.body);

  if (req.file) {
    // Run R2 upload and vision analysis in parallel; vision failure must never block generation.
    const [r2Result, visionResult] = await Promise.allSettled([
      uploadBufferToR2(req.file.buffer, req.file.mimetype, { prefix: 'references' }),
      analyzeReferenceImage(req.file.buffer, req.file.mimetype),
    ]);

    if (r2Result.status === 'rejected') {
      console.error('[generate-logo] R2 reference upload failed:', r2Result.reason?.message);
      return res.status(500).json({ success: false, data: null, error: 'Reference image upload failed. Please try again.' });
    }

    mapped.referenceImageUrl = r2Result.value.publicUrl;

    const visionAnalysis = visionResult.status === 'fulfilled' ? visionResult.value : null;
    if (visionAnalysis) {
      mapped.referenceAnalysis = visionAnalysis;
    }
  }

  const hasReferenceImage    = Boolean(mapped.referenceImageUrl);
  const hasReferenceAnalysis = Boolean(mapped.referenceAnalysis?.safePromptFragment);
  const mode = mapped.uploadImage ? 'img2img' : 'text2img';

  console.log('[HIT] /generate-logo route=generate-logo', 'timestamp=', new Date(requestStart).toISOString(), 'requestId=', requestId, 'brandName=', safePreview(mapped.brandName).preview, 'mode=', mode, 'hasReferenceImage=', hasReferenceImage, 'hasReferenceAnalysis=', hasReferenceAnalysis);
  console.log('[BODY]', 'brandNameLen=', safePreview(mapped.brandName).length, 'keywordsLen=', safePreview(mapped.keywords).length, 'hasUploadImage=', Boolean(mapped.uploadImage), 'hasReferenceImage=', hasReferenceImage, 'hasReferenceAnalysis=', hasReferenceAnalysis, 'referenceAnalysisDetailLevel=', mapped.referenceAnalysis?.detailLevel ?? 'n/a', 'colorThemeCount=', Array.isArray(mapped.colorTheme) ? mapped.colorTheme.length : 0);

  try {
    const hasText = (mapped.brandName && mapped.brandName.trim()) || (mapped.keywords && mapped.keywords.trim());
    if (!hasText) {
      console.log('[perf][generate-logo] total request time (validation failed) ms =', Date.now() - requestStart);
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing required fields: please provide Brand Name or Keywords.',
      });
    }

    const data = await runDualTrackPipeline(mapped, requestId);
    const firstUserUrl = data.basedOnUser[0]?.imageUrl ?? data.basedOnUser[0]?.svgUrl ?? null;
    const tEnd = Date.now();
    console.log('[RESULT] /generate-logo success=true', 'requestId=', requestId, 'ms=', tEnd - requestStart);

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        imageUrl: firstUserUrl,
        referenceApplied: hasReferenceImage,
      },
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo] error:', err);
    console.log('[perf][generate-logo] total request time (error) ms =', Date.now() - requestStart);
    return res.status(200).json({
      success: false,
      data: null,
      error: err?.message || 'Internal error',
    });
  }
});

// POST /generate-logo-fast — single generation quick test
router.post('/generate-logo-fast', requireInternalKey, async (req, res) => {
  try {
    const mapped = mapElementorToAI(req.body);

    if (!mapped.brandName || !mapped.brandName.trim()) {
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing Brand Name',
      });
    }

    const result = await generateLogoMock(mapped);
    const item = await normalizeResultToItem(result);

    return res.status(200).json({
      success: true,
      data: item,
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo-fast] error:', err);
    return res.status(200).json({
      success: false,
      data: null,
      error: err?.message || 'Internal error',
    });
  }
});

router.post("/generate-logo-direct", requireInternalKey, async (req, res) => {
  try {
    const result = await generateLogoMock(req.body);
    const imageUrl = result?.imageUrl || null;
    let finalImageUrl = imageUrl;
    let r2Key = null;
    if (imageUrl) {
      try {
        const uploaded = await uploadLogoImageToR2(imageUrl);
        finalImageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
      } catch (uploadErr) {
        console.error('[generate-logo-direct] R2 upload failed:', uploadErr);
      }
    }
    res.json({
      success: true,
      data: {
        ...result,
        imageUrl: finalImageUrl,
        r2Key,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /generate-logo-ideogram-test
router.post('/generate-logo-ideogram-test', requireInternalKey, async (req, res) => {
  try {
    const mapped = mapElementorToAI(req.body);
    if (!mapped.brandName || !mapped.brandName.trim()) {
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing Brand Name',
      });
    }

    const results = await generateIdeogramLogos(mapped);

    return res.status(200).json({
      success: true,
      data: {
        results,
        prompt: results[0]?.prompt || null,
        model: 'ideogram',
      },
      error: null,
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      data: null,
      error: err?.message || 'Internal error',
    });
  }
});

// POST /generate-logo-openai-test
// Internal manual test route for Phase 1.0 OpenAI image service.
// Disabled unless LOGOFUNNY_OPENAI_IMAGE_ENABLED=true and LOGOFUNNY_INTERNAL_TEST_SECRET is set.
// Does not charge credits, trigger refund logic, or trigger referral logic.
router.post('/generate-logo-openai-test', requireInternalKey, async (req, res) => {
  // Guard 1: feature flag
  if (process.env.LOGOFUNNY_OPENAI_IMAGE_ENABLED !== 'true') {
    return res.status(200).json({ success: false, data: null, error: 'OpenAI image generation is disabled.' });
  }

  // Guard 2: test secret must be configured
  const testSecret = process.env.LOGOFUNNY_INTERNAL_TEST_SECRET;
  if (!testSecret) {
    return res.status(200).json({ success: false, data: null, error: 'Test route not configured.' });
  }

  // Guard 3: request must supply matching test secret
  if (req.headers['x-logofunny-test-secret'] !== testSecret) {
    return res.status(401).json({ success: false, data: null, error: 'Unauthorized.' });
  }

  // Guard 4: brandName required
  const brandName = String(req.body?.brandName || '').trim();
  if (!brandName) {
    return res.status(200).json({ success: false, data: null, error: 'Missing brandName.' });
  }

  // Guard 5: conceptKey validation
  const VALID_CONCEPT_KEYS = new Set(['recommended', 'wordmark', 'app_icon', 'symbol_mark']);
  const conceptKey = String(req.body?.conceptKey || 'app_icon').trim();
  if (!VALID_CONCEPT_KEYS.has(conceptKey)) {
    return res.status(200).json({ success: false, data: null, error: `Invalid conceptKey. Allowed: ${[...VALID_CONCEPT_KEYS].join(', ')}.` });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  console.log('[openai-test] brandName=%j conceptKey=%s quality=%s ip=%s',
    brandName, conceptKey, process.env.LOGOFUNNY_OPENAI_IMAGE_QUALITY || 'medium', ip);

  try {
    const input = mapElementorToAI(req.body);
    const result = await generateOpenAILogoConcept(input, conceptKey);
    return res.status(200).json({ success: true, data: result, error: null });
  } catch (err) {
    console.error('[openai-test] error:', err?.message || err);
    return res.status(200).json({ success: false, data: null, error: err?.message || 'Internal error.' });
  }
});

// POST /generate-logo-hybrid-test
// Internal 2 Ideogram + 2 OpenAI hybrid inspection route.
// Does not charge credits, trigger refund, or trigger referral.
// Requires LOGOFUNNY_HYBRID_TEST_ENABLED=true and LOGOFUNNY_OPENAI_IMAGE_ENABLED=true.
router.post('/generate-logo-hybrid-test', requireInternalKey, async (req, res) => {
  const t0 = Date.now();

  // Guard 1: hybrid test must be explicitly enabled
  if (process.env.LOGOFUNNY_HYBRID_TEST_ENABLED !== 'true') {
    return res.status(404).json({ success: false, data: null, error: 'Not found.' });
  }

  // Guard 2: test secret must be configured on the server
  const testSecret = process.env.LOGOFUNNY_INTERNAL_TEST_SECRET;
  if (!testSecret) {
    return res.status(500).json({ success: false, data: null, error: 'Test route not configured.' });
  }

  // Guard 3: request must supply matching test secret
  if (req.headers['x-logofunny-test-secret'] !== testSecret) {
    return res.status(403).json({ success: false, data: null, error: 'Unauthorized.' });
  }

  // Guard 4: OpenAI must be enabled (required for slots 2 and 3)
  if (process.env.LOGOFUNNY_OPENAI_IMAGE_ENABLED !== 'true') {
    return res.status(503).json({ success: false, data: null, error: 'OpenAI image generation is disabled (set LOGOFUNNY_OPENAI_IMAGE_ENABLED=true).' });
  }

  // Guard 5: brandName required
  const brandName = String(req.body?.brandName || '').trim();
  if (!brandName) {
    return res.status(400).json({ success: false, data: null, error: 'Missing brandName.' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  console.log('[hybrid-test] brandName=%j industry=%j ip=%s',
    brandName, String(req.body?.industry || ''), ip);

  const input = mapElementorToAI(req.body);

  // Run all 3 calls in parallel: Ideogram (4 slots internally, we take [0] and [1]) + 2 OpenAI slots.
  const [ideogramOutcome, openaiSlot2Outcome, openaiSlot3Outcome] = await Promise.allSettled([
    generateIdeogramLogos(input),
    generateOpenAILogoConcept(input, 'symbol_mark'),
    generateOpenAILogoConcept(input, 'wordmark'),
  ]);

  const results = [];

  // Slots 0 and 1 — Ideogram Commercial (persisted to R2)
  if (ideogramOutcome.status === 'fulfilled') {
    const ideogramResults = ideogramOutcome.value || [];
    const r0 = ideogramResults[0];
    const r1 = ideogramResults[1];

    const [r2Upload0, r2Upload1] = await Promise.allSettled([
      r0?.imageUrl ? uploadLogoImageToR2(r0.imageUrl) : Promise.resolve(null),
      r1?.imageUrl ? uploadLogoImageToR2(r1.imageUrl) : Promise.resolve(null),
    ]);

    for (let i = 0; i < 2; i++) {
      const r = ideogramResults[i];
      const r2Outcome = i === 0 ? r2Upload0 : r2Upload1;
      if (r) {
        const persistedUrl = r2Outcome?.status === 'fulfilled' && r2Outcome.value?.publicUrl
          ? r2Outcome.value.publicUrl
          : r.imageUrl ?? null;
        if (r2Outcome?.status === 'rejected') {
          console.error(`[hybrid-test] Ideogram slot ${i} R2 upload failed:`, r2Outcome.reason?.message);
        }
        results.push({
          slot: i,
          model: 'ideogram',
          imageUrl: persistedUrl,
          conceptLabel: r.conceptLabel ?? r.label ?? `ideogram-${i}`,
          prompt: r.prompt ?? null,
        });
      } else {
        results.push({ slot: i, model: 'ideogram', error: `Ideogram slot ${i} missing from results.` });
      }
    }
  } else {
    const errMsg = ideogramOutcome.reason?.message || 'Ideogram generation failed.';
    console.error('[hybrid-test] Ideogram error:', errMsg);
    results.push({ slot: 0, model: 'ideogram', error: errMsg });
    results.push({ slot: 1, model: 'ideogram', error: errMsg });
  }

  // Slot 2 — OpenAI symbol_mark
  if (openaiSlot2Outcome.status === 'fulfilled') {
    const r = openaiSlot2Outcome.value;
    results.push({
      slot: 2,
      model: 'openai',
      imageUrl: r.imageUrl ?? null,
      conceptLabel: r.conceptLabel ?? 'symbol_mark',
      prompt: r.prompt ?? null,
    });
  } else {
    const errMsg = openaiSlot2Outcome.reason?.message || 'OpenAI symbol_mark failed.';
    console.error('[hybrid-test] OpenAI slot 2 error:', errMsg);
    results.push({ slot: 2, model: 'openai', conceptLabel: 'symbol_mark', error: errMsg });
  }

  // Slot 3 — OpenAI wordmark
  if (openaiSlot3Outcome.status === 'fulfilled') {
    const r = openaiSlot3Outcome.value;
    results.push({
      slot: 3,
      model: 'openai',
      imageUrl: r.imageUrl ?? null,
      conceptLabel: r.conceptLabel ?? 'wordmark',
      prompt: r.prompt ?? null,
    });
  } else {
    const errMsg = openaiSlot3Outcome.reason?.message || 'OpenAI wordmark failed.';
    console.error('[hybrid-test] OpenAI slot 3 error:', errMsg);
    results.push({ slot: 3, model: 'openai', conceptLabel: 'wordmark', error: errMsg });
  }

  // Quality gate — judge all slots with imageUrl in parallel, annotate results
  const HYBRID_VIOLATION_WARNINGS = {
    hasTrademarkSymbol: 'May include trademark-like symbols',
    hasFakeText: 'May include small unreadable or extra text',
    hasPresentationLayout: 'May look like a presentation board rather than a single logo',
  };
  const judgeSettled = await Promise.allSettled(
    results.map((item) =>
      item.imageUrl ? judgeLogo(item.imageUrl, input) : Promise.resolve(null)
    )
  );
  const annotatedResults = results.map((item, i) => {
    const settled = judgeSettled[i];
    const judgeResult = settled?.status === 'fulfilled' ? settled.value : null;

    if (!item.imageUrl) {
      return { ...item, qualityStatus: 'unchecked', qualityWarnings: [], isSafeForLead: false };
    }
    if (!judgeResult) {
      console.log('[hybrid-test] quality check unavailable slot=%d', item.slot);
      return { ...item, qualityStatus: 'unchecked', qualityWarnings: ['Quality check unavailable'], isSafeForLead: false };
    }

    const v = judgeResult.violations || {};
    const warnings = [...new Set(
      Object.entries(HYBRID_VIOLATION_WARNINGS)
        .filter(([flag]) => v[flag])
        .map(([, label]) => label)
    )];

    const qualityStatus = warnings.length > 0 ? 'needs_review' : 'pass';
    const isSafeForLead = isCommercialLogoPass(judgeResult);

    if (warnings.length > 0) {
      console.log('[hybrid-test] slot=%d needs_review warnings=%j', item.slot, warnings);
    }

    return { ...item, qualityStatus, qualityWarnings: warnings, isSafeForLead };
  });

  // Lead recommendation — prefer first isSafeForLead slot in slot order
  const recommendedItem = annotatedResults.find((r) => r.isSafeForLead) ?? null;
  const recommendedSlot = recommendedItem?.slot ?? null;
  const recommendation = {
    slot:   recommendedSlot,
    reason: recommendedSlot !== null
      ? 'First slot where isSafeForLead is true'
      : 'No slot passed quality gate',
    mode:   recommendedSlot !== null ? 'quality_gate' : 'none',
  };
  const finalResults = annotatedResults.map((r) => ({
    ...r,
    isRecommended: r.slot === recommendedSlot,
  }));

  const durationMs = Date.now() - t0;
  console.log('[hybrid-test] done brandName=%j slots=%d durationMs=%d',
    brandName, annotatedResults.filter((r) => r.imageUrl).length, durationMs);

  return res.status(200).json({
    success: true,
    results: finalResults,
    recommendation,
    meta: {
      brandName,
      industry: String(req.body?.industry || ''),
      durationMs,
      slots: {
        0: 'ideogram-commercial',
        1: 'ideogram-commercial',
        2: 'openai-symbol_mark',
        3: 'openai-wordmark',
      },
    },
  });
});

module.exports = router;
