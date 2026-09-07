const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const path = require('node:path');
const sharp = require('sharp');

const GREEN_SYMBOL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAARklEQVR4nO3XsQ0AMAgDwWzmATwK+9dki6S5gh4JMP8n0/1ZRwMxgrGEdYYriCKKxzOqd7yAJJBsQGlh+RKTULMhp32u5xeA5NBqBbBNvwAAAABJRU5ErkJggg==',
  'base64'
);

function fixture() {
  const file = path.join(__dirname, '../services/ideogramService.js');
  const localRequire = createRequire(file);
  const requests = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, Buffer,
    // An isolated fake credential. This test never reads .env or sends traffic.
    process: { env: { IDEOGRAM_API_KEY: 'test-not-a-real-key' } },
    console: { log() {}, error() {} },
    require(name) {
      if (name !== 'node-fetch') return localRequire(name);
      return async (url, options) => {
        if (url === 'https://api.ideogram.ai/v1/ideogram-v3/generate') {
          const body = JSON.parse(options.body);
          requests.push(body);
          const id = requests.length;
          return { ok: true, json: async () => ({ data: [{ url: `https://example.test/${id}.png`, prompt: `provider-${id}`, seed: id }] }) };
        }
        assert.match(url, /^https:\/\/example\.test\/\d+\.png$/);
        return {
          ok: true,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => GREEN_SYMBOL_PNG,
        };
      };
    },
  });
  return { ...module.exports, requests };
}

const keys = ['recommended', 'wordmark', 'app_icon', 'symbol_mark'];
function brief(generationMode) {
  return {
    generationMode, brandName: 'ELOVER', industry: 'software', logoStructure: 'symbol_wordmark',
    colorDirection: 'soft_natural', iconDirection: 'one simple original leaf',
    keywords: 'reliable but friendly',
    promptOverride: '我在做一家面向社区邻居的咖啡店，品牌名是 ELOVER。必须图标加准确文字 ELOVER。整体温暖安静。不要咖啡杯。',
    conceptPrompts: Object.fromEntries(keys.map((key) => [key,
      `Confirmed-${key}. SaaS for small bakeries. ${'Context. '.repeat(310)}No tagline. No presentation board. Avoid shields. END-${key}`])),
    accountEmail: 'must-not-leave@example.test', paymentData: 'PRIVATE-PAYMENT',
  };
}

for (const [mode, count] of [['two_concepts', 2], ['four_directions', 4]]) {
  test(`${mode}: creative symbols use Magic Prompt while exact wordmarks are composed deterministically`, async () => {
    const api = fixture();
    const input = brief(mode);
    const results = await api.generateIdeogramLogos(input);
    assert.equal(api.requests.length, count);
    assert.equal(results.length, count);
    for (let index = 0; index < api.requests.length; index += 1) {
      const request = api.requests[index];
      const result = results[index];
      assert.equal(request.num_images, 1);
      assert.equal(request.magic_prompt, 'ON');
      const expectedPalette = {
        members: [
          { color_hex: '#3F6B4B', color_weight: 0.5 },
          { color_hex: '#FFFFFF', color_weight: 0.5 },
        ],
      };
      assert.equal(JSON.stringify(request.color_palette), JSON.stringify(expectedPalette));
      assert.ok(request.prompt.includes('standalone graphic symbol only'));
      assert.ok(request.prompt.includes('ABSOLUTE TEXT BAN'));
      assert.ok(request.prompt.includes('COLOR CONTRACT (non-negotiable)'));
      assert.ok(request.prompt.includes('deep forest green'));
      assert.ok(request.prompt.includes('REQUIRED SYMBOL (non-negotiable)'));
      assert.ok(request.prompt.includes('one simple original leaf'));
      assert.equal(request.prompt.includes('ELOVER'), false);
      assert.equal(request.prompt.includes('Confirmed-'), false);
      assert.ok(request.prompt.includes('咖啡店'));
      assert.equal(request.prompt.includes('准确文字'), false);
      assert.equal(request.prompt.includes('must-not-leave'), false);
      assert.equal(request.prompt.includes('PRIVATE-PAYMENT'), false);
      assert.equal(result.prompt, request.prompt);
      assert.equal(result.generationTrace.magicPrompt, request.magic_prompt);
      assert.equal(
        JSON.stringify(result.generationTrace.submittedColorPalette),
        JSON.stringify(request.color_palette)
      );
      assert.equal(result.generationTrace.providerPrompt, `provider-${index + 1}`);
      assert.equal(result.generationTrace.submittedPromptSha256, createHash('sha256').update(request.prompt).digest('hex'));
      assert.equal(result.generationTrace.version, 'brand-direction.v3');
      assert.equal(result.generationTrace.compositionMode, 'creative-symbol-deterministic-wordmark');
      assert.equal(result.generationTrace.wordmarkText, 'ELOVER');
      assert.equal(result.generationTrace.layout, index % 2 === 0 ? 'horizontal' : 'vertical');
      assert.equal(result.mode, 'hybrid-symbol-wordmark');
      assert.match(result.imageUrl, /^data:image\/png;base64,/);
      const imageBuffer = Buffer.from(result.imageUrl.split(',', 2)[1], 'base64');
      const metadata = await sharp(imageBuffer).metadata();
      assert.equal(metadata.width, 1024);
      assert.equal(metadata.height, 1024);
    }
  });
}

