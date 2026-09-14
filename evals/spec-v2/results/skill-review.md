# Independent review of spec-v2 0.2.0

Reviewed the exact `/tmp/loopx-spec-v2-0.2.patch`, the prior `spec-v2` directory identified by `/tmp/loopx-spec-v2-current-backup`, the final `skills/spec-v2` documents, and relevant `design-review`, `plan2exec`, shared architecture and concurrency contracts. No repository files were changed.

## Findings

1. **Proposal completion still requires an alternative after the new scaffold explicitly permits omitting one.** `skills/spec-v2/references/design-proposal.md:53–56` newly says not to invent a second option; the retained completion rule at line 199 still requires at least one rejected alternative unless the decision is “truly mechanical.” A non-mechanical design can have only one credible option under accepted constraints, and a user-requested proposal still triggers this reference. Such a proposal cannot satisfy both instructions without a contrived rejected option or an artificial claim that the decision is mechanical. This retains the template pressure the revision intends to remove. Qualify the completion rule by whether a credible alternative exists, and allow the evidence-backed constraint to explain its absence.

2. **The new walkthrough wording does not clearly support valid sources without TC IDs.** `skills/spec-v2/references/design-quality.md:9–12` asks for an existing source `TC-*` normal scenario, then prohibits allocating new TC IDs. `SKILL.md:27–29` accepts an approved request, PRD or requirements document, which may contain perfectly clear prose examples without identifiers. The phrase “when applicable” and subsequent exception address exceptional paths but leave the normal-scenario identifier requirement ambiguous. An agent may therefore route a sufficient source back for intake work or omit useful semantic checking because it has no TC ID. Prefer existing TC IDs when present; otherwise cite a source section or concrete source-backed example without inventing IDs.

## Other reviewed boundaries

- The adaptable templates preserve the required decision, architecture, boundary, status, verification and downstream information through the skill body and shared contracts. I found no substantive lost architecture/concurrency requirement.
- The trial handoff explicitly carries the selected template and maps legacy design-review section numbers to actual content; no additional handoff incompatibility was found.
- Scenario walkthroughs, render checks and link checks remain document QA without a new approval or execution stage.
- `git diff -- skills/spec` was empty and `git status --short -- skills/spec skills/spec-v2` showed only the untracked trial directory; the original spec has no tracked modification.

Review limitations: this is a document-contract review, not a live downstream skill execution or a test of generated artifacts.

## Re-review after fixes

Re-read the current `references/design-quality.md` walkthrough rule and the current `references/design-proposal.md` rationale and completion criteria. Both original findings are resolved:

- Walkthroughs now accept a source section or concrete source example when TC IDs do not exist, preserving semantic checking without forcing an intake-ID process.
- Both proposal rationale and completion now permit an evidence-backed explanation that constraints leave only one credible approach; they no longer require an invented competing option.

No additional findings in these changes. The re-review remains a document-contract inspection, not execution of downstream skills.
