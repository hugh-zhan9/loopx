---
schema: custom-plan/v9
source: docs/request.md
status: ready
slices:
  - id: P-001
    status: pending
    depends: []
  - id: P-002
    status: pending
    depends: []
---

# Register Alpha And Beta Plugins

## Goal And Boundaries

Register both `alpha` and `beta` plugins in `src/registry.mjs`.

## P-001 Register alpha

Register `alpha` in `src/registry.mjs` and add helper export in `src/a.mjs`.

> writes: `src/a.mjs, src/registry.mjs`
> anchors: AC-1
> architecture: reuse src/registry.mjs
> verify: `node -e "import('./src/registry.mjs')"`

## P-002 Register beta

Register `beta` in `src/registry.mjs` and add helper export in `src/b.mjs`.

> writes: `src/b.mjs, src/registry.mjs`
> anchors: AC-2
> architecture: reuse src/registry.mjs
> verify: `node -e "import('./src/registry.mjs')"`
