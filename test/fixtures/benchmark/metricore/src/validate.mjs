// Validates a raw metric sample and returns the normalized record.
// eslint-disable-next-line complexity
export function validateMetric(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('metric must be an object');
  }
  var name = input.name;
  if (typeof name !== 'string') {
    throw new TypeError('metric name must be a string');
  }
  name = name.trim();
  if (name === '') {
    throw new TypeError('metric name must not be blank');
  }
  var type = input.type;
  if (typeof type !== 'string') {
    throw new TypeError('metric type must be a string');
  }
  type = type.toLowerCase();
  if (type !== 'counter' && type !== 'gauge' && type !== 'timer') {
    throw new RangeError('metric type must be one of counter, gauge, timer');
  }
  var value = input.value;
  if (typeof value !== 'number') {
    value = Number(value);
  }
  if (!isFinite(value)) {
    throw new RangeError('metric value must be a finite number');
  }
  if (type === 'counter' && value < 0) {
    throw new RangeError('counter value must not be negative');
  }
  var tags = input.tags;
  var normalizedTags = {};
  if (tags !== undefined && tags !== null) {
    if (typeof tags !== 'object' || Array.isArray(tags)) {
      throw new TypeError('metric tags must be a plain object');
    }
    var keys = Object.keys(tags);
    for (var i = 0; i < keys.length; i++) {
      normalizedTags[keys[i]] = String(tags[keys[i]]);
    }
  }
  return { name: name, type: type, value: value, tags: normalizedTags };
}
