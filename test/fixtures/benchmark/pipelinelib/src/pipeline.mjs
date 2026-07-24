import { PipelineError } from './errors.mjs';

// Runs stages sequentially, feeding each stage the previous stage's output.
// A stage failure is wrapped in PipelineError with the failing stage's name.
export async function runPipeline(stages, input, { emitter = null } = {}) {
  let value = input;
  for (const stage of stages) {
    emitter?.emit('stage:start', { stage: stage.name });
    try {
      value = await stage.run(value);
    } catch (error) {
      emitter?.emit('stage:error', { stage: stage.name, error });
      throw new PipelineError(`stage failed: ${stage.name}`, { stage: stage.name, cause: error });
    }
    emitter?.emit('stage:end', { stage: stage.name });
  }
  return value;
}
