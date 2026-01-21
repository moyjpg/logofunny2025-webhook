const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');

const router = express.Router();

// --- Elementor → AI 字段映射器（兼容 body.fields / 直接 body / curl） ---
function mapElementorToAI(body) {
  // 兼容：Elementor(常见) body.fields / 有些版本 body.form.fields / 你 curl 可能直接传 body
  const f = body?.fields || body?.form?.fields || body || {};

  // 允许传多个 key（camelCase / snake_case 都试一遍）
  const pick = (...keys) => {
    for (const key of keys) {
      const field = f?.[key];
      if (field === undefined || field === null) continue;

      // ✅ 1) curl 直接传字符串/数组
      if (typeof field === "string" || typeof field === "number" || typeof field === "boolean") {
        return String(field).trim();
      }
      if (Array.isArray(field)) return field;

      // ✅ 2) Elementor 传对象：{ value } / { raw_value }
      if (typeof field === "object") {
        const v = field.value ?? field.raw_value ?? field.url ?? field;
        if (Array.isArray(v)) return v;
        if (v === undefined || v === null) continue;
        return String(v).trim();
      }
    }
    return "";
  };

  const color = pick("colorTheme", "color_theme");
  return {
    brandName: pick("brandName", "brand_name"),
    tagline: pick("brandTagline", "brand_tagline", "tagline"),
    keywords: pick("keywords"),
    industry: pick("industry"),

    // 统一成数组（checkbox 多选）
    colorTheme: Array.isArray(color) ? color : color ? [color] : [],

    styleFont: pick("brandFontStyle", "brand_font_style", "styleFont"),
    taglineFont: pick("taglineFontStyle", "tagline_font_style", "taglineFont"),
    notes: pick("notes", "otherNotes", "other_notes"),

    // 上传字段（你现在字段叫 uploadLogo）
    uploadImage: pick("uploadLogo", "upload_logo") || null,
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
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Missing required fields: please provide Brand Name or Keywords.',
      });
    }

    // 4) 真正调用生成（先接你现有的 generateLogoMock，让链路先跑通）
    //    你现在顶部引入的是：const { generateLogoMock } = require('../services/logoGenerateMock');
    const result = await generateLogoMock(mapped);

    // 5) 兼容不同返回结构：提取 imageUrl
    let imageUrl = null;
    if (typeof result === 'string') {
      imageUrl = result;
    } else if (result && typeof result.imageUrl === 'string') {
      imageUrl = result.imageUrl;
    } else if (result && result.data && typeof result.data.imageUrl === 'string') {
      imageUrl = result.data.imageUrl;
    }

    // 6) 统一返回格式（给 Elementor/前端用）
    return res.status(200).json({
      success: true,
      data: {
        imageUrl,
        prompt: result?.prompt || null,
        model: result?.model || 'mock',
        mode: result?.mode || (mapped.uploadImage ? 'img2img' : 'text2img'),
        mapped, // ✅ 先一起回传，方便你肉眼确认字段没丢。等稳定后我们再删掉
      },
      error: null,
    });
  } catch (err) {
    console.error('[generate-logo] error:', err);

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
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
module.exports = router;