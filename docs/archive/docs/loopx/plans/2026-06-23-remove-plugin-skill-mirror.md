# Remove Plugin Skill Mirror Implementation Plan

> For agentic workers: execute this plan exactly. The goal is to remove the
> generated `plugins/loopx/skills/` mirror and make plugin installation consume
> the canonical package-root `skills/` directory directly.

## Source

- User request: delete the plugin mirror transformation path.
- Existing behavior: `plugins/loopx/scripts/plugin-install.mjs` sets
  `LOOPX_SKILL_SOURCE_ROOT` to `plugins/loopx/skills`, and
  `scripts/sync-plugin-skills.mjs` regenerates that mirror from `skills/`.
- Desired behavior: `skills/` is the only skill payload source. The plugin
  shell keeps plugin provenance, but it no longer contains or verifies a copied
  skill tree.

## Global Constraints

- Preserve existing user edits in skill files. Do not regenerate skills.
- Do not delete canonical files under `skills/`.
- Do not keep a symlink, copy, generated mirror, or alternative mirror under
  `plugins/loopx/skills/`.
- Keep plugin install provenance as plugin channel:
  `distributionChannel: "plugin"` and `sourceUrl` pointing at the plugin root.
- Historical docs, old plans, and archived release notes may mention the old
  mirror. Current product docs, install docs, governance tests, package files,
  and plugin runtime code must not.
- If the Codex plugin manifest requires a `skills` entry that cannot point to
  package-root `skills/`, treat that as a blocking compatibility finding instead
  of silently leaving `"skills": "./skills/"`.

## Surface Inventory

Changed public surfaces:

- Plugin manifest skill discovery field: `plugins/loopx/.codex-plugin/plugin.json`
- Plugin install runtime source root:
  `plugins/loopx/scripts/plugin-install.mjs`
- Package contents and npm scripts: `package.json`
- Governance verifier: `scripts/verify-skills.mjs`
- Governance tests: `test/skill-governance.test.mjs`
- Plugin installer tests: `plugins/loopx/scripts/plugin-install.test.mjs`
- Current product documentation: `README.md`, `README.zh-CN.md`,
  `docs/loopx/cli.md`, `docs/loopx/cli.zh-CN.md`,
  `docs/loopx/specs/installation.md`, `skills/RESOLVER.md`

Strict current product paths to scan:

```bash
rg "sync-plugin-skills|plugin skill mirror|plugins/loopx/skills|PLUGIN_SKILLS_ROOT|mirrors the canonical|\"skills\": \"\\.\\/skills\\/\"" \
  README.md README.zh-CN.md package.json scripts src test plugins/loopx docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md skills/RESOLVER.md
```

Historical/frozen paths that may retain old references:

- `docs/loopx/plans/`
- `docs/loopx/design/` when explicitly describing older design history
- release notes or changelog material

## Implementation Tasks

### Task 1: Runtime, Package, and Governance

**Goal:** remove the generated mirror from runtime and package governance.

Files owned by this task:

- `plugins/loopx/scripts/plugin-install.mjs`
- `plugins/loopx/.codex-plugin/plugin.json`
- `scripts/sync-plugin-skills.mjs`
- `scripts/verify-skills.mjs`
- `package.json`
- `plugins/loopx/skills/`

Required changes:

1. Change `plugin-install.mjs` so `LOOPX_SKILL_SOURCE_ROOT` points at
   `join(REPO_ROOT, "skills")`, not `plugins/loopx/skills`.
2. Remove the `PLUGIN_SKILLS_ROOT` constant.
3. Keep `LOOPX_PROJECT_ROOT: REPO_ROOT`, `LOOPX_DISTRIBUTION_CHANNEL:
   "plugin"`, `LOOPX_INSTALLATION_IDENTITY: "loopx"`, and
   `LOOPX_SOURCE_URL: PLUGIN_ROOT`.
4. Update `plugin.json` so it no longer declares `"skills": "./skills/"` and no
   longer says the plugin mirrors canonical skills.
5. Delete `scripts/sync-plugin-skills.mjs`.
6. Delete `plugins/loopx/skills/`.
7. Remove the `sync-plugin-skills` npm script.
8. Remove `scripts/sync-plugin-skills.mjs` from the package `files` list.
9. Update `scripts/verify-skills.mjs`:
   - stop checking plugin mirror existence/content;
   - stop requiring `scripts/sync-plugin-skills.mjs`;
   - assert `plugins/loopx/skills` does not exist;
   - continue checking canonical bundled skills and package skill surface;
   - continue checking plugin manifest version against package version.

Caller proof commands:

