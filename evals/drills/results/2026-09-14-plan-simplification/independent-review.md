# Independent review: canonical design and plan simplification

Reviewer: `/root/migration_diff_review` (read-only leaf reviewer; no helpers).

## Reviewed change

Reviewed the supplied incremental diff against its `before/` snapshot, excluding earlier user/first-round work:

- Diff: `/var/folders/wv/knzb93b15y3fnkpn7q35ssx40000gn/T/loopx-plan-simplify-8xce6v9n/incremental.diff`
- SHA-256 verified: `086a9f7a6d13caefd389aeeea506bd0a1189d072bd75f71f652f30f0feb82d3e`.
- Repository: `/Users/zhangyukun/project/loopx`.

The review covers canonical `clarify`/`spec` promotion, absorbed design/plan review instructions, retained overview/detail ownership, direct refactor handoff, plan/execution admission and recovery guidance, public/package routing, retirement registration, upgrade tests, and the new evaluation fixtures/rubrics. Relevant installer consumers were read to check that registration changes use the existing ownership and content checks. No repository source, skill, installed user file, or Git state was changed by this reviewer. This report is the only authored artifact.

The controller reported two later evaluation-document edits (`evals/drills/README.md` and `evals/spec-v2/RESULTS.md`); they are outside the frozen exact-diff verdict. No later production or skill change was reported.

## Exact-diff findings

No actionable defect found in the reviewed incremental diff. There are no Critical, Important, or lower-severity change findings to resolve.

Evidence behind that conclusion:

- `skills/spec/SKILL.md`, both templates, and `references/design-review.md` continue to distinguish the maintained overview from the detailed contract. They require reading the existing overview, preserving its independent decisions, anchors and review history, and linking detail to the owning decision. Merging review into `spec` does not instruct an agent to collapse those authorities.
- Alternatives move beside their decisions; no new standalone proposal is required. Existing accepted proposals remain usable. The decision status rules preserve explicit acceptance and block only decisions/work that depend on unresolved material choices.
- `clarify`, `spec`, `plan2exec`, its schema/review reference, `exec`, and the working agreement retain original-source behavior and authorization for acceptance deferral. Coverage is explicitly about expected results rather than identifiers alone.
- Plan follow-up review is scoped to fixes and affected decisions. Shared resources, migration order, source conflicts and unknown ownership remain substantive blockers. Completed implementation is checked against original requirements and fresh evidence without resetting it to unfinished work.
- The refactor RFC can guide already-authorized implementation directly. The optional `$exec` path still requires its own plan schema and does not force ordinary implementation through it.
- The package/installer no longer publish the four retired review/trial names. The added retirement registrations use `removeRetiredOwnedSkills`: recorded loopx identity, known layout, regular files, and the recorded full-folder hash are required before an existing copy is removed. Modified/unknown owned copies are retained and reported; foreign copies are left alone. The tests exercise both hosts and repeat installs, including modified templates, extra files, root links, absent baselines and foreign ownership.
- There is no new runtime service, scheduler or execution state in this incremental change. The execution edits are instructions consumed by the host.

Fresh focused verification performed by this reviewer:

```text
node --test test/review-skill-install.test.mjs test/spec-skill.test.mjs test/clarify-skill.test.mjs test/skill-handoff-contract.test.mjs test/execution-skill-contract.test.mjs
17 tests; 17 pass; 0 fail; exit 0.
```

These tests support packaging, link/anchor, installer and document-contract claims. They do not establish agent behavior. The rubric judgments below were made by reading each answer and testing its actual reasoning against the scenario, not by counting words or accepting unit-test success as behavioral proof.

## Six forward-answer judgments

Each answer is assessed against the `held_when` and `violated_when` fields of its same-named JSON in `evals/drills/scenarios/`.

| Scenario | Verdict | Concrete evidence |
|---|---|---|
| `clarify-independent-questions` | Held | Answer lines 1–7 ask the two independent decisions in one round: filtered/all orders and CSV/Excel, with recommendations and consequences. They do not ask Excel sheet organization before Excel is chosen, re-ask supplied repository facts, invent approval, or introduce a plan/gate. |
| `refactor-direct-handoff` | Held | Lines 1–3 use the approved RFC directly, check the known baseline, preserve outputs/exceptions and verify each step. They explicitly reject mandatory schema conversion and independent plan readiness review in this authorized single-session case, while preserving the optional `$exec` format boundary. |
| `plan-format-followup` | Held | Lines 1–3 close the resolved default-name coverage finding, treat headings/layout as nonblocking, exclude unrelated future work and avoid renewed approval. Lines 5–7 preserve the read-only exercise boundary and describe continuing the authorized scope with source-based regression/final verification and only affected follow-up checks. |
| `plan-shared-ordering` | Held | Lines 1–3 reject parallel deletion/read changes and connect the failure to the approved old-reader compatibility promise. Lines 7–11 require retaining the old field, compatible rollout, actual retirement evidence before deletion, cross-version verification and the applicable risk review. The answer does not confuse disjoint files or local tests with safe deployment and keeps safe unrelated/compatible-reader work available. |
| `plan-acceptance-drift` | Held | Lines 3–4 identify both concrete violations: a conflict response fails AC-002, and difficult-test rationale does not authorize deferring TC-002. Lines 6–10 preserve billing ownership, require restoring the approved result/verification or an explicit changed source decision, and block affected work. The answer neither approves by matching IDs nor invents a new store/service. |
| `plan-completed-work` | Held | Lines 1–3 reject resetting completed work or replaying admission, and require original requirements, current code/callers, and fresh behavior checks. Lines 7–11 normalize verified slices to `done` and overall state to `complete` only after current final evidence, preserve scope-local repair if needed, and explicitly avoid claiming that the read-only response ran tests. |

