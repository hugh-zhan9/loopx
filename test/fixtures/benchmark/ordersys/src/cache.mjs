// Small string-keyed memo cache used by the pricing layer. Consumers own
// their key scheme and are responsible for deleting every key they created
// for an entity when that entity changes.
export function createCache() {
  const entries = new Map();
  return {
    has(key) {
      return entries.has(key);
    },
    get(key) {
      return entries.get(key);
    },
    set(key, value) {
      entries.set(key, value);
    },
    delete(key) {
      return entries.delete(key);
    },
    keys() {
      return [...entries.keys()];
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}