test('oversized final direction rejects before any paid request starts', async () => {
  const api = fixture();
  const input = brief('four_directions');
  input.conceptPrompts.symbol_mark = 'x'.repeat(6001);
  await assert.rejects(api.generateIdeogramLogos(input), /BRAND_DIRECTION_TOO_LONG/);
  assert.equal(api.requests.length, 0);
});

test('custom deep green is sent as a structured palette with white canvas support', async () => {
  const api = fixture();
  const input = brief('two_concepts');
  input.colorDirection = 'custom';
  input.customColor = 'Deep forest green #3F6B4B';
  await api.generateIdeogramLogos(input);
  api.requests.forEach((request) => {
    assert.equal(JSON.stringify(request.color_palette), JSON.stringify({
      members: [
        { color_hex: '#3F6B4B', color_weight: 0.5 },
        { color_hex: '#FFFFFF', color_weight: 0.5 },
      ],
    }));
    assert.ok(request.prompt.includes('Deep forest green #3F6B4B'));
  });
});

test('symbol correction regenerates only the requested concept and preserves the wordmark layer', async () => {
  const api = fixture();
  const results = await api.generateIdeogramLogos(brief('two_concepts'), {
    conceptIndexes: [1],
    retryAttempt: 1,
  });
  assert.equal(api.requests.length, 1);
  assert.equal(results.length, 1);
  assert.ok(api.requests[0].prompt.includes('CORRECTION PASS'));
  assert.equal(results[0].generationTrace.conceptIndex, 1);
  assert.equal(results[0].generationTrace.retryAttempt, 1);
  assert.equal(results[0].generationTrace.wordmarkText, 'ELOVER');
  assert.equal(results[0].generationTrace.layout, 'vertical');
});

test('non symbol-wordmark requests retain the existing full-logo generation path', async () => {
  const api = fixture();
  const input = brief('two_concepts');
  input.logoStructure = 'wordmark_only';
  const results = await api.generateIdeogramLogos(input);
  assert.equal(api.requests.length, 2);
  assert.equal(results.length, 2);
  assert.equal(api.requests[0].magic_prompt, 'OFF');
  assert.equal(results[0].generationTrace.version, 'brand-direction.v2');
  assert.equal(results[0].generationTrace.compositionMode, undefined);
  assert.equal(results[0].mode, 'text-to-image');
  assert.match(results[0].imageUrl, /^https:\/\/example\.test\/\d+\.png$/);
});
