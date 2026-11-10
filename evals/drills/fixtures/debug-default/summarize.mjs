export function summarize(items) {
  return { count: items.length, firstId: items[0].id };
}
