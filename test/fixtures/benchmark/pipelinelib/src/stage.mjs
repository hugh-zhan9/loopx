// A stage is { name, run }: run receives the previous stage's output.
export function defineStage(name, run) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('stage name must be a non-empty string');
  }
  if (typeof run !== 'function') {
    throw new TypeError('stage run must be a function');
  }
  return Object.freeze({ name, run });
}
