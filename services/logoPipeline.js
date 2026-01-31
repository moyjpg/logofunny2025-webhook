const { generateLogoMock, buildPromptFromBody } = require("./logoGenerateMock");
const { uploadLogoImageToR2, uploadBufferToR2 } = require("./r2Upload");
const { scoreImageUrl, scoreImageBuffer } = require("./designScore");
const { judgeLogo, getOpenAIConfig, isCommercialLogoPass } = require("./openaiJudge");
const { maybeGenerateMagicPrompt, shouldUseMagicPrompt } = require("./promptMagic");
const fetch = require("node-fetch");
const sharp = require("sharp");

const STYLE_VARIANTS_BY_TYPE = {
  wordmark: [
    "pure wordmark, typography-only, clean kerning, no icon",
    "wordmark-only, modern sans, balanced spacing, no icon",
    "wordmark-only, geometric sans, clean ligatures, no icon",
    "wordmark-only, minimal, high legibility, no icon",
  ],
  lettermark: [
    "monogram / lettermark, interlocking letters, no icon",
    "lettermark, fused strokes, shared stems, no icon",
    "monogram, negative space overlap, no icon",
    "lettermark, grid-based, sharp lines, no icon",
  ],
  icon: [
    "minimal geometric mark, single abstract symbol, no illustration",
    "negative space logo, simple cutouts, no illustration",
    "tech geometric, grid-based, sharp lines, no illustration",
    "ultra-minimal flat vector, single mark, no illustration",
  ],
  auto: [
    "pure wordmark, clean kerning, no icon",
    "monogram / lettermark, interlocking letters, no icon",
    "minimal geometric mark, single symbol, no illustration",
    "negative space logo, simple cutouts, no illustration",
    "tech geometric, grid-based, sharp lines, no illustration",
    "luxury minimal, elegant spacing, no illustration",
  ],
};

const LOGO_RULE_BLOCK = `
LOGO RULES (STRICT, MUST FOLLOW):
- Output must look like a REAL commercial logo suitable for trademark registration.
- Single logo only. ONE mark (either: wordmark OR monogram OR one abstract symbol).
- Plain background. Centered composition. No extra decorations.
- Flat vector logo style (no photo, no 3D, no gradients, no shadows).
- Geometric / minimal / grid-based structure.
- High legibility at small sizes.

ABSOLUTELY FORBIDDEN (if any appear, the result is INVALID):
- Any people / humans / characters / mascots / animals.
- Any scenes / environments / storytelling / objects held by characters.
- Any illustration style (cartoon, outline人物, doodle, clipart).
- Any complex multi-object composition.

TEXT RULES:
- If the logo contains text, the brand name must be clean, readable, and correctly spelled.
- Prefer: wordmark-only or lettermark/monogram when brand name is short.
`;

function buildPromptVariants(basePrompt, count, logoType = "auto") {
  const variants = [];
  const key = ["wordmark", "lettermark", "icon"].includes(String(logoType))
    ? String(logoType)
    : "auto";
  const styles = STYLE_VARIANTS_BY_TYPE[key] || STYLE_VARIANTS_BY_TYPE.auto;

  for (let i = 0; i < count; i += 1) {
    const style = styles[i % styles.length];
    variants.push(`${basePrompt}, style: ${style}`);
  }
  return variants;
}

async function generateCandidate(mapped, prompt, index) {
  const inputImageUrl =
    mapped?.inputImageUrl ||
    mapped?.uploadImageUrl ||
    mapped?.referenceImageUrl ||
    null;

  const result = await generateLogoMock({
    ...mapped,
    promptOverride: prompt,
    inputImageUrl,
    mode: inputImageUrl ? "img2img" : "text2img",
  });
  const imageUrl = result?.imageUrl || null;

  let score = null;
  let finalImageUrl = imageUrl;
  let r2Key = null;
  let svgUrl = null;
  let svgKey = null;

  if (imageUrl) {
    try {
      let buffer = null;
      let contentType = "";
      const isDataUrl = /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(imageUrl);

      if (isDataUrl) {
        const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        contentType = match ? match[1] : "image/png";
        buffer = Buffer.from(match ? match[2] : "", "base64");
      } else {
        const res = await fetch(imageUrl);
        contentType = res.headers.get("content-type") || "";
        const arrayBuffer = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      }

      const isSvg = contentType.includes("image/svg+xml") || imageUrl.toLowerCase().includes(".svg");

      if (isSvg) {
        const svgUploaded = await uploadBufferToR2(buffer, "image/svg+xml");
        svgUrl = svgUploaded.publicUrl;
        svgKey = svgUploaded.key;

        const pngBuffer = await sharp(buffer).resize(1024, 1024, { fit: "inside" }).png().toBuffer();
        const pngUploaded = await uploadBufferToR2(pngBuffer, "image/png");
        finalImageUrl = pngUploaded.publicUrl;
        r2Key = pngUploaded.key;
        score = await scoreImageBuffer(pngBuffer);
      } else {
        const uploaded = await uploadBufferToR2(buffer, contentType || "image/png");
        finalImageUrl = uploaded.publicUrl;
        r2Key = uploaded.key;
        score = await scoreImageBuffer(buffer);
      }
    } catch (uploadErr) {
      console.error("[pipeline] R2 upload failed:", uploadErr);
    }
  }

  if (!score && finalImageUrl) {
    score = await scoreImageUrl(finalImageUrl);
  }

  return {
    candidateId: index + 1,
    promptUsed: prompt,
    imageUrl: finalImageUrl,
    r2Key,
    svgUrl,
    svgKey,
    score,
    model: result?.model || "mock",
    mode: result?.mode || "text2img",
  };
}

