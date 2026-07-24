// Counts values into len(boundaries) + 1 buckets. A value belongs to the
// first bucket whose upper boundary is strictly greater than the value;
// values >= the last boundary land in the overflow bucket.
export function histogram(values, boundaries) {
  if (!Array.isArray(boundaries) || boundaries.length === 0) {
    throw new TypeError('boundaries must be a non-empty ascending array');
  }
  for (let index = 1; index < boundaries.length; index += 1) {
    if (boundaries[index] <= boundaries[index - 1]) {
      throw new RangeError('boundaries must be strictly ascending');
    }
  }
  const counts = new Array(boundaries.length + 1).fill(0);
  for (const value of values) {
    let bucket = boundaries.length;
    for (let index = 0; index < boundaries.length; index += 1) {
      if (value < boundaries[index]) {
        bucket = index;
        break;
      }
    }
    counts[bucket] += 1;
  }
  return counts;
}
