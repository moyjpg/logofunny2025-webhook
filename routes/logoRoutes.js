// Express router that defines API endpoints related to logo generation
// The route below simulates a future AI logo generation endpoint.

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const {
  generateMockLogo,
  generateLogoWithImage,
  generateLogoFromText,
} = require('../services/logoService');

// 把原始 body 转成内部统一格式
function normalizePayload(body = {}) {
  return {
    brandName: body.brandName || '',
    tagline: body.tagline || '',
    keywords: body.keywords || '',
    colorTheme: body.colorTheme || '',
    brandFontStyle: body.brandFontStyle || '',
    taglineFontStyle: body.taglineFontStyle || '',
    notes: body.notes || '',
    industry: body.industry || '',
    logoUrl: body.logoUrl || null,
  };
}

// POST /test-generate-logo
// Accepts a JSON body and returns a mock logo preview response.
router.post('/test-generate-logo', async (req, res) => {
  try {
    const result = await generateMockLogo(req.body);
    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    logger.error(`Route handler error: ${err && err.message ? err.message : String(err)}`);
    return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
  }
});

// 正式的生成接口（以后给 WordPress webhook 用）
// 根据占位字段 hasImage 决定调用不同的生成逻辑（当前均为 mock）
router.post('/generate-logo', async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const hasImage = Boolean(payload.logoUrl);

    const result = hasImage
      ? await generateLogoWithImage(payload)
      : await generateLogoFromText(payload);

    const status = result.success ? 200 : 400;
    return res.status(status).json(result);
  } catch (err) {
    logger.error(`Route /generate-logo error: ${err && err.message ? err.message : String(err)}`);
    return res.status(500).json({ success: false, data: null, error: 'Internal server error' });
  }
});

module.exports = router;
