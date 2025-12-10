const express = require('express');
const { generateLogoMock } = require('../services/logoGenerateMock');

const router = express.Router();
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
        const body = req.body || {};
        const { brandName, keywords } = body;

        // 简单校验：至少要有 brandName 或 keywords
        if (!brandName && !keywords) {
            return res.status(400).json({
                success: false,
                data: null,
                error: 'Missing required fields: at least brandName or keywords is required.'
            });
        }

        console.log('[/generate-logo] incoming body:', body);

        const result = await generateLogoMock(body);

        // ====== 这里把任何奇怪的结构都“拍平”成一个 imageUrl ======
        let imageUrl = null;

        if (typeof result === 'string') {
            // 如果 generateLogoMock 直接返回 string
            imageUrl = result;
        } else if (result && typeof result.imageUrl === 'string') {
            // { imageUrl: "data:..." }
            imageUrl = result.imageUrl;
        } else if (
            result &&
            result.imageUrl &&
            typeof result.imageUrl.imageUrl === 'string'
        ) {
            // { imageUrl: { imageUrl: "data:..." } }
            imageUrl = result.imageUrl.imageUrl;
        }

        return res.status(200).json({
            success: true,
            data: {
                imageUrl,                // ✅ 前端只用这一条就够了
                prompt: result.prompt || null,
                model: result.model || null,
                mode: result.mode || null
            },
            error: null
        });

    } catch (err) {
        console.error('[/generate-logo] error:', err);
        return res.status(500).json({
            success: false,
            data: null,
            error: 'Internal server error in /generate-logo'
        });
    }
});

module.exports = router;