// Helpers over Promise.allSettled-style outcome records.
export function partitionSettled(settled) {
  const values = [];
  const errors = [];
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      values.push(outcome.value);
    } else {
      errors.push(outcome.reason);
    }
  }
  return { values, errors };
}