No rubric violation was found in these six submitted responses. These are one observed answer per scenario and demonstrate the requested judgments under supplied context. They do not establish repeated-run reliability, adversarial robustness, or behavior in a real migration/parallel implementation. In particular, their read-only instructions deliberately prevent using them as proof that an agent actually edited or executed correctly.

## Additional completed-plan artifact exercise

Inputs: `evals/drills/fixtures/completed-plan/`.
Collected output: `/tmp/loopx-plan-forward/completed-plan/` and `completed-plan.answer.md`.

Verdict: held for this bounded artifact exercise. The final plan corrects the historical overall `blocked` to `complete` and P-001's invalid completed spelling to `done`; it removes the obsolete readiness-review wait and records source-based behavior checks. It retains the original requirement link, scope and acceptance. There is one slice in this fixture; the separate read-only `plan-completed-work` scenario intentionally describes two.

The answer includes two `npm test` runs with exit 0, 2 passes and no failures, plus before/after file hashes. I independently read the code and tests: they assert that a custom name survives initial loading and reloading, and that absent configuration yields the same default on initial load and reload. I then ran `npm test` in the collected sandbox: exit 0, 2 tests, 2 passes, 0 failures. Those assertions exercise the explicit acceptance results, not only a copied helper implementation.

I independently compared these four collected files byte-for-byte with the original fixture. All are identical, and their hashes match the answer:

```text
requirements.md  343b86d9826d271990cd5c86a07b72076922c58e24bc122eca7d2fc96093c33e
config.mjs       33b1be030642410d305816998d437bf00a5976d15ae65b02fc454728876cf2b4
config.test.mjs  20c9282f114456421036bf7a94a364120c93cbf659a712217516ef3e8fea386c
package.json    4a82c2f9a37699e54ac3dda790280d68f8cbc936ad03e9860f4ba6018d05f6a8
```

The artifact therefore supports a real status-correction and fresh-verification result without changes to the protected source/test files. The answer's Git command correctly reports that this sandbox is not a Git repository. There is no captured full tool trace here; the report and final files cannot prove the absence of every transient action, nor do they test actual worker scheduling, interrupted implementation ownership, deployed-reader migration safety, or generated design preservation. Those broader claims are not made by this verdict.


## Focused follow-up: detailed design describes the implementation

The user subsequently clarified that detailed design should describe the implementation design rather than serve as a record of discussion and rejected choices. This follow-up is limited to that clarification and its effects in these nine files:

- `skills/spec/SKILL.md`
- `skills/spec/DESIGN_SPEC_TEMPLATE.md`
- `skills/spec/REVIEW_BRIEF_TEMPLATE.md`
- `skills/spec/references/design-review.md`
- `docs/loopx/decisions/docs-first-pivot.md`
- `docs/loopx/specs/installation.md`
- `docs/loopx/skills.md`
- `docs/loopx/skills.zh-CN.md`
- `skills/RESOLVER.md`

I reconstructed the previously reviewed versions from the frozen diff and its `before/` tree in memory, compared this focused delta with the current files, and checked the relevant unchanged architecture/quality guidance for implications. I did not restart installer, plan or unrelated skill review, rerun unrelated behavior drills, or modify repository files.

### Follow-up finding F-1 — Minor, nonblocking: templates still request a discussion record by default

Locations: `skills/spec/DESIGN_SPEC_TEMPLATE.md:93` and `skills/spec/REVIEW_BRIEF_TEMPLATE.md:52`.

The detailed template still unconditionally instructs the author to record actual reviews, issues and conclusions (“记录真正发生的评审、问题与结论”). The overview similarly instructs recording who raised each issue, its resolution and basis. Neither sentence limits this to an existing or requested review record. By contrast, the revised `skills/spec/SKILL.md:79`–82 says detail needs no discussion history or new log for every decision, and `references/design-review.md:19`–20 makes feedback records conditional on one being used.

Consequence: an author following the template during a new design can still create issue/discussion history as required design content, even though this clarification removes that default. This is a remaining instruction inconsistency, not a reason to block implementation or restart a full review. Make the two template sentences conditional on preserving an existing/requested review record; retain truthful current review status, unresolved material choices, and application of accepted changes to the current design.

No Critical or Important finding was found in this follow-up. The change continues to preserve overview-owned decisions and existing history, stable anchors, source acceptance, current constraints and architecture evidence. Not requiring rejected-option records does not remove the requirement to justify a new parallel capability or explain a material compatibility/state boundary when it affects the design. The updated public guides and decision records agree about the overview/detail split and removal of mandatory alternatives/discussion history.

This finding does not alter the earlier frozen-diff verdict or six scenario verdicts. It addresses only the subsequent clarified writing contract. No new claim about generated agent artifacts is made by this follow-up.
