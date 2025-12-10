const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');

const router = express.Router();

// --- Elementor → AI 字段映射器 ---
function mapElementorToAI(body) {
  const f = body?.form?.fields || {};

  return {
    brandName: f.brand_name?.value || "",
    tagline: f.brand_tagline?.value || "",
    keywords: f.keywords?.value || "",
    industry: f.industry?.value || "",
    colorTheme: Array.isArray(f.color_theme?.raw_value)
      ? f.color_theme.raw_value
      : (f.color_theme?.value ? [f.color_theme.value] : []),
    styleFont: f.brand_font_style?.value || "",
    taglineFont: f.tagline_font_style?.value || "",
    notes: f.other_notes?.value || "",
    uploadImage: f.upload_logo?.value || null,   // 后面我们会做文件代理，现在可为空
  };
}
router.post('/debug', (req, res) => {
  console.log('[/debug] headers:');
  console.log(JSON.stringify(req.headers, null, 2));

  console.log('[/debug] query:');
  console.log(JSON.stringify(req.query, null, 2));

  console.log('[/debug] body:');
  console.log(JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    success: true,
    route: '/debug',
    received: req.body,
  });
});
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