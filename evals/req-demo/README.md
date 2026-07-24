# Requirements-Driven Workflow Demo (FitPulse)

This opt-in maintainer diagnostic compares product outcomes after a **manual
clarify** handoff for FitPulse.

`spec → plan2exec → exec → final-review` applies only to installed loopx arms.
Bare / no-loopx uses `docs/product/REQUIREMENTS.md` → `PLAN.md` → implement.

## Directory split

| Path | Role |
|------|------|
| `test/fixtures/req-demo/sources/fitpulse/` | Product truth: REQUIREMENTS + seeded intake |
| `test/fixtures/req-demo/harness/` | Agent workspace shell only (not the product contract) |
| `evals/req-demo/cases.json` | Runner matrix; overlays sources into harness at runtime |

The agent never receives the `sources/` tree as its project root. Eval copies
`harness/`, then overlays:

- `sources/fitpulse/REQUIREMENTS.md` → `docs/product/REQUIREMENTS.md`
- `sources/fitpulse/intake/2026-07-22-fitpulse-v1/` → `.loopx/intake/2026-07-22-fitpulse-v1/`

The intake currently mirrors the approved package from
`~/project/fitpulse/.loopx/intake/2026-07-22-fitpulse-v1/`. Re-copy that directory
into `sources/fitpulse/intake/` after further clarify edits, or update
`cases.json` paths.

## Arms

| Arm | Install | Workflow |
|-----|---------|----------|
| `no-loopx` / `bare` | none | FitPulse requirements → `PLAN.md` → implement |
| `version-a` / `installed` | loopx | intake → `spec` → `plan2exec` → `exec` → `final-review` |
| `version-b` | loopx candidate | same loopx workflow |

## Local agent runtimes

### Codex

```bash
npm run eval:req-demo -- \
  --live \
  --runtime codex \
  --model <exact-model-id> \
  --effort high \
  --replicates 2 \
  --order crossover
```

Three-way:

```bash
npm run eval:req-demo -- \
  --live \
  --runtime codex \
  --baseline-ref v0.5.1 \
  --candidate-ref HEAD \
  --model <exact-model-id> \
  --effort high \
  --replicates 2 \
  --order crossover
```

### Claude Code

```bash
npm run eval:req-demo -- \
  --live \
  --runtime claude \
  --model <exact-model-id> \
  --replicates 2 \
  --order crossover
```

### Cursor (manual)

See [MANUAL.md](./MANUAL.md) and [SCORECARD.md](./SCORECARD.md).

## Quality Before Resources

Shared verification uses the harness `npm test` artifact check (plan/design
presence), not a full Tauri E2E suite.

- Bare: must produce `PLAN.md` mentioning FitPulse
- Installed: must produce FitPulse design + plan with `AC-001` and
  `loopx.execution-graph.v1`
- Extra implementation files are allowed (`required_changed_paths`)

Only quality-passed runs may support favorable token/latency claims.
