const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');
const { uploadLogoImageToR2, uploadLogoSvgTextToR2 } = require('../services/r2Upload');
// const { runLogoPipeline } = require('../services/logoPipeline'); // temporarily disabled: single-candidate mode

const router = express.Router();

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
  console.log('[HIT] /generate-logo -> routes/logoApiRoutes.js')
  console.log('[BODY]', req.body)
  const requestStart = Date.now();
  console.log('[perf][generate-logo] request start at', new Date(requestStart).toISOString());
  try {
    // 1) 把 Elementor 原始 body 显示出来（保留，方便排错）
    console.log('[generate-logo] body keys =', Object.keys(req.body || {}));
    const safe = JSON.parse(JSON.stringify(req.body || {}));

    // 常见“炸弹字段”兜底：如果有就用占位符替换
    if (safe?.fields?.uploadLogo) safe.fields.uploadLogo = "[uploadLogo present]";
    if (safe?.fields?.uploadImage) safe.fields.uploadImage = "[uploadImage present]";
    if (safe?.form?.fields?.uploadLogo) safe.form.fields.uploadLogo = "[uploadLogo present]";
    if (safe?.form?.fields?.uploadImage) safe.form.fields.uploadImage = "[uploadImage present]";

    console.log("[generate-logo] body preview =", JSON.stringify(safe, null, 2));

    // 2) 字段映射：Elementor -> AI 输入
    const mapped = mapElementorToAI(req.body);
    console.log('[generate-logo] mapped fields:', mapped);

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
        console.log('[generate-logo] SVG uploaded to R2:', uploadedSvg.svgUrl);
        const tEnd = Date.now();
        console.log('[perf][generate-logo] total request time ms =', tEnd - requestStart);
        return res.status(200).json({
          success: true,
          data: {
            svgUrl: uploadedSvg.svgUrl,
            imageUrl: null,
            prompt: result?.prompt || null,
            model: result?.model || 'mock',
            mode: result?.mode || (mapped.uploadImage ? 'img2img' : 'text2img'),
            r2Key: uploadedSvg.r2Key,
            mapped, // ✅ 先一起回传，方便你肉眼确认字段没丢。等稳定后我们再删掉
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

    // 7) 统一返回格式（给 Elementor/前端用）
    const tEnd = Date.now();
    console.log('[perf][generate-logo] total request time ms =', tEnd - requestStart);
    return res.status(200).json({
      success: true,
      data: {
        imageUrl: finalImageUrl,
        prompt: result?.prompt || null,
        model: result?.model || 'mock',
        mode: result?.mode || (mapped.uploadImage ? 'img2img' : 'text2img'),
        r2Key,
        mapped, // ✅ 先一起回传，方便你肉眼确认字段没丢。等稳定后我们再删掉
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
