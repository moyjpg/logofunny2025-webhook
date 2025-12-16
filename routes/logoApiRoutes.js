const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');

const router = express.Router();

// --- Elementor → AI 字段映射器（以 body.fields 为准） ---
function mapElementorToAI(body) {
  // Elementor 的字段通常在 body.fields
  const f = body?.fields || body?.form?.fields || {};

  const pick = (key) => {
    const field = f?.[key];
    if (!field) return "";

    // Elementor 常见：value / raw_value
    const v = field.value ?? field.raw_value ?? "";

    // checkbox 多选时可能是数组
    if (Array.isArray(v)) return v;

    return String(v || "").trim();
  };

  return {
    brandName: pick("brand_name"),
    tagline: pick("brand_tagline"),
    keywords: pick("keywords"),
    industry: pick("industry"),

    // 这里可能是数组（多选），也可能是字符串
    colorTheme: pick("color_theme"),

    styleFont: pick("brand_font_style"),
    taglineFont: pick("tagline_font_style"),
    notes: pick("other_notes"),

    // 上传字段：Elementor 可能给空、也可能给 URL/对象，先占位不影响打通
    uploadImage: pick("upload_logo") || null,
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

// POST /generate-logo
router.post('/generate-logo', async (req, res) => {
  try {
    console.log('[generate-logo] RAW body:', JSON.stringify(req.body, null, 2));

    const mapped = mapElementorToAI(req.body);

    console.log('[generate-logo] mapped fields:', mapped);

    // 暂时先返回 mapped，确认字段正确
    return res.json({
      ok: true,
      mapped
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;