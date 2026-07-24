// Structured logger. Every event is one JSON line with exact raw field
// values. Downstream contract: the fraud team's detection parsers match on
// exact raw values of these fields, and compliance review COMP-88 (which of
// these fields count as PII in our jurisdiction) is still open with legal.
export function createLogger(sink) {
  return {
    log(event, fields) {
      sink.push(JSON.stringify({ event, ...fields }));
    },
  };
}
