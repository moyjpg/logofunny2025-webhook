const { generateLogoMock, buildPromptFromBody } = require("./logoGenerateMock");
const { uploadLogoImageToR2, uploadBufferToR2 } = require("./r2Upload");
const { scoreImageUrl, scoreImageBuffer } = require("./designScore");
const { judgeLogo, getOpenAIConfig } = require("./openaiJudge");
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
  const count = requestedCount;
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

  const promptVariants = buildPromptVariants(finalSeedPrompt, count, logoType);

  const candidates = [];
  for (let i = 0; i < promptVariants.length; i += maxParallel) {
    const batch = promptVariants.slice(i, i + maxParallel);
    const results = await Promise.all(
      batch.map((p, idx) => generateCandidate(mapped, p, i + idx))
    );
    candidates.push(...results);
  }

  const ruleRanked = [...candidates].sort((a, b) => {
    const sa = a.score?.score ?? -1;
    const sb = b.score?.score ?? -1;
    return sb - sa;
  });

  const llmEnabled = String(process.env.USE_LLM || "").toLowerCase() !== "false";
  const openaiCfg = llmEnabled ? getOpenAIConfig() : null;
  let ranked = ruleRanked;
  let rankingMethod = "rule_only";

  if (openaiCfg) {
    // Judge only up to what we actually generated, and keep it modest
    const llmTopK = Math.max(1, Math.min(5, Number(options.llmTopK ?? 3), ruleRanked.length));
    const judgeTargets = ruleRanked.slice(0, llmTopK);

    for (const candidate of judgeTargets) {
      try {
        const judge = await judgeLogo(candidate.imageUrl, mapped, { r2Key: candidate.r2Key });

        // LLM judge fields
        candidate.llmScore = judge?.score ?? null;
        candidate.llmBreakdown = judge?.breakdown || null;
        candidate.llmNotes = judge?.notes || null;

        // A1.5-2: hard disqualify if any people/characters/mascots/scenes are detected
        // Support multiple possible return shapes to stay backward-compatible.
        const v = judge?.violations || null;
        const hasPeople =
          v?.hasPeople === true ||
          v?.hasHuman === true ||
          v?.people === true ||
          judge?.hasPeople === true ||
          judge?.hasHuman === true;
        const hasMascot = v?.hasMascot === true || v?.hasCharacter === true || judge?.hasMascot === true;
        const hasScene = v?.hasScene === true || v?.hasEnvironment === true || judge?.hasScene === true;
        const tooIllustrative = v?.tooIllustrative === true || v?.illustration === true || judge?.tooIllustrative === true;

        candidate.violations = v;

        if (hasPeople || hasMascot || hasScene || tooIllustrative) {
          candidate.disqualified = true;
          candidate.disqualifyReason = {
            hasPeople,
            hasMascot,
            hasScene,
            tooIllustrative,
          };
          // Force it to the bottom no matter what the other scores say
          candidate.llmScore = 0;
          candidate.finalScore = -999;
        }
      } catch (err) {
        console.error("[pipeline] LLM judge failed:", err);
      }
    }

    ranked = [...candidates].sort((a, b) => {
      // Always push disqualified candidates to the bottom
      const da = a.disqualified ? 1 : 0;
      const db = b.disqualified ? 1 : 0;
      if (da !== db) return da - db;

      const ruleA = a.score?.score ?? 0;
      const ruleB = b.score?.score ?? 0;
      const llmA = typeof a.llmScore === "number" ? a.llmScore : ruleA;
      const llmB = typeof a.llmScore === "number" ? a.llmScore : ruleB;
      const finalA = ruleA * 0.6 + llmA * 0.4;
      const finalB = ruleB * 0.6 + llmB * 0.4;

      // Keep any pre-set disqualify finalScore
      if (typeof a.finalScore !== "number") a.finalScore = Math.round(finalA);
      if (typeof b.finalScore !== "number") b.finalScore = Math.round(finalB);

      return finalB - finalA;
    });

    rankingMethod = "rule_plus_llm";
  }

  return {
    input: {
      hasImage: Boolean(inputImageUrl),
      logoType,
    },
    meta: {
      llmEnabled: Boolean(openaiCfg),
      pipelineMaxParallel: maxParallel,
    },
    requestedCount,
    topN,
    candidates,
    // Keep top aligned to requestedCount/topN and skip disqualified ones first
    top: ranked.filter((c) => !c.disqualified).slice(0, topN),
    rankingMethod,
  };
}

module.exports = {
  runLogoPipeline,
};
