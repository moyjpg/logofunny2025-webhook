// services/onboardingFollowupService.js — Adaptive Follow-up Engine (P0.1)
//
// Scope: LOGOFUNNY_STUDIO_INPUT_CONTRACT_V1.md, Layer 1 -> Layer 2 only.
// Given the ongoing onboarding conversation, responds like a concise brand
// design director: reflect what matters, explain one useful implication, give
// one practical suggestion, and ask at most one plain-language question.
//
// This service does NOT build Creative Directions, model-specific prompts, or
// generate logos. It does not use professional design vocabulary. It may ask
// one everyday-language visual-foundation question when that answer would
// materially change the generated logo: whether the name should lead, whether
// a simple graphic should sit with the name, and whether a color family matters.
//
// P0.1a hardening: the "no professional jargon questions" rule is enforced
// twice -- once by instruction, in the system prompt (buildFollowupMessages),
// and once deterministically in code (isProfessionalDesignQuestion /
// filterProfessionalDesignQuestions), applied after parsing/normalization and
// before any question is returned. The code-level guardrail is the one that
// must hold even if the model ignores its instructions.
//
// Reversibility: this entire capability is gated by ONBOARDING_FOLLOWUP_ENABLED
// (see getFollowupConfig). When unset/false, or when the provider is
// unconfigured, or on any runtime failure, generateOnboardingFollowup returns
// a useful deterministic advisor reply -- it never throws into the caller and
// never blocks the existing generation flow.

const fetch = require("node-fetch");
const followupSchema = require("../contracts/onboarding-followup.v1.schema.json");

const MAX_QUESTIONS = 1;
const ALLOWED_CONVERSATION_LANGUAGES = new Set(["en", "zh-CN", "es", "ja"]);

function normalizeConversationLanguage(value, fallbackText = "") {
  if (ALLOWED_CONVERSATION_LANGUAGES.has(value)) return value;
  const text = String(fallbackText || "");
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\u3400-\u9fff]/.test(text)) return "zh-CN";
  if (/[¿¡ñáéíóúü]/i.test(text)) return "es";
  return "en";
}

/** Default LLM HTTP timeout (ms). Override with ONBOARDING_FOLLOWUP_FETCH_TIMEOUT_MS if set. */
// The caller may be waking a cold backend instance before the model call can
// begin. Keep this below the proxy budget, but do not fail a valid model turn
// just because startup used most of the former 20-second allowance.
const DEFAULT_FETCH_TIMEOUT_MS = 45_000;

