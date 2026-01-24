const { generateLogoMock, buildPromptFromBody } = require("./logoGenerateMock");
const { uploadLogoImageToR2 } = require("./r2Upload");
const { scoreImageUrl } = require("./designScore");
const { judgeLogo, getOpenAIConfig } = require("./openaiJudge");
const { maybeGenerateMagicPrompt, shouldUseMagicPrompt } = require("./promptMagic");

const STYLE_VARIANTS = [
  "bold geometric mark, strong silhouette",
  "monoline minimal icon, thin strokes",
  "rounded friendly shapes, soft corners",
  "sharp angular forms, tech-forward",
  "luxury premium feel, elegant spacing",
  "playful modern icon, simple shapes",
  "abstract emblem, balanced symmetry",
  "clean wordmark emphasis, minimal icon",
  "negative space concept, clever cutouts",
  "flat vector, ultra-minimal",
];

function buildPromptVariants(basePrompt, count) {
  const variants = [];
  for (let i = 0; i < count; i += 1) {
    const style = STYLE_VARIANTS[i % STYLE_VARIANTS.length];
    variants.push(`${basePrompt}, style: ${style}`);
  }
  return variants;
}

async function generateCandidate(mapped, prompt, index) {
  const result = await generateLogoMock({ ...mapped, promptOverride: prompt });
  const imageUrl = result?.imageUrl || null;

  let score = null;
  if (imageUrl) {
    score = await scoreImageUrl(imageUrl);
  }

  let finalImageUrl = imageUrl;
  let r2Key = null;
  if (imageUrl) {
    try {
      const uploaded = await uploadLogoImageToR2(imageUrl);
      finalImageUrl = uploaded.publicUrl;
      r2Key = uploaded.key;
    } catch (uploadErr) {
      console.error("[pipeline] R2 upload failed:", uploadErr);
    }
  }

  return {
    candidateId: index + 1,
    promptUsed: prompt,
    imageUrl: finalImageUrl,
    r2Key,
    score,
    model: result?.model || "mock",
    mode: result?.mode || "text2img",
  };
}

async function runLogoPipeline(mapped, options = {}) {
  const count = Math.max(1, Math.min(10, options.count || 5));
  const topN = Math.max(1, Math.min(3, options.topN || 3));
  const maxParallelEnv = Number.parseInt(process.env.PIPELINE_MAX_PARALLEL, 10);
  const maxParallel = Number.isFinite(maxParallelEnv) ? maxParallelEnv : 2;

  const seedPrompt = mapped?.promptOverride || buildPromptFromBody(mapped);
  let finalSeedPrompt = seedPrompt;

  if (shouldUseMagicPrompt(mapped, options)) {
    const magic = await maybeGenerateMagicPrompt(mapped, seedPrompt);
    if (magic) {
      finalSeedPrompt = `${seedPrompt} / ${magic}`;
    }
  }

  const promptVariants = buildPromptVariants(finalSeedPrompt, count);

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

  const openaiCfg = getOpenAIConfig();
  let ranked = ruleRanked;
  let rankingMethod = "rule_only";

  if (openaiCfg) {
    const llmTopK = Math.max(1, Math.min(5, options.llmTopK || 3));
    const judgeTargets = ruleRanked.slice(0, llmTopK);

    for (const candidate of judgeTargets) {
      try {
        const judge = await judgeLogo(candidate.imageUrl, mapped, { r2Key: candidate.r2Key });
        candidate.llmScore = judge?.score ?? null;
        candidate.llmBreakdown = judge?.breakdown || null;
        candidate.llmNotes = judge?.notes || null;
      } catch (err) {
        console.error("[pipeline] LLM judge failed:", err);
      }
    }

    ranked = [...candidates].sort((a, b) => {
      const ruleA = a.score?.score ?? 0;
      const ruleB = b.score?.score ?? 0;
      const llmA = typeof a.llmScore === "number" ? a.llmScore : ruleA;
      const llmB = typeof b.llmScore === "number" ? b.llmScore : ruleB;
      const finalA = ruleA * 0.6 + llmA * 0.4;
      const finalB = ruleB * 0.6 + llmB * 0.4;
      a.finalScore = Math.round(finalA);
      b.finalScore = Math.round(finalB);
      return finalB - finalA;
    });

    rankingMethod = "rule_plus_llm";
  }

  return {
    candidates,
    top: ranked.slice(0, topN),
    rankingMethod,
  };
}

module.exports = {
  runLogoPipeline,
};