async function runLogoPipeline(mapped, options = {}) {
  // A1: For V1 frontend, keep generation count aligned with UI (1–3)
  const requestedCount = Math.max(1, Math.min(3, Number(options.count ?? 1)));
  // topN should never exceed requestedCount; default to requestedCount
  const topN = Math.max(1, Math.min(requestedCount, Number(options.topN ?? requestedCount)));

  const maxParallelEnv = Number.parseInt(process.env.PIPELINE_MAX_PARALLEL, 10);
  const maxParallel = Number.isFinite(maxParallelEnv) ? maxParallelEnv : 2;

  const logoTypeRaw = options.logoType ?? mapped?.logoType ?? "auto";
  const logoType = ["wordmark", "lettermark", "icon"].includes(String(logoTypeRaw))
    ? String(logoTypeRaw)
    : "auto";

  const inputImageUrl =
    mapped?.inputImageUrl ||
    mapped?.uploadImageUrl ||
    mapped?.referenceImageUrl ||
    null;

  const basePrompt = mapped?.promptOverride || buildPromptFromBody(mapped);
  const seedPrompt = `${basePrompt}\n\nLOGO TYPE: ${logoType}\n\n${LOGO_RULE_BLOCK}\n\nNEGATIVE (HARD AVOID):\npeople, person, human, character, mascot, animal, cartoon, illustration, scene, background elements, hands, tools, ladders, workers, builders, sticker, clipart, sketch, outline drawing`;

  let finalSeedPrompt = seedPrompt;

  // A1.5: Magic prompt is allowed ONLY as style refinement,
  // never to override logo structure rules.
  if (shouldUseMagicPrompt(mapped, options)) {
    const magic = await maybeGenerateMagicPrompt(mapped, seedPrompt);
    if (magic) {
      finalSeedPrompt = `${seedPrompt}\n\nMAGIC REFINEMENT (STYLE ONLY — must NOT introduce forbidden items):\n${magic}`;
    }
  }

  // LLM judge toggle
  const llmEnabled = String(process.env.USE_LLM || "").toLowerCase() !== "false";
  const openaiCfg = llmEnabled ? getOpenAIConfig() : null;

  // Hard-gated pipeline: keep generating until we have enough passing candidates
  const maxAttemptsEnv = Number.parseInt(process.env.PIPELINE_MAX_ATTEMPTS, 10);
  const maxAttempts = Number.isFinite(maxAttemptsEnv)
    ? maxAttemptsEnv
    : Math.max(6, requestedCount * 6);

  // We will try multiple style variants; cycle deterministically for debuggability.
  const stylePool = STYLE_VARIANTS_BY_TYPE[
    ["wordmark", "lettermark", "icon"].includes(String(logoType)) ? String(logoType) : "auto"
  ] || STYLE_VARIANTS_BY_TYPE.auto;

  const candidates = [];
  const passing = [];

  const debug = {
    attempted: 0,
    maxAttempts,
    requestedCount,
    topN,
    llmEnabled: Boolean(openaiCfg),
    disqualified: 0,
    pass: 0,
    reasons: {
      commercial_gate: 0,
      hasPeople: 0,
      hasMascot: 0,
      hasScene: 0,
      tooIllustrative: 0,
      judge_failed: 0,
    },
    stoppedBecause: "unknown",
  };

  async function judgeAndTag(candidate) {
    if (!openaiCfg) return candidate;

    try {
      const judge = await judgeLogo(candidate.imageUrl, mapped, { r2Key: candidate.r2Key });

      // LLM judge fields
      candidate.llmScore = judge?.score ?? null;
      candidate.llmBreakdown = judge?.breakdown || null;
      candidate.llmNotes = judge?.notes || null;

      // === COMMERCIAL LOGO HARD GATE ===
      const commercialPass = isCommercialLogoPass(judge);
      candidate.commercialPass = commercialPass;

      if (!commercialPass) {
        candidate.disqualified = true;
        candidate.disqualifyReason = {
          type: "commercial_gate",
          detail: judge?.violations || null,
        };
        candidate.llmScore = 0;
        candidate.finalScore = -999;
        debug.disqualified += 1;
        debug.reasons.commercial_gate += 1;
        return candidate;
      }

      // Hard disqualify if any people/characters/mascots/scenes are detected
      const v = judge?.violations || null;
      const hasPeople =
        v?.hasPeople === true ||
        v?.hasHuman === true ||
        v?.people === true ||
        judge?.hasPeople === true ||
        judge?.hasHuman === true;
      const hasMascot =
        v?.hasMascot === true ||
        v?.hasCharacter === true ||
        judge?.hasMascot === true;
      const hasScene =
        v?.hasScene === true ||
        v?.hasEnvironment === true ||
        judge?.hasScene === true;
      const tooIllustrative =
        v?.tooIllustrative === true ||
        v?.illustration === true ||
        judge?.tooIllustrative === true;

      candidate.violations = v;

      if (hasPeople || hasMascot || hasScene || tooIllustrative) {
        candidate.disqualified = true;
        candidate.disqualifyReason = {
          hasPeople,
          hasMascot,
          hasScene,
          tooIllustrative,
        };
        candidate.llmScore = 0;
        candidate.finalScore = -999;

        debug.disqualified += 1;
        if (hasPeople) debug.reasons.hasPeople += 1;
        if (hasMascot) debug.reasons.hasMascot += 1;
        if (hasScene) debug.reasons.hasScene += 1;
        if (tooIllustrative) debug.reasons.tooIllustrative += 1;
      }

      return candidate;
    } catch (err) {
      console.error("[pipeline] LLM judge failed:", err);
      candidate.disqualified = true;
      candidate.disqualifyReason = { type: "judge_failed" };
      candidate.llmScore = 0;
      candidate.finalScore = -999;
      debug.disqualified += 1;
      debug.reasons.judge_failed += 1;
      return candidate;
    }
  }

  // Generate in batches for speed, but stop early once we have enough passing.
  while (debug.attempted < maxAttempts && passing.length < topN) {
    const remainingAttempts = maxAttempts - debug.attempted;
    const batchSize = Math.min(maxParallel, remainingAttempts, Math.max(1, topN - passing.length));

    const batchPrompts = [];
    for (let j = 0; j < batchSize; j += 1) {
      const style = stylePool[(debug.attempted + j) % stylePool.length];
      batchPrompts.push(`${finalSeedPrompt}, style: ${style}`);
    }

    const batchResults = await Promise.all(
      batchPrompts.map((p, idx) => generateCandidate(mapped, p, debug.attempted + idx))
    );

    debug.attempted += batchResults.length;

    for (const c of batchResults) {
      candidates.push(c);
    }

    // Judge each candidate (if enabled) and collect passing
    for (const c of batchResults) {
      // If no image, disqualify
      if (!c.imageUrl) {
        c.disqualified = true;
        c.disqualifyReason = { type: "no_image" };
        c.finalScore = -999;
        debug.disqualified += 1;
        continue;
      }

      await judgeAndTag(c);

      if (!c.disqualified) {
        const ruleScore = c.score?.score ?? 0;
        const llmScore = typeof c.llmScore === "number" ? c.llmScore : ruleScore;
        const final = ruleScore * 0.6 + llmScore * 0.4;
        c.finalScore = Math.round(final);
        passing.push(c);
        debug.pass += 1;
      }

      if (passing.length >= topN) break;
    }
  }

  debug.stoppedBecause = passing.length >= topN ? "enough_passing" : "max_attempts";

  // Ranking: passing first (by finalScore), then everything else (rule score)
  const rankedPassing = [...passing].sort((a, b) => (b.finalScore ?? -999) - (a.finalScore ?? -999));
  const rankedAll = [...candidates].sort((a, b) => {
    const da = a.disqualified ? 1 : 0;
    const db = b.disqualified ? 1 : 0;
    if (da !== db) return da - db;

    const fa = typeof a.finalScore === "number" ? a.finalScore : (a.score?.score ?? -1);
    const fb = typeof b.finalScore === "number" ? b.finalScore : (b.score?.score ?? -1);
    return fb - fa;
  });

  // If LLM judge is off, keep old rule-only behavior (but still deterministic)
  let rankingMethod = "rule_only";
  let top = [];

  if (!openaiCfg) {
    const ruleRanked = [...candidates].sort((a, b) => {
      const sa = a.score?.score ?? -1;
      const sb = b.score?.score ?? -1;
      return sb - sa;
    });
    top = ruleRanked.slice(0, topN);
    rankingMethod = "rule_only";
  } else {
    top = rankedPassing.slice(0, topN);
    rankingMethod = "rule_plus_llm_hard_gate";
  }

  return {
    input: {
      hasImage: Boolean(inputImageUrl),
      logoType,
    },
    meta: {
      llmEnabled: Boolean(openaiCfg),
      pipelineMaxParallel: maxParallel,
      debug,
    },
    requestedCount,
    topN,
    candidates: rankedAll,
    top,
    rankingMethod,
  };
}

module.exports = {
  runLogoPipeline,
};
