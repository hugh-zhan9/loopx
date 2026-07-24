# Cursor Manual Workflow (FitPulse)

Use isolated workspace copies. Overlay product sources into the harness; do not
open `sources/` itself as the project root.

## Prepare arms

```bash
ROOT="$(pwd)"
HARNESS="$ROOT/test/fixtures/req-demo/harness"
SRC="$ROOT/test/fixtures/req-demo/sources/fitpulse"
STAMP="$(date +%Y%m%d-%H%M%S)"
BASE="$ROOT/.loopx/evals/req-demo/cursor/$STAMP"
mkdir -p "$BASE"

for ARM in bare loopx-a loopx-b; do
  DEST="$BASE/$ARM"
  cp -R "$HARNESS" "$DEST"
  mkdir -p "$DEST/docs/product" "$DEST/.loopx/intake"
  cp "$SRC/REQUIREMENTS.md" "$DEST/docs/product/REQUIREMENTS.md"
  cp -R "$SRC/intake/2026-07-22-fitpulse-v1" "$DEST/.loopx/intake/2026-07-22-fitpulse-v1"
  git -C "$DEST" init -q
  git -C "$DEST" add -A
  git -C "$DEST" commit -qm "fixture baseline"
done
```

Install loopx only into `loopx-a` / `loopx-b`.

## Prompt for `bare`

```text
You do not have loopx skills. The product contract is FitPulse from
`docs/product/REQUIREMENTS.md` and the approved intake at
`.loopx/intake/2026-07-22-fitpulse-v1/`. Do not modify either. Ignore harness
packaging as product scope. First write an implementation plan to `PLAN.md`,
then implement FitPulse according to that plan. Do not invent loopx workflow
stages.
```

## Prompt for `loopx-a` / `loopx-b`

```text
Clarify is already complete. Use the approved intake at
`.loopx/intake/2026-07-22-fitpulse-v1/` and do not modify it. Do not re-run
clarify. The product contract is FitPulse from that intake and
`docs/product/REQUIREMENTS.md`. Run loopx skills in this exact order:
1. spec
2. plan2exec
3. exec
4. final-review

Use slug `fitpulse-v1` and date `2026-07-22` so artifacts land at:
- docs/loopx/design/2026-07-22-fitpulse-v1/需求设计文档.md
- docs/loopx/plans/2026-07-22-fitpulse-v1.md
```

## After each arm

```bash
cd "$BASE/<arm>"
npm test
git status --short
```

Record results in [SCORECARD.md](./SCORECARD.md).
