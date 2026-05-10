const express = require('express');
const { generateLogoMock, buildPromptFromBody } = require('../services/logoGenerateMock');
const { uploadLogoImageToR2, uploadLogoSvgTextToR2 } = require('../services/r2Upload');
const { generateDesignDecision, buildPromptFromDesignDecision, generateBrandInsight } = require('../services/designDecision');
const { generateIdeogramLogos } = require('../services/ideogramService');
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
async function normalizeResultToItem(result) {
  let imageUrl = null;
  let svgUrl = null;
  let r2Key = null;
  const prompt = result?.prompt ?? null;
  const model = result?.model ?? 'mock';
  const mode = result?.mode ?? 'text2img';
  const style_name = result?.style_name ?? result?.styleName ?? null;

  if (result && typeof result.rawSvgText === 'string' && result.rawSvgText.includes('<svg')) {
    try {
      const uploaded = await uploadLogoSvgTextToR2(result.rawSvgText);
      svgUrl = uploaded.svgUrl;
      imageUrl = uploaded.svgUrl;
      r2Key = uploaded.r2Key;
    } catch (e) {
      console.error('[dual-track] SVG R2 upload failed:', e?.message);
    }
  } else if (typeof result === 'string' && result.includes('<svg')) {
    try {
      const uploaded = await uploadLogoSvgTextToR2(result);
      svgUrl = uploaded.svgUrl;
      imageUrl = uploaded.svgUrl;
      r2Key = uploaded.r2Key;
    } catch (e) {
      console.error('[dual-track] SVG R2 upload failed:', e?.message);
    }
  } else {
    const raw = typeof result === 'string' ? result : (result?.imageUrl ?? null);
    if (raw) {
      try {
        const uploaded = await uploadLogoImageToR2(raw);
        imageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
      } catch (e) {
        console.error('[dual-track] R2 upload failed:', e?.message);
      }
    }
  }

  return { imageUrl, svgUrl, prompt, model, mode, r2Key, style_name };
}

/**
 * Shared dual-track pipeline: 2 user-driven + 2 system-recommended logos.
 * @param {Object} mapped - mapped user input
 * @returns {Promise<{ basedOnUser: Array, recommended: Array, designDecision: Object, brandInsight: string }>}
 */
