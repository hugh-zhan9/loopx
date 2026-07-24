export function parseIsoUtc(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`invalid ISO timestamp: ${iso}`);
  }
  return date;
}

export function dayKeyUtc(date) {
  return date.toISOString().slice(0, 10);
}