function getFetchTimeoutMs() {
  const n = Number.parseInt(process.env.ONBOARDING_FOLLOWUP_FETCH_TIMEOUT_MS || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_FETCH_TIMEOUT_MS;
}

/**
 * Conversation AI has its own model/base-url configuration so it cannot
 * silently inherit the stronger Brand Advisor/Strategist model. The optional
 * API-key override can reuse OPENAI_API_KEY without creating another secret.
 */
function getFollowupConfig() {
  const enabled = String(process.env.ONBOARDING_FOLLOWUP_ENABLED || "").toLowerCase() === "true";
  return {
    enabled,
    provider: "openai_responses",
    apiKey: process.env.ONBOARDING_CONVERSATION_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.ONBOARDING_CONVERSATION_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    // Conversation is a bounded, high-volume task; keep the model separately
    // configurable from the stronger strategist while providing a current
    // low-cost default. The feature flag still has to be enabled explicitly.
    model: process.env.ONBOARDING_CONVERSATION_MODEL || "gpt-5.6-luna",
  };
}

function isFollowupConfigured(cfg) {
  return Boolean(cfg?.apiKey && cfg?.baseUrl && cfg?.model);
}

/**
 * Build prompt template -- plain-language brand guidance, JSON output only.
 */
function buildFollowupMessages(structured) {
  const responseLanguage = normalizeConversationLanguage(
    structured.conversation_language,
    structured.latest_message
  );
  const responseLanguageName = {
    en: "English",
    "zh-CN": "Simplified Chinese",
    es: "Spanish",
    ja: "Japanese",
  }[responseLanguage];
  const system = `You are LogoFunny's experienced brand design director. You are talking with an ordinary person who may know nothing about branding or design. Your job is to help them think, not merely collect fields.

For every turn:
- Directly respond to what the user just said or asked.
- Reflect one specific detail from their idea so the reply feels grounded.
- Explain one useful tradeoff or implication.
- Give one practical suggestion in everyday language.
- When the user asks for analysis or advice, lead with the analysis. Do not turn their request into another intake question.
- When there are two plausible directions, compare them briefly and recommend one, including why it better fits what the user has already said.
- If a new idea conflicts with an earlier goal, name the tension gently and suggest a way to keep the useful part of both.
- Ask at most one short question only when the answer would meaningfully improve the direction. Do not ask a question just to keep the chat going.
- Once the name, business, and desired feeling are known, check whether the user has made a visual foundation clear. If neither their choices nor their answers say whether the name should lead or a simple graphic should appear with the name, ask one plain-language visual-foundation question before ending the conversation. You may include color in that same question only when color is also unknown.
- Use ordinary language for that question. Good example: "For the logo itself, do you picture the name doing most of the work, or a simple graphic together with the name? Is there a color family you want me to keep in mind, or should I recommend one?" Do not use terms such as wordmark, monogram, layout, typography, serif, or logo type.
- Keep assistant_message to 2-4 short sentences. Write assistant_message, research confirmation text, and any question in ${responseLanguageName}. Brand names and exact logo text must never be translated, transliterated, or renamed.

Hard rules:
- Never say only "got it", "added", "noted", or another receipt-style acknowledgement.
- Never claim you searched the web, saw competitors, or found evidence. No research results are present in this endpoint.
- If the user asks about online research, say it is possible with their permission, explain what public information would be compared, say clearly that no search has happened yet, set research.offered=true, and ask what they want researched first.
- Never invent sources, competitors, customer facts, or market findings.
- Never ask something already answered, implied, or covered by the conversation.
- Never ask the user to choose professional design terms such as logo type, wordmark, lettermark, layout, detail level, typography, serif, or font category. Translate the underlying decision into everyday language instead.
- A visual idea the user volunteers is welcome. Analyze whether it may feel memorable, too literal, generic, or hard to use, then suggest a simpler or more ownable direction in plain language.
- Creative tension phrases such as "premium but playful" are useful direction, not a contradiction to resolve.
- ready_to_review should be true once the brand name, what it does, and a rough direction are known. It may still be true while the user keeps chatting.
- Return at most 1 question. "questions" may be empty.

Conversation-stage rules:
- When conversation_stage is "business", the user has described what they are building but may not have supplied exact logo text. Respond thoughtfully to the business first. Do not pretend that a brand name is known. Ask for the exact English name only when it is the material missing item and the user has not asked another substantive question; it is fine to keep discussing the idea first.
- When conversation_stage is "brand", the user has supplied exact logo text. Respond to both their business and name, and ask about the desired feeling only if that answer would materially improve the direction. Do not ask for the name again.
- At every later stage, continue the conversation from what is already known rather than restarting the intake.
- Do not force a question just because of a conversation stage. If one is useful, include it naturally in assistant_message and return questions as an empty array.

Output strict JSON only, no markdown, no code fences, no extra keys:
{"assistant_message":"2-4 short helpful sentences","ready_to_review":true,"research":{"offered":false,"reason":"","confirmation_question":""},"questions":[{"id":"short_stable_snake_case_id","question":"one short everyday-language question","reason":"short internal reason","target_field":"one of: audience | existing_visual_idea | things_to_avoid | rough_feeling | visual_foundation | other"}]}`;

  const user = `Onboarding conversation state:
${JSON.stringify(structured, null, 2)}

Respond to latest_message as a thoughtful brand guide. Return only the JSON object described.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function extractJsonObject(text) {
  const t = String(text || "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

function sanitizeId(raw, fallbackIndex) {
  const s = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || `followup_${fallbackIndex + 1}`;
}

const ALLOWED_TARGET_FIELDS = new Set([
  "audience",
  "existing_visual_idea",
  "things_to_avoid",
  "rough_feeling",
  "visual_foundation",
  "other",
]);

/**
 * Validates raw LLM output and de-duplicates. Never trusts array length,
 * item shape, count, or any needs_followup-style flag from the model -- only
 * "questions" is read, and even that is fully re-validated here.
 *
 * Deduplicates on two independent keys: the sanitized id AND the normalized
 * question text. A true duplicate (same id, or same question reworded with a
 * different id) is dropped outright rather than kept under a renamed id --
 * the goal is fewer, distinct questions, not more.
 *
 * Does NOT cap at MAX_QUESTIONS and does NOT apply the semantic design-topic
 * guardrail -- both happen later in the pipeline (see finalizeQuestions),
 * after this shape/dedup pass runs over the full candidate list. Capping
 * before the guardrail would risk discarding good candidates in favor of
 * bad ones that merely arrived earlier in the model's output.
 *
 * targetField is retained as optional internal metadata only (useful for
 * later Brief construction / logging). It is intentionally NOT part of the
 * public route response -- the public contract stays limited to
 * { id, question, reason } so the frontend never depends on internal Brand
 * Brief field names.
 *
 * @returns {Array<{id:string, question:string, reason:string, targetField:string}>}
 */
function normalizeQuestions(parsed) {
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.questions)) return [];

  const seenIds = new Set();
  const seenQuestionTexts = new Set();
  const out = [];

  for (const item of parsed.questions) {
    if (!item || typeof item !== "object") continue;

    const question = typeof item.question === "string" ? item.question.trim() : "";
    if (!question) continue;

    const questionKey = question.toLowerCase().replace(/\s+/g, " ");
    const id = sanitizeId(item.id, out.length);
    if (seenIds.has(id) || seenQuestionTexts.has(questionKey)) continue;
    seenIds.add(id);
    seenQuestionTexts.add(questionKey);

    const reason = typeof item.reason === "string" ? item.reason.trim().slice(0, 200) : "";
    const targetFieldRaw =
      typeof item.target_field === "string" ? item.target_field.trim().toLowerCase() : "";
    const targetField = ALLOWED_TARGET_FIELDS.has(targetFieldRaw) ? targetFieldRaw : "other";

    out.push({ id, question: question.slice(0, 300), reason, targetField });
  }

  return out;
}

/**
 * Deterministic semantic guardrail (P0.1a). Even if the LLM ignores its
 * prompt instructions, LogoFunny must never ask an ordinary user to choose a
 * professional logo-design configuration parameter. This is a small keyword
 * check, not a classifier and not a second LLM call -- it exists as a
 * last-line defense, not the primary control (the primary control is the
 * system prompt in buildFollowupMessages).
 *
 * Deliberately narrow: it matches specific design-taxonomy terms (logo type,
 * wordmark/lettermark/monogram/emblem/combination mark, icon direction,
 * symbol strategy, detail level, typography, serif/sans-serif, font
 * category/style, design-style taxonomy) plus "mascot" only when it is
 * offered alongside another logo-type term (i.e. mascot presented as one of
 * several structural choices, not mascot mentioned in ordinary conversation).
 * It intentionally does NOT match plain-language words like "feel", "idea",
 * "image", "creators", "audience" so that genuinely useful adaptive
 * questions are never caught by accident.
 */
const PROFESSIONAL_DESIGN_TERM_PATTERNS = [
  /\blogo\s*types?\b/i,
  /\btype\s+of\s+logo\b/i,
  /\bwordmarks?\b/i,
  /\blettermarks?\b/i,
  /\bmonograms?\b/i,
  /\bemblems?\b/i,
  /\bcombination\s+marks?\b/i,
  /\bicon\s+direction\b/i,
  /\bsymbol\s+strategy\b/i,
  /\bdetail\s+level\b/i,
  /\btypography\b/i,
  /\bsans[\s-]?serif\b/i,
  /\bserif\b/i,
  /\bfont\s+categor(?:y|ies)\b/i,
  /\bfont\s+style\b/i,
  /\bdesign[\s-]?style\b/i,
  /\bstyle\s+taxonomy\b/i,
];

// A logo-type enumeration term used only to detect "mascot" being offered as
// one of several structural choices (e.g. "mascot, icon, or wordmark?").
// Plain mentions of "mascot" on their own are not blocked by this list.
const DESIGN_TYPE_CHOICE_TERMS = [
  /\bwordmark\b/i,
  /\blettermark\b/i,
  /\bmonogram\b/i,
  /\bemblem\b/i,
  /\bcombination\s+mark\b/i,
  /\bicon\b/i,
  /\bsymbol\b/i,
  /\blogo\s*type\b/i,
];

function mentionsMascotAsLogoTypeChoice(text) {
  if (!/\bmascots?\b/i.test(text)) return false;
  return DESIGN_TYPE_CHOICE_TERMS.some((re) => re.test(text));
}

/**
 * @param {string} questionText
 * @returns {boolean} true if the question asks the user to choose a
 * professional logo-design configuration parameter and must be rejected.
 */
function isProfessionalDesignQuestion(questionText) {
  const text = String(questionText || "");
  if (!text) return false;
  if (PROFESSIONAL_DESIGN_TERM_PATTERNS.some((re) => re.test(text))) return true;
  if (mentionsMascotAsLogoTypeChoice(text)) return true;
  return false;
}

/**
 * Applies the semantic guardrail to an already shape-validated/deduped
 * questions array. Rejected questions are simply dropped -- never replaced
 * with a generic substitute question. Returning fewer questions, including
 * zero, is the correct and expected outcome.
 * @returns {Array<{id:string, question:string, reason:string, targetField:string}>}
 */
function filterProfessionalDesignQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.filter((q) => !isProfessionalDesignQuestion(q && q.question));
}

/**
 * Full post-parse pipeline: shape-validate + dedup -> semantic guardrail ->
 * cap at MAX_QUESTIONS. This is the single entry point attemptOnboardingFollowupLLM
 * uses so every caller gets all three steps, in this order, every time.
 * @returns {Array<{id:string, question:string, reason:string, targetField:string}>}
 */
function finalizeQuestions(parsed) {
  const shaped = normalizeQuestions(parsed);
  const filtered = filterProfessionalDesignQuestions(shaped);
  return filtered.slice(0, MAX_QUESTIONS);
}

function normalizeAdvisorResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const assistantMessage = typeof parsed.assistant_message === "string"
    ? parsed.assistant_message.trim().slice(0, 1600)
    : "";
  if (!assistantMessage) return null;

  const researchRaw = parsed.research && typeof parsed.research === "object" ? parsed.research : {};
  const research = {
    offered: researchRaw.offered === true,
    reason: typeof researchRaw.reason === "string" ? researchRaw.reason.trim().slice(0, 300) : "",
    confirmation_question:
      typeof researchRaw.confirmation_question === "string"
        ? researchRaw.confirmation_question.trim().slice(0, 300)
        : "",
  };

  return {
    assistant_message: assistantMessage,
    ready_to_review: parsed.ready_to_review === true,
    research,
    questions: finalizeQuestions(parsed),
  };
}

function buildFallbackAdvisorResponse(input = {}) {
  const latest = String(input.latest_message || "").trim();
  const language = normalizeConversationLanguage(input.conversation_language, latest);
  const chinese = language === "zh-CN";
  const asksForResearch = /(网上|搜索|调研|类似产品|竞品|竞争对手|research|search|similar products?|competitors?|investigar|buscar|competidores?|検索|調査|競合|類似製品)/i.test(latest);
  const asksForAdvice = /(有什么建议|给我.*建议|给.*参考|怎么.*好|应该.*吗|怎么做|建议.*吗|what.*suggest|any advice|recommend|how should)/i.test(latest);
  const sharesVisualIdea = /(叉子|勺子|字母|图形|符号|标志|logo|图标|symbol|icon|fork|spoon|letter|símbolo|icono|シンボル|文字|アイコン)/i.test(latest);
  const choices = input.guided_choices && typeof input.guided_choices === "object" ? input.guided_choices : {};
  const hasStructure = Boolean(choices.logo_structure && choices.logo_structure !== "auto");
  const hasColor = Boolean(choices.color_preference && choices.color_preference !== "let_logofunny_decide");
  const hasVisualAnswer = Array.isArray(input.adaptive_answers) && input.adaptive_answers.some((answer) =>
    answer && (answer.target_field === "visual_foundation" || /name doing most|simple graphic|文字为主|图形.*名字|nombre.*gr[aá]fico|文字.*メイン|シンボル.*名前/i.test(String(answer.question || "")))
  );
  const needsVisualFoundation = !hasVisualAnswer && (!hasStructure || !hasColor);
  const visualQuestion = language === "zh-CN"
    ? "说到 Logo 本身，你更希望名字是主角，还是有一个简单图形和名字放在一起？颜色有想保留或避开的方向吗，也可以让我建议。"
    : language === "es"
      ? "Para el logo, ¿prefieres que el nombre sea el protagonista o que haya un gráfico sencillo junto al nombre? ¿Hay alguna familia de colores que quieras usar o evitar, o prefieres que te recomiende una?"
      : language === "ja"
        ? "ロゴ自体は、名前を主役にしたいですか、それとも名前と一緒にシンプルな図形を使いたいですか？使いたい・避けたい色があれば教えてください。お任せでも大丈夫です。"
        : "For the logo itself, do you picture the name doing most of the work, or a simple graphic together with the name? Is there a color family you want me to keep in mind, avoid, or should I recommend one?";
  const visualReason = language === "zh-CN"
    ? "这会直接决定图形与文字的关系，以及生成时的颜色约束。"
    : language === "es"
      ? "Esto define la relación entre el gráfico, el nombre y el color al generar."
      : language === "ja"
        ? "図形と名前の関係、そして生成時の色の制約を決めるためです。"
        : "This directly affects the relationship between the graphic, the name, and the color constraints used for generation.";

  if (input.conversation_stage === "business") {
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? `我明白 ${input.business_description || "你正在做的产品"} 的方向了。它需要让人一眼明白用途，同时不显得像又一个通用 SaaS。Logo 上希望出现的准确英文名称是什么？`
        : `I understand the direction for ${input.business_description || "what you are building"}. It should make the purpose clear without looking like another generic SaaS. What exact English name should appear on the logo?`,
      ready_to_review: false,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [],
    };
  }

  if (input.conversation_stage === "brand") {
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? `${input.brand_name} 很简洁，也适合成为一个好记的产品名称。现在更重要的是让它不止像一个功能名：你希望用户第一眼感到稳重可信、清爽友好，还是更有未来感？`
        : `${input.brand_name} is concise and can make a memorable product name. The next step is making it feel like more than a feature label: should people first feel steady and trustworthy, clear and friendly, or more future-facing?`,
      ready_to_review: false,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [],
    };
  }

  if (needsVisualFoundation && input.brand_name && input.business_description && input.rough_feeling) {
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? "你已经把品牌想传达的感觉说清楚了。下一步我会把它变成具体、可执行的 Logo 决定，而不是只做一套好看的字。"
        : "You have made the feeling of the brand clear. The next useful step is to turn it into a concrete logo decision, not simply a nice-looking set of letters.",
      ready_to_review: true,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [{ id: "visual_foundation", question: visualQuestion, reason: visualReason, targetField: "visual_foundation" }],
    };
  }

  if (language === "es" || language === "ja") {
    const spanish = language === "es";
    const researchQuestion = spanish
      ? "¿Quieres que empiece por el producto, la sensación visual o el público?"
      : "まず製品、見た目の印象、対象顧客のどれを調べますか？";
    if (asksForResearch) {
      return {
        source: "deterministic_fallback",
        assistant_message: spanish
          ? `Sí. Con tu permiso, puedo revisar fuentes públicas y comparar cómo se presentan productos parecidos, qué recursos se repiten y dónde puede diferenciarse tu marca. Aún no he buscado nada. ${researchQuestion}`
          : `はい。同意いただければ公開情報を確認し、類似製品の伝え方、繰り返し使われる表現、差別化できる点を比較できます。まだ検索はしていません。${researchQuestion}`,
        ready_to_review: true,
        research: {
          offered: true,
          reason: spanish ? "El usuario solicitó investigación pública." : "ユーザーが公開情報の調査を希望しました。",
          confirmation_question: researchQuestion,
        },
        questions: [],
      };
    }
    return {
      source: "deterministic_fallback",
      assistant_message: spanish
        ? (sharesVisualIdea
          ? "La idea puede convertirse en una señal de marca fácil de recordar. Si es demasiado literal, puede parecerse a muchas marcas de la categoría; conservaría la asociación, pero la simplificaría hasta convertirla en un signo propio. ¿Qué quieres que la gente recuerde primero?"
          : "La marca necesita dejar una impresión clara, no solo verse adecuada. Antes de añadir detalles, conviene decidir qué debe recordar alguien después de verla una vez. ¿Qué es lo primero que quieres que recuerde?")
        : (sharesVisualIdea
          ? "そのアイデアは覚えやすいブランドの手がかりになります。直接的すぎると同業と似て見えるため、連想は残しつつ独自のシンプルな形にしましょう。最初に何を覚えてほしいですか？"
          : "このブランドに必要なのは、単に適切に見えることではなく、明確な印象を残すことです。飾りを増やす前に、一度見た人に何を覚えてほしいかを決めましょう。まず何を覚えてほしいですか？"),
      ready_to_review: true,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [],
    };
  }

  if (asksForResearch) {
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? "可以。在你同意后，我可以查看公开网站，对比相似产品怎样介绍自己、哪些视觉做法反复出现，以及你的品牌可以怎样做得更不一样。我还没有开始搜索，也不会把猜测当成结论。你更希望我先研究产品定位、视觉感觉，还是目标顾客？"
        : "Yes. With your permission, I can review public websites and compare how similar products describe themselves, which visual patterns keep appearing, and where your brand could feel different. I have not searched yet, and I will not present guesses as findings. Should I focus first on the product, the visual feel, or the audience?",
      ready_to_review: true,
      research: {
        offered: true,
        reason: chinese
          ? "用户明确提出希望参考公开的类似产品。"
          : "The user explicitly asked to learn from similar products on the public web.",
        confirmation_question: chinese
          ? "你希望我先研究产品定位、视觉感觉，还是目标顾客？"
          : "Should I focus first on the product, the visual feel, or the audience?",
      },
      questions: [],
    };
  }

  if (asksForAdvice) {
    const subject = String(input.brand_name || (chinese ? "这个品牌" : "the brand")).trim();
    const business = String(input.business_description || (chinese ? "它正在做的产品" : "what it is building")).trim();
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? `对于 ${subject} 这样的 ${business}，我不建议把“专业、可信、可靠、智能”都当成四个并列口号；它们会让 Logo 很像通用 SaaS。更好的做法是先让“可信”成为第一印象，再用简洁、带一点未来感的细节表达智能。你希望它更偏稳重，还是更偏有未来感？`
        : `For ${subject} and ${business}, I would not try to make “professional, trustworthy, reliable, and intelligent” four equal messages; that can make the logo feel like a generic SaaS brand. I would lead with trust, then use one clean, slightly forward-looking detail to signal intelligence. Should it feel more established or more future-facing?`,
      ready_to_review: true,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [],
    };
  }

  if (sharesVisualIdea) {
    return {
      source: "deterministic_fallback",
      assistant_message: chinese
        ? "这个想法有机会成为容易记住的品牌线索。要注意的是，如果符号太直接，品牌可能会和同类看起来很像；我更建议保留这个联想，但把形状做得更简洁、更像你自己的记号。人们第一眼看到它时，你最希望他们感到有趣、可信，还是与众不同？"
        : "That idea could become a memorable brand cue. The tradeoff is that a very literal symbol can make the brand look like the obvious category choice, so I would keep the association but simplify it into a mark that feels more like your own. When people see it, should they first feel delighted, reassured, or surprised?",
      ready_to_review: true,
      research: { offered: false, reason: "", confirmation_question: "" },
      questions: [],
    };
  }

  const subject = String(input.brand_name || (chinese ? "这个品牌" : "the brand")).trim();
  return {
    source: "deterministic_fallback",
    assistant_message: chinese
      ? `我听到的重点是：${subject}不仅要看起来合适，还要让人记住一个明确的感觉。与其继续增加装饰，我更建议先确定人们看过一次后应该记住什么，这会让后面的图形和文字选择更一致。你希望他们最先记住哪一点？`
      : `What stands out is that ${subject} needs to leave one clear impression, not simply look appropriate. Before adding more decoration, I would decide what someone should remember after seeing it once; that will make every later choice more consistent. What is the one thing you want them to remember?`,
    ready_to_review: true,
    research: { offered: false, reason: "", confirmation_question: "" },
    questions: [],
  };
}

/**
 * Calls the LLM without throwing. Used by POST /api/onboarding-followup for
 * reliable, conservative fallbacks.
 * @returns {Promise<{ ok: true, questions: Array } | { ok: false, failure: 'timeout'|'http'|'fetch_json'|'empty'|'parse'|'disabled'|'misconfigured'|'network', detail?: string }>}
 */
async function attemptOnboardingFollowupLLM(input = {}) {
  const cfg = getFollowupConfig();
  if (!cfg.enabled) {
    return { ok: false, failure: "disabled" };
  }
  if (!isFollowupConfigured(cfg)) {
    return { ok: false, failure: "misconfigured" };
  }

  // Preserve provenance-compatible inputs as-is. voluntary_extra_context is
  // passed through verbatim as free text -- never flattened into a
  // professional design parameter form.
  const structured = {
    brand_name: input.brand_name,
    business_description: input.business_description,
    rough_feeling: input.rough_feeling,
    primary_use: input.primary_use,
    voluntary_extra_context: input.voluntary_extra_context,
    latest_message: input.latest_message,
    conversation_stage: input.conversation_stage,
    conversation_language: normalizeConversationLanguage(input.conversation_language, input.latest_message),
    adaptive_answers: Array.isArray(input.adaptive_answers) ? input.adaptive_answers : [],
    guided_choices: input.guided_choices && typeof input.guided_choices === "object" ? input.guided_choices : {},
  };
  const messages = buildFollowupMessages(structured);

  const url = `${cfg.baseUrl}/responses`;
  const timeoutMs = getFetchTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        instructions: messages[0].content,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: messages[1].content }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "onboarding_followup",
            schema: followupSchema,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: 600,
      }),
    });
  } catch (e) {
    const name = e && e.name;
    const msg = e?.message || String(e);
    if (name === "AbortError") {
      return { ok: false, failure: "timeout", detail: `${timeoutMs}ms` };
    }
    return { ok: false, failure: "network", detail: msg.slice(0, 200) };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      failure: "http",
      detail: `${res.status} ${body.slice(0, 200)}`,
    };
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    return { ok: false, failure: "fetch_json", detail: e?.message || String(e) };
  }

  const content =
    (typeof data?.output_text === "string" && data.output_text.trim() ? data.output_text : "") ||
    (() => {
      if (!Array.isArray(data?.output)) return "";
      for (const item of data.output) {
        if (!Array.isArray(item?.content)) continue;
        for (const part of item.content) {
          const text = part?.text ?? part?.output_text;
          if (typeof text === "string" && text.trim()) return text;
        }
      }
      return "";
    })();
  if (content == null || !String(content).trim()) {
    return { ok: false, failure: "empty" };
  }

  const parsed = extractJsonObject(content);
  if (!parsed) {
    return { ok: false, failure: "parse" };
  }

  const advisor = normalizeAdvisorResponse(parsed);
  if (!advisor) return { ok: false, failure: "parse" };
  return { ok: true, ...advisor };
}

/**
 * @param {Record<string, unknown>} input -- brand_name, business_description, rough_feeling, primary_use, voluntary_extra_context
 * @returns {Promise<{ needs_followup: boolean, questions: Array<{id:string, question:string, reason:string, targetField:string}> }>}
 *
 * Never throws. On any failure (disabled, misconfigured, timeout, parse,
 * network, http, empty), returns a conservative empty result. This must
 * never block generation -- callers always get a usable response.
 *
 * needs_followup is derived here, from the length of the final validated
 * questions array -- it is never read from or trusted from raw LLM output.
 */
async function generateOnboardingFollowup(input = {}) {
  const result = await attemptOnboardingFollowupLLM(input);
  if (result.ok) {
    return {
      source: "ai",
      assistant_message: result.assistant_message,
      ready_to_review: result.ready_to_review,
      research: result.research,
      needs_followup: result.questions.length > 0,
      questions: result.questions,
    };
  }
  const fallback = buildFallbackAdvisorResponse(input);
  // Keep the deterministic response available to non-interactive callers,
  // but preserve why the model was unavailable. The web client uses this
  // provenance to avoid presenting a template as an AI reply.
  return { ...fallback, needs_followup: false, failure: result.failure };
}

module.exports = {
  getFollowupConfig,
  isFollowupConfigured,
  generateOnboardingFollowup,
  attemptOnboardingFollowupLLM,
  normalizeQuestions,
  isProfessionalDesignQuestion,
  filterProfessionalDesignQuestions,
  finalizeQuestions,
  normalizeAdvisorResponse,
  buildFallbackAdvisorResponse,
  MAX_QUESTIONS,
};
