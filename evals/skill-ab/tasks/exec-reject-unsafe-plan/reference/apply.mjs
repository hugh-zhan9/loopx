export async function applyReference() {
  return {
    responseText:
      'Blocked before dispatch: `docs/loopx/plans/2026-11-23-parallel-conflict.md` uses unknown schema `custom-plan/v9` (expected `loopx-plan/v1`) and declares independent parallel slices `P-001` and `P-002` with overlapping `writes` on `src/registry.mjs` (`depends: []`). No files were modified.',
  };
}
