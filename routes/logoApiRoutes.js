const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');
const { uploadLogoImageToR2, uploadLogoSvgTextToR2 } = require('../services/r2Upload');
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
    uploadImage: f["uploadLogo"] || null,
  };
}
// 简单测试路由：不调模型，只验证 Webhook 是否通畅
router.post('/test-generate-logo', (req, res) => {
  console.log('[/test-generate-logo] incoming body:');
  console.log(JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    success: true,
    route: '/test-generate-logo',
    received: req.body
  });
});

// POST /generate-logo  (Elementor -> backend)
router.post('/generate-logo', async (req, res) => {
  const requestStart = Date.now();
  const requestId = String(Date.now()) + Math.random().toString(16).slice(2);

  // 2) 字段映射：Elementor -> AI 输入（early for HIT/BODY logs）
  const mapped = mapElementorToAI(req.body);
  const mode = mapped.uploadImage ? 'img2img' : 'text2img';

  console.log(
    '[HIT] /generate-logo',
    'timestamp=', new Date(requestStart).toISOString(),
    'requestId=', requestId,
    'brandName=', safePreview(mapped.brandName).preview,
    'mode=', mode
  );
  console.log(
    '[BODY]',
    'brandNameLen=', safePreview(mapped.brandName).length,
    'keywordsLen=', safePreview(mapped.keywords).length,
    'hasUploadImage=', Boolean(mapped.uploadImage),
    'colorThemeCount=', Array.isArray(mapped.colorTheme) ? mapped.colorTheme.length : 0
  );

  try {
    // 3) 轻量校验（注意：为了不让 Elementor 报 “Webhook error”，这里不返回 4xx，统一返回 200）
    const hasText = (mapped.brandName && mapped.brandName.trim()) || (mapped.keywords && mapped.keywords.trim());
    if (!hasText) {
      const tEnd = Date.now();
      console.log('[perf][generate-logo] total request time (validation failed) ms =', tEnd - requestStart);
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing required fields: please provide Brand Name or Keywords.',
      });
    }

    // 4) 真正调用生成（先接你现有的 generateLogoMock，让链路先跑通）
    //    你现在顶部引入的是：const { generateLogoMock } = require('../services/logoGenerateMock');
    const beforeGeneration = Date.now();
    console.log('[perf][generate-logo] time before generation msSinceRequestStart =', beforeGeneration - requestStart);
    const result = await generateLogoMock(mapped);
    const afterGeneration = Date.now();
    console.log('[perf][generate-logo] time after image generated ms =', afterGeneration - beforeGeneration);

    // 5) 兼容不同返回结构：提取 imageUrl / SVG
    let imageUrl = null;
    if (typeof result === 'string') {
      imageUrl = result;
    } else if (result && typeof result.imageUrl === 'string') {
      imageUrl = result.imageUrl;
    } else if (result && result.data && typeof result.data.imageUrl === 'string') {
      imageUrl = result.data.imageUrl;
    }

    // SVG-first path for Recraft: if no imageUrl but we have raw SVG text
    let svgText = null;
    if (!imageUrl) {
      if (result && typeof result.rawSvgText === 'string' && result.rawSvgText.includes('<svg')) {
        svgText = result.rawSvgText;
      } else if (typeof result === 'string' && result.includes('<svg')) {
        svgText = result;
      }
    }

    if (
      svgText &&
      result &&
      typeof result.model === 'string' &&
      result.model.toLowerCase().includes('recraft')
    ) {
      try {
        const uploadedSvg = await uploadLogoSvgTextToR2(svgText);
        const svgUrl = uploadedSvg.svgUrl;
        console.log('[generate-logo] SVG uploaded to R2:', svgUrl);
        const tEnd = Date.now();
        console.log('[perf][generate-logo] total request time ms =', tEnd - requestStart);
        console.log(
          '[RESULT]', 'success=true', 'model=', result?.model || 'mock', 'mode=', result?.mode || mode,
          'r2Key=', uploadedSvg.r2Key || null, 'imageUrl=present', 'svgUrl=present'
        );
        return res.status(200).json({
          success: true,
          data: {
            svgUrl,
            imageUrl: svgUrl,
            prompt: result?.prompt || null,
            model: result?.model || 'mock',
            mode: result?.mode || mode,
            r2Key: uploadedSvg.r2Key,
            mapped,
          },
          error: null,
        });
      } catch (svgUploadErr) {
        console.error('[generate-logo] SVG R2 upload failed:', svgUploadErr);
        // fall through to image upload path (if any)
      }
    }

    // 6) 上传到 R2，拿可访问 URL
    let finalImageUrl = imageUrl;
    let r2Key = null;
    if (imageUrl) {
      try {
        const uploaded = await uploadLogoImageToR2(imageUrl);
        finalImageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
      } catch (uploadErr) {
        console.error('[generate-logo] R2 upload failed:', uploadErr);
      }
    }

    const tEnd = Date.now();
    console.log('[perf][generate-logo] total request time ms =', tEnd - requestStart);
    const hasImageUrl = Boolean(finalImageUrl);
    console.log(
      '[RESULT]', 'success=', hasImageUrl, 'model=', result?.model || 'mock', 'mode=', result?.mode || mode,
      'r2Key=', r2Key || null, 'imageUrl=', hasImageUrl ? 'present' : 'missing', 'svgUrl=missing'
    );

    // 7) 统一返回格式（给 Elementor/前端用）
    if (!finalImageUrl) {
      return res.status(200).json({
        success: false,
        data: {
          imageUrl: null,
          svgUrl: null,
          prompt: result?.prompt || null,
          model: result?.model || 'mock',
          mode: result?.mode || mode,
          r2Key: null,
          mapped,
          debug: 'No image or SVG was produced.',
        },
        error: 'No image or SVG was produced.',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        imageUrl: finalImageUrl,
        prompt: result?.prompt || null,
        model: result?.model || 'mock',
        mode: result?.mode || mode,
        r2Key,
        mapped,
      },
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo] error:', err);
    const tEnd = Date.now();
    console.log('[perf][generate-logo] total request time (error) ms =', tEnd - requestStart);

    // 仍然返回 200，避免 Elementor 直接报 Webhook error（先保证链路不断）
    return res.status(200).json({
      success: false,
      data: null,
      error: err?.message || 'Internal error',
    });
  }
});
router.post("/generate-logo-direct", async (req, res) => {
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

// POST /generate-logo-pipeline  (temporarily: single-candidate, no multi-model pipeline)
router.post('/generate-logo-pipeline', async (req, res) => {
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
