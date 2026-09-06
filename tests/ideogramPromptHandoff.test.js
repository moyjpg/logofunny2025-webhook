const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const path = require('node:path');

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
        assert.equal(url, 'https://api.ideogram.ai/v1/ideogram-v3/generate');
        const body = JSON.parse(options.body);
        requests.push(body);
        const id = requests.length;
        return { ok: true, json: async () => ({ data: [{ url: `https://example.test/${id}.png`, prompt: `provider-${id}`, seed: id }] }) };
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
    conceptPrompts: Object.fromEntries(keys.map((key) => [key,
      `Confirmed-${key}. SaaS for small bakeries. ${'Context. '.repeat(310)}No tagline. No presentation board. Avoid shields. END-${key}`])),
    accountEmail: 'must-not-leave@example.test', paymentData: 'PRIVATE-PAYMENT',
  };
}

for (const [mode, count] of [['two_concepts', 2], ['four_directions', 4]]) {
  test(`${mode}: complete direction and actual Magic Prompt reach each request`, async () => {
    const api = fixture();
    const input = brief(mode);
    const results = await api.generateIdeogramLogos(input);
    assert.equal(api.requests.length, count);
    assert.equal(results.length, count);
    api.requests.forEach((request, index) => {
      assert.equal(request.num_images, 1);
      assert.equal(request.magic_prompt, 'OFF');
      const expectedPalette = {
        members: [
          { color_hex: '#3F6B4B', color_weight: 0.5 },
          { color_hex: '#FFFFFF', color_weight: 0.5 },
        ],
      };
      assert.equal(JSON.stringify(request.color_palette), JSON.stringify(expectedPalette));
      assert.ok(request.prompt.includes(input.conceptPrompts[keys[index]]));
      assert.ok(request.prompt.includes(`END-${keys[index]}`));
      assert.ok(request.prompt.includes('COLOR CONTRACT (non-negotiable)'));
      assert.ok(request.prompt.includes('deep forest green'));
      assert.ok(request.prompt.includes('REQUIRED SYMBOL (non-negotiable)'));
      assert.ok(request.prompt.includes('one simple original leaf'));
      assert.equal(request.prompt.includes('maximum creative freedom'), false);
      assert.ok(request.prompt.includes('Final required layout:'));
      assert.equal(request.prompt.includes('must-not-leave'), false);
      assert.equal(request.prompt.includes('PRIVATE-PAYMENT'), false);
      assert.equal(results[index].prompt, request.prompt);
      assert.equal(results[index].generationTrace.magicPrompt, request.magic_prompt);
      assert.equal(
        JSON.stringify(results[index].generationTrace.submittedColorPalette),
        JSON.stringify(request.color_palette)
      );
      assert.equal(results[index].generationTrace.providerPrompt, `provider-${index + 1}`);
      assert.equal(results[index].generationTrace.submittedPromptSha256, createHash('sha256').update(request.prompt).digest('hex'));
    });
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
