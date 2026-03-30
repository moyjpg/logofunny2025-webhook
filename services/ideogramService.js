const fetch = require("node-fetch");

function buildIdeogramPrompt(input = {}) {
  const promptOverride = input?.promptOverride;
  if (typeof promptOverride === "string" && promptOverride.trim()) {
    return promptOverride.trim();
  }

  const brandName = String(input?.brandName || "Brand").trim();

  // Keep prompt short and strict for logo-like output.
  return [
    `Modern commercial logo for "${brandName}".`,
    "One abstract geometric mark and one readable wordmark.",
    "No people, no scenes, no extra symbols.",
    "Pure flat vector style.",
  ].join(" ");
}

async function generateIdeogramLogos(input = {}) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Missing IDEOGRAM_API_KEY in env");
  }

  const prompt = buildIdeogramPrompt(input);

  const response = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
    method: "POST",
    headers: {
      "Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      // Request 4 concepts to match the required normalization contract.
      num_images: 4,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ideogram API error ${response.status}: ${detail || "no details"}`);
  }

  const data = await response.json();
  const raw =
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.results) && data.results) ||
    [];

  const imageUrls = raw
    .map((item) => item?.url || item?.image_url || item?.imageUrl || item?.image?.url)
    .filter((u) => typeof u === "string" && u.trim());

  if (imageUrls.length < 4) {
    throw new Error(`Ideogram returned ${imageUrls.length} images, expected 4`);
  }

  return imageUrls.slice(0, 4).map((imageUrl) => ({
    imageUrl,
    prompt,
    model: "ideogram",
    mode: "text-to-image",
  }));
}

module.exports = {
  generateIdeogramLogos,
};

