export function summarize(items) {
  return { count: items.length, firstId: items.length === 0 ? null : items[0].id };
}