```bash
rg "LOOPX_SKILL_SOURCE_ROOT|LOOPX_SOURCE_URL|DISTRIBUTION_CHANNEL|PLUGIN_ROOT" plugins/loopx/scripts/plugin-install.mjs src/install-discovery.mjs plugins/loopx/scripts/plugin-install.test.mjs
rg "sync-plugin-skills" package.json scripts test plugins/loopx
```

Negative assertions:

```bash
test ! -d plugins/loopx/skills
test ! -e scripts/sync-plugin-skills.mjs
! rg "PLUGIN_SKILLS_ROOT|plugins/loopx/skills|sync-plugin-skills|\"skills\": \"\\.\\/skills\\/\"" package.json scripts test plugins/loopx
```

Verification:

```bash
node scripts/verify-skills.mjs
npm pack --dry-run --json
```

### Task 2: Tests

**Goal:** encode the new contract so the mirror cannot return accidentally.

Files owned by this task:

- `plugins/loopx/scripts/plugin-install.test.mjs`
- `test/skill-governance.test.mjs`

Required changes:

1. Update plugin installer tests so the plugin install materializes installed
   skills from package-root `skills/`, not plugin-root `plugins/loopx/skills`.
2. Keep assertions that installed registry rows use plugin provenance:
   distribution channel `plugin` and source URL equal to the plugin root.
3. Replace mirror equality tests with canonical-source tests:
   - root skill content is installed;
   - root spec templates and referenced files are installed;
   - no plugin mirror directory exists.
4. Update manifest tests so they no longer expect `manifest.skills ===
   "./skills/"`.
5. Update governance tests:
   - remove `node scripts/sync-plugin-skills.mjs --check`;
   - remove byte-identical plugin mirror assertions;
   - assert bundled skill frontmatter remains triggerable;
   - assert package skill surface is explicit;
   - assert `plugins/loopx/skills` and `scripts/sync-plugin-skills.mjs` are
     absent.

Caller proof commands:

```bash
rg "pluginRoot|sourceUrl|distributionChannel|skillSourceRoot|ROOT_SKILLS_DIR|PLUGIN_SKILLS_DIR" plugins/loopx/scripts/plugin-install.test.mjs test/skill-governance.test.mjs
```

Negative assertions:

```bash
! rg "sync-plugin-skills|PLUGIN_SKILLS_DIR|mirrors the canonical|byte-identical|plugins/loopx/skills" plugins/loopx/scripts/plugin-install.test.mjs test/skill-governance.test.mjs
```

Verification:

```bash
node --test plugins/loopx/scripts/plugin-install.test.mjs test/skill-governance.test.mjs
```

### Task 3: Current Product Documentation

**Goal:** current documentation describes one canonical skill source and no
mirror regeneration workflow.

Files owned by this task:

- `README.md`
- `README.zh-CN.md`
- `docs/loopx/cli.md`
- `docs/loopx/cli.zh-CN.md`
- `docs/loopx/specs/installation.md`
- `skills/RESOLVER.md`

Required changes:

1. Remove instructions to run `npm run sync-plugin-skills`.
2. Remove claims that plugin skills are mirrored/generated under
   `plugins/loopx/skills`.
3. Describe `skills/` as the canonical installed skill source for both normal
   and plugin installs.
4. Preserve existing unrelated content and wording.

Caller proof commands:

```bash
rg "skills/|plugin" README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md skills/RESOLVER.md
```

Negative assertions:

```bash
! rg "sync-plugin-skills|plugin skill mirror|plugins/loopx/skills|mirrors the canonical" README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md skills/RESOLVER.md
```

Verification:

```bash
node scripts/verify-skills.mjs
```

## Final Verification

Run all of these before completion:

```bash
test ! -d plugins/loopx/skills
test ! -e scripts/sync-plugin-skills.mjs
! rg "sync-plugin-skills|PLUGIN_SKILLS_ROOT|plugins/loopx/skills|\"skills\": \"\\.\\/skills\\/\"" package.json scripts test plugins/loopx README.md README.zh-CN.md docs/loopx/cli.md docs/loopx/cli.zh-CN.md docs/loopx/specs/installation.md skills/RESOLVER.md
node --test plugins/loopx/scripts/plugin-install.test.mjs test/skill-governance.test.mjs
npm test
npm pack --dry-run --json
```

Expected outcome:

- `plugins/loopx/skills/` is gone.
- `scripts/sync-plugin-skills.mjs` is gone.
- Plugin installation copies from package-root `skills/`.
- Installed plugin skills still record plugin provenance.
- Current docs no longer tell maintainers to maintain a mirror.
