export class PipelineError extends Error {
  constructor(message, { stage = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PipelineError';
    this.stage = stage;
  }
}
