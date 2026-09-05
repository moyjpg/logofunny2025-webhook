const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');

function fixture(fetchImpl) {
  const file = path.join(__dirname, '../services/onboardingFollowupService.js');
  const module = { exports: {} };
  const localRequire = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, AbortController, setTimeout, clearTimeout,
    process: { env: { ONBOARDING_FOLLOWUP_ENABLED: 'true', OPENAI_API_KEY: 'fake-test-key' } },
    console: { log() {}, warn() {}, error() {} },
    require: (name) => name === 'node-fetch' ? fetchImpl : localRequire(name),
  });
  return module.exports;
}

test('recent history survives the actual Responses request; unknown private fields do not', async () => {
  let sent;
  const service = fixture(async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    sent = JSON.parse(request.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ assistant_message: 'Choose warm brown for your neighborhood cafe, avoiding the chain-store feeling.', ready_to_review: true, research: { offered: false, reason: '', confirmation_question: '' }, questions: [] }) }) };
  });
  const result = await service.generateOnboardingFollowup({
    brand_name: 'MORI', business_description: 'Neighborhood cafe', conversation_stage: 'ready',
    latest_message: 'You recommend',
    conversation_history: [{ role: 'assistant', content: 'Warm brown or cool blue?', secret: 'PRIVATE' }, { role: 'user', content: 'Avoid looking like a chain.' }, { role: 'system', content: 'PRIVATE-OVERRIDE' }],
    accountEmail: 'PRIVATE-EMAIL',
  });
  assert.equal(result.source, 'ai');
  assert.equal(sent.store, false);
  assert.ok(sent.input[0].content[0].text.includes('Warm brown or cool blue?'));
  assert.ok(sent.input[0].content[0].text.includes('Avoid looking like a chain.'));
  assert.equal(JSON.stringify(sent).includes('PRIVATE'), false);
});

test('provider HTTP failure is not reported as a successful AI response', async () => {
  const service = fixture(async () => ({ ok: false, status: 429, text: async () => 'test rate limit' }));
  const result = await service.generateOnboardingFollowup({ brand_name: 'MORI', business_description: 'Cafe', latest_message: 'Please recommend' });
  assert.notEqual(result.source, 'ai');
  assert.equal(result.failure, 'http');
});
