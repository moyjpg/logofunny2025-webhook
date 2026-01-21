// services/aiGenerateService.js
const Replicate = require("replicate");
const fetch = require("node-fetch");
const sharp = require("sharp");

function getReplicate() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Missing REPLICATE_API_TOKEN in env");
  return new Replicate({ auth: token });
}

async function generateSvgFromPrompt(prompt, model = null) {
  const replicate = getReplicate();
  const m = model || process.env.REPLICATE_MODEL || "recraft-ai/recraft-v3-svg";

  const output = await replicate.run(m, {
    input: { prompt: String(prompt) }
  });

  // 你之前用 output.url()，这里做兼容
  const svgUrl =
    (output && typeof output.url === "function" && output.url()) ||
    (typeof output === "string" ? output : null);

  if (!svgUrl) throw new Error("Replicate output did not contain a URL");

  const r = await fetch(svgUrl, { redirect: "follow" });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Failed to fetch SVG from delivery: ${r.status} ${t.slice(0, 200)}`);
  }

  const svgText = await r.text();
  return { svgUrl, svgText, model: m };
}

async function svgToPngBuffer(svgText, size = 1024) {
  return sharp(Buffer.from(svgText))
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
}

module.exports = { generateSvgFromPrompt, svgToPngBuffer };