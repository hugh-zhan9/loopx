export function parsePage(input) {
  if (input === undefined || input === null || input === '') return 1;
  if (typeof input !== 'string' || !/^[0-9]+$/.test(input)) {
    throw new TypeError('page must contain decimal digits');
  }
  const page = Number(input);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('page must be a positive safe integer');
  }
  return page;
}
