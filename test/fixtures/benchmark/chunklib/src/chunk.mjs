export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('size must be a positive integer');
  }
  const pages = [];
  const pageCount = Math.floor(items.length / size);
  for (let page = 0; page < pageCount; page += 1) {
    pages.push(items.slice(page * size, page * size + size));
  }
  return pages;
}
