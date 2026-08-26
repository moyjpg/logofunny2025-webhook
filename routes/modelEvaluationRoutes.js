const express = require("express");
const {
  buildEvaluationRun,
  normalizeScore,
} = require("../services/logoModelEvaluation");
const {
  generateRecraftVectorSmokeTest,
} = require("../services/recraftEvaluationService");

const router = express.Router();

function requireInternalKey(req, res, next) {
  const serverKey = process.env.LOGOFUNNY_INTERNAL_API_KEY;
  if (!serverKey) {
    return res.status(500).json({ ok: false, error: "Internal API key is not configured." });
  }
  if (req.headers["x-logofunny-internal-key"] !== serverKey) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}

function requireEvaluationFlag(_req, res, next) {
  if (process.env.LOGOFUNNY_MODEL_EVAL_ENABLED !== "true") {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  return next();
}

// Internal planning only. This route never calls an image provider, spends
// credits, writes a creation, or persists an uploaded image.
router.post("/prepare", requireInternalKey, requireEvaluationFlag, (req, res) => {
  const evaluation = buildEvaluationRun(req.body?.internal_brand_brief, {
    providers: req.body?.providers,
  });
  if (!evaluation) {
    return res.status(400).json({ ok: false, error: "Invalid internal evaluation brief or provider pair." });
  }
  return res.status(200).json({ ok: true, data: evaluation });
});

// Validates a rater's score packet only. Storage and provider invocation stay
// deliberately outside this zero-side-effect evaluation preparation route.
router.post("/validate-score", requireInternalKey, requireEvaluationFlag, (req, res) => {
  const score = normalizeScore(req.body?.score);
  if (!score) return res.status(400).json({ ok: false, error: "Invalid score packet." });
  return res.status(200).json({ ok: true, data: score });
});

// This is deliberately a one-image, operator-confirmed smoke test. It spends
// prepaid Recraft API Units only; it never charges a LogoFunny user, creates a
// saved creation, or exposes the provider result to the public product flow.
router.post("/recraft-vector-smoke-test", requireInternalKey, requireEvaluationFlag, async (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(400).json({
      ok: false,
      error: "Explicit confirm: true is required before spending Recraft API Units.",
    });
  }

  try {
    const result = await generateRecraftVectorSmokeTest(req.body?.internal_brand_brief);
    return res.status(200).json({ ok: true, data: result });
  } catch (error) {
    console.error("[model-evaluation] Recraft vector smoke test failed:", error?.message || error);
    return res.status(502).json({ ok: false, error: "Recraft vector smoke test failed." });
  }
});

module.exports = router;
