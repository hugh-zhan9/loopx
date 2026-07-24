// Ordered hook registry; register returns an unsubscribe function.
export function createHookRegistry() {
  const hooks = [];
  return {
    register(hook) {
      if (typeof hook !== 'function') {
        throw new TypeError('hook must be a function');
      }
      hooks.push(hook);
      return () => {
        const index = hooks.indexOf(hook);
        if (index !== -1) {
          hooks.splice(index, 1);
        }
      };
    },
    list() {
      return [...hooks];
    },
  };
}