async function runDualTrackPipeline(mapped) {
  const designDecision = generateDesignDecision(mapped);
  const brandInsight = generateBrandInsight(designDecision);

  // Ideogram-first primary path (4 outputs), keep old generation as fallback.
  try {
    console.log('[Ideogram] main generate-logo route hit');
    const ideogramResults = await generateIdeogramLogos(mapped);
    console.log(`[Ideogram] generated count=${ideogramResults.length}`);

    const normalized = await Promise.all(ideogramResults.slice(0, 4).map((item) => normalizeResultToItem(item)));
    const basedOnUser = normalized.slice(0, 2);
    const recommended = normalized.slice(2, 4);
    const results = normalized;

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

  const basedOnUser = await Promise.all([normalizeResultToItem(userResult1), normalizeResultToItem(userResult2)]);
  const recommended = await Promise.all([normalizeResultToItem(sysResult1), normalizeResultToItem(sysResult2)]);
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
    promptOverride: pickStr("promptOverride") || pickStr("prompt"),
    uploadImage: f["uploadLogo"] || null,
  };
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
router.post('/generate-logo', requireInternalKey, async (req, res) => {
  const requestStart = Date.now();
  const requestId = String(Date.now()) + Math.random().toString(16).slice(2);
  const mapped = mapElementorToAI(req.body);
  const mode = mapped.uploadImage ? 'img2img' : 'text2img';

  console.log('[HIT] /generate-logo route=generate-logo', 'timestamp=', new Date(requestStart).toISOString(), 'requestId=', requestId, 'brandName=', safePreview(mapped.brandName).preview, 'mode=', mode);
  console.log('[BODY]', 'brandNameLen=', safePreview(mapped.brandName).length, 'keywordsLen=', safePreview(mapped.keywords).length, 'hasUploadImage=', Boolean(mapped.uploadImage), 'colorThemeCount=', Array.isArray(mapped.colorTheme) ? mapped.colorTheme.length : 0);

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

    const data = await runDualTrackPipeline(mapped);
    const firstUserUrl = data.basedOnUser[0]?.imageUrl ?? data.basedOnUser[0]?.svgUrl ?? null;
    const tEnd = Date.now();
    console.log('[RESULT] /generate-logo success=true', 'requestId=', requestId, 'ms=', tEnd - requestStart);

    return res.status(200).json({
      success: true,
      data: {
        ...data,
        imageUrl: firstUserUrl,
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

// POST /generate-logo-dual — dual-track: 2 user-driven + 2 system-recommended
router.post('/generate-logo-dual', requireInternalKey, async (req, res) => {
  const requestStart = Date.now();
  const requestId = String(Date.now()) + Math.random().toString(16).slice(2);
  const mapped = mapElementorToAI(req.body);
  const mode = mapped.uploadImage ? 'img2img' : 'text2img';

  console.log('[HIT] /generate-logo-dual route=generate-logo-dual', 'timestamp=', new Date(requestStart).toISOString(), 'requestId=', requestId, 'brandName=', safePreview(mapped.brandName).preview, 'mode=', mode);
  console.log('[BODY]', 'brandNameLen=', safePreview(mapped.brandName).length, 'keywordsLen=', safePreview(mapped.keywords).length, 'hasUploadImage=', Boolean(mapped.uploadImage), 'colorThemeCount=', Array.isArray(mapped.colorTheme) ? mapped.colorTheme.length : 0);

  try {
    const hasText = (mapped.brandName && mapped.brandName.trim()) || (mapped.keywords && mapped.keywords.trim());
    if (!hasText) {
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing required fields: please provide Brand Name or Keywords.',
      });
    }

    const data = await runDualTrackPipeline(mapped);
    const tEnd = Date.now();
    console.log('[RESULT] /generate-logo-dual success=true', 'requestId=', requestId, 'ms=', tEnd - requestStart);

    return res.status(200).json({
      success: true,
      data,
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo-dual] error:', err);
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

// POST /generate-logo-pipeline  (temporarily: single-candidate, no multi-model pipeline)
router.post('/generate-logo-pipeline', requireInternalKey, async (req, res) => {
  try {
    const mapped = mapElementorToAI(req.body);
    const hasText = (mapped.brandName && mapped.brandName.trim()) || (mapped.keywords && mapped.keywords.trim());
    if (!hasText) {
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing required fields: please provide Brand Name or Keywords.',
      });
    }

    // TEMP: disable multi-candidate pipeline, generate 1 logo via generateLogoMock
    const result = await generateLogoMock(mapped);

    let imageUrl = null;
    if (typeof result === 'string') {
      imageUrl = result;
    } else if (result && typeof result.imageUrl === 'string') {
      imageUrl = result.imageUrl;
    } else if (result && result.data && typeof result.data.imageUrl === 'string') {
      imageUrl = result.data.imageUrl;
    }

    let finalImageUrl = imageUrl;
    let r2Key = null;
    if (imageUrl) {
      try {
        const uploaded = await uploadLogoImageToR2(imageUrl);
        finalImageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
      } catch (uploadErr) {
        console.error('[generate-logo-pipeline] R2 upload failed:', uploadErr);
      }
    }

    const candidate = {
      imageUrl: finalImageUrl,
      r2Key,
      prompt: result?.prompt || null,
      model: result?.model || 'mock',
      mode: result?.mode || (mapped.uploadImage ? 'img2img' : 'text2img'),
    };

    return res.status(200).json({
      success: true,
      data: {
        top: candidate,
        candidates: [candidate],
        rankingMethod: 'single_candidate_direct',
        mapped,
      },
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo-pipeline] error:', err);
    return res.status(200).json({
      success: false,
      data: null,
      error: err?.message || 'Internal error',
    });
  }
});
module.exports = router;
