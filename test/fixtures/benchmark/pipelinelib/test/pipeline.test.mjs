import assert from 'node:assert/strict';
import test from 'node:test';

import { Emitter } from '../src/events.mjs';
import { PipelineError } from '../src/errors.mjs';
import { runPipeline } from '../src/pipeline.mjs';
import { defineStage } from '../src/stage.mjs';

test('feeds each stage the previous output', async () => {
  const stages = [
    defineStage('double', (value) => value * 2),
    defineStage('stringify', async (value) => `=${value}`),
  ];
  assert.equal(await runPipeline(stages, 21), '=42');
});

test('wraps stage failures with the failing stage name', async () => {
  const emitter = new Emitter();
  const events = [];
  emitter.on('stage:error', ({ stage }) => events.push(stage));
  const stages = [
    defineStage('ok', (value) => value),
    defineStage('explode', () => {
      throw new Error('inner');
    }),
  ];
  await assert.rejects(runPipeline(stages, 1, { emitter }), (error) => {
    assert.ok(error instanceof PipelineError);
    assert.equal(error.stage, 'explode');
    assert.equal(error.cause.message, 'inner');
    return true;
  });
  assert.deepEqual(events, ['explode']);
});

test('validates stage definitions', () => {
  assert.throws(() => defineStage('', () => {}), TypeError);
  assert.throws(() => defineStage('x', null), TypeError);
});
