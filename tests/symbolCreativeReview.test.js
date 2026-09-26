const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getSymbolConcept } = require('../services/symbolConceptContract');

function pipelineFixture(retryReview) {
  const src = fs.readFileSync(path.join(__dirname, '../routes/logoApiRoutes.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function runDualTrackPipeline('), src.indexOf('// --- Elementor'));
  const requests = []; const reviews = [];
  const pass = { violations: {}, colorCompliance: { matchesRequestedColor: true, hasPureWhiteCanvas: true },
    structureCompliance: { matchesRequestedStructure: true, hasIndependentGraphicSymbol: true },
    creativeCompliance: { matchesCreativeDirection: true, respectsExclusions: true } };
  const context = { process: { env: {} }, console: { log() {}, warn() {}, error() {} },
    generateDesignDecision: () => ({}), generateBrandInsight: () => '',
    generateIdeogramLogos: async (_input, options = {}) => {
      requests.push(options);
      return (options.conceptIndexes || [0, 1]).map((i) => ({ imageUrl: `test:${i}:${options.retryAttempt || 0}`,
        generationTrace: { symbolRequirement: getSymbolConcept(i).requirement } }));
    }, normalizeResultToItem: async (item) => item,
    judgeLogo: async (url, input) => {
      reviews.push(input);
      if (url === 'test:1:0') return { ...pass, creativeCompliance: { ...pass.creativeCompliance, matchesCreativeDirection: false } };
      if (url === 'test:1:1') return retryReview === 'unavailable' ? null : pass;
      return pass;
    },
  };
  vm.runInNewContext(fn + '\nthis.run = runDualTrackPipeline;', context);
  return { run: context.run, requests, reviews };
}
test('a non-geometric second icon gets only one targeted retry and the exact requirement reaches both reviews', async () => {
  const fixture = pipelineFixture('pass');
  const result = await fixture.run({ logoStructure: 'symbol_wordmark', generationMode: 'two_concepts' });
  assert.equal(fixture.requests.length, 2);
  assert.equal(JSON.stringify(fixture.requests[1]), JSON.stringify({ conceptIndexes: [1], retryAttempt: 1 }));
  assert.ok(fixture.reviews[1].symbolRequirement.includes('GEOMETRIC CONSTRUCTION'));
  assert.equal(fixture.reviews[1].symbolRequirement, fixture.reviews[2].symbolRequirement);
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((item) => item.qualityStatus === 'pass'));
});
test('unreviewed retry cannot replace the original just because it has fewer warnings', async () => {
  const fixture = pipelineFixture('unavailable');
  const result = await fixture.run({ logoStructure: 'symbol_wordmark' });
  assert.equal(fixture.requests.length, 2);
  assert.equal(result.results[1].imageUrl, 'test:1:0');
  assert.equal(result.results[1].qualityStatus, 'needs_review');
});
test('review schema and instructions include the creative requirement', () => {
  const src = fs.readFileSync(path.join(__dirname, '../services/openaiJudge.js'), 'utf8');
  const sandbox = { module: { exports: {} }, require: () => ({}), process: { env: {} } };
  vm.runInNewContext(src + '\nthis.prompt = buildJudgePrompt; this.schema = buildResponseSchema;', sandbox);
  const prompt = sandbox.prompt({ symbolRequirement: getSymbolConcept(1).requirement, otherNotes: 'No cups' });
  assert.match(prompt, /irregular veined botanical leaf is NOT geometric/);
  assert.match(prompt, /No cups/);
  assert.ok(sandbox.schema().required.includes('creativeCompliance'));
});
