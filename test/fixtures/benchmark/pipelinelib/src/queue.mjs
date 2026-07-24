// Plain FIFO queue.
export function createQueue() {
  const items = [];
  return {
    enqueue(item) {
      items.push(item);
    },
    dequeue() {
      if (items.length === 0) {
        throw new RangeError('queue is empty');
      }
      return items.shift();
    },
    peek() {
      return items.length > 0 ? items[0] : undefined;
    },
    get size() {
      return items.length;
    },
  };
}
