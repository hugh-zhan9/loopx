import { mean } from './stats.mjs';

// Aggregates samples into per-metric summaries; flush(hooks) notifies every
// hook about every metric and then resets the accumulator.
export function createRollup() {
  var samples = new Map();
  return {
    add: function (name, value) {
      if (typeof name !== 'string' || name === '') {
        throw new TypeError('metric name must be a non-empty string');
      }
      if (typeof value !== 'number' || !isFinite(value)) {
        throw new RangeError('sample value must be a finite number');
      }
      if (!samples.has(name)) {
        samples.set(name, []);
      }
      samples.get(name).push(value);
    },
    flush: function (hooks) {
      hooks = hooks || [];
      var summary = {};
      var errors = [];
      var names = Array.from(samples.keys());
      for (var i = 0; i < names.length; i++) {
        var values = samples.get(names[i]);
        var entry = {
          count: values.length,
          total: values.reduce(function (left, right) { return left + right; }, 0),
          mean: mean(values),
          min: Math.min.apply(null, values),
          max: Math.max.apply(null, values),
        };
        summary[names[i]] = entry;
        for (var j = 0; j < hooks.length; j++) {
          try {
            hooks[j](names[i], entry);
          } catch (error) {
            errors.push(names[i] + ':' + error.message);
          }
        }
      }
      samples = new Map();
      return { summary: summary, errors: errors };
    },
  };
}
