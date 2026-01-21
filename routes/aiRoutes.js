// routes/aiRoutes.js
const express = require("express");
const router = express.Router();

const { buildPrompts } = require("../utils/promptEngine");
const { generateSvgFromPrompt, svgToPngBuffer } = require("../services/aiGenerateService");

router.post("/generate__ai", async (req, res) => {
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

    // 如果你想 strict_safe=true 时强制拦截非 SAFE_B4，可打开下面这段：
    // if (meta.logo_type === "letter" && meta.strict_safe && !meta.use_safe_b4) {
    //   return res.status(400).json({ ok: false, error: "strict_safe enabled: letter not in SAFE_B4", meta });
    // }

    // 真实生成：把 prompt + magic_prompt 合并
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

module.exports = router;