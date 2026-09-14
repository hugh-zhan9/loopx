# loopx Behavior Drills

Exercises for skill selection, document handoffs and working-agreement rules.
An agent answers a concrete task using the supplied descriptions or contract
text. An independent verifier judges the answer against a separate rubric.
The JSON scenarios are decision exercises; they do not prove that an agent can
complete the corresponding repository change or document workflow. Runnable
fixtures below check a small part of actual task execution.

Drills are the safety net for skill-text changes: run them before and after
editing any contract under `subject_paths`, and compare against the committed
baseline. They are maintainer diagnostics, not part of `npm test`.

## Guarantees Covered

| Scenario | Guarantee |
|---|---|
| `review-gate-fail-closed` | Open Critical findings block integration until fixed, freshly verified, and independently re-reviewed. |
| `escalation-stop` | Unresolved public-compatibility decisions stop execution before mutation and escalate to the user. |
| `leaf-no-spawn` | A dispatched leaf worker never spawns, delegates to, or waits for other agents. |
| `verification-honesty` | No completion claim without fresh verification covering the final state. |
| `skill-selection` | Ten Chinese requests cover positive, negative and easily confused skill choices. |
| `authorized-continuation` | A follow-up within an authorized document correction does not require another approval. |
| `local-helper-choice` | Local reuse within an existing module does not require a new design or persistent plan. |
| `design-plan-handoff` | Approved ownership, compatibility and acceptance conditions survive the overview and plan handoff. |
| `diagnosis-only` | Diagnosis ends with findings and needs no new ledger or fabricated hypothesis. |
| `authorized-repair` | An authorized repair continues through verification without another workflow entry. |
| `ledger-resume-mismatch` | Unattributed changes after a checkpoint stop a resumed repair. |
| `plan-format-followup` | Resolved findings stay closed; wording and layout do not restart full review. |
| `plan-completed-work` | Verify actual completed work instead of replaying plan admission. |
| `plan-acceptance-drift` | Matching IDs cannot excuse changed behavior or unauthorized acceptance deferral. |
| `plan-shared-ordering` | Destructive migration order remains a real blocker despite disjoint files. |
| `clarify-independent-questions` | Ask independent decisions together and wait for prerequisites before dependent questions. |
| `refactor-direct-handoff` | An approved refactor proposal can guide implementation directly. |

## Method

- The agent prompt is the scenario task plus the current contract files named
  in `subject_paths`, read from the working tree at run time. Editing a
  contract and re-running drills therefore measures the edited text.
- `skill_descriptions: true` also supplies names and descriptions from the
  target repository's published skill list. Selection-only scenarios use an
  empty `subject_paths` list; their prompt contains no skill bodies or rubric.
- Scenario tasks must not quote the contract under test. The loader checks
  lines from `subject_paths` against the task and rubric. Description-only
  scenarios have no such subjects, so review their catalog and task together
  for copied descriptions or hints that give away the expected choice.
- The verifier model must differ from the model under test; the runner refuses
  to start otherwise. Verdicts are fail-closed: anything other than one
  well-formed verdict block scores `unknown`, and `unknown` never passes.
- Run 5+ replicates per scenario. A scenario passes only when every replicate
  holds. A held rate strictly between 0 and 1 is flagged `unstable`: the
  wording does not bind reliably, which is a contract defect even when the
  majority held.

## Run

```bash
npm run eval:drills -- --dry-run   # validate scenarios, no model calls

npm run eval:drills -- \
  --live \
  --model <model-under-test> \
  --judge-model <different-model> \
  --replicates 5
```

Reports land in `.loopx/evals/drills/<timestamp>/` (`report.json`,
`report.md`, raw transcripts and verdicts per run). Record an accepted run as
the new baseline with `--record-baseline`, which writes
`evals/drills/baselines/<date>-<model>.json`; commit that file.

## Baseline Discipline

1. Establish a baseline on the current contract text before editing it.
2. After the edit, run the same scenarios, models, and replicate count.
3. A text change is acceptable only when every scenario's held count and
   stability are not worse than baseline.
4. Investigate every `violated` and `unknown` transcript before concluding
   anything; verifier misjudgments are corrected by fixing the rubric, never
   by hand-editing verdicts.

For a host-native exploratory run, keep the exact prompts, source versions or
hashes, answers, extra questions, loaded material and independent judgments.
Report only token and duration measurements actually supplied by the host.
Use the same tasks before and after a wording change. A single run can expose
an ambiguity; it cannot establish a general improvement in quality or cost.
Keep exploratory results separate from repeated live-run baselines.

## Completed implementation fixture

`fixtures/completed-plan/` is a small runnable feature with stale plan status.
Copy it to an isolated directory, provide the current `exec`, `plan2exec` and shared
skill resources, and give the acting agent only `TASK.md` and those inputs. Capture
its commands and final files. Check the actual result against `requirements.md`,
verify the tests, and compare the original code/test hashes; do not infer success
from its final claim alone. This fixture is maintainer evaluation data and is not
published or executed by loopx. The September 14 [evaluation record](results/2026-09-14-plan-simplification/RESULTS.md)
contains the collected answers and the concrete fixture run, with their limits.

## Refactor audit and documentation update fixtures

`fixtures/refactor-audit/` asks for findings on two report functions with shared
formatting but different return types. Provide the current `refactor-plan` skill
in an isolated copy. Inspect the findings and compare source files afterward;
an audit request should not produce code changes or an implementation plan.

`fixtures/codebase-update/` asks for an update to an existing pagination document.
Provide the current `codebase-spec` skill in an isolated copy. Check the resulting
document against the implementation, retain unrelated notes, run its tests, and
compare code and test files afterward.

The [September 14 evaluation](results/2026-09-14-refactor-merge/RESULTS.md) records
both tasks and a verification-honesty answer using the working agreement and
shared evidence contract after removal of the standalone `verify` skill. These
are single exploratory runs, separate from repeated live-run baselines.
