# Fix Report Contract

`issue` creates the intake, diagnosis, Fix Brief, Response Draft, Handoff, and Evidence Log sections. It should not pre-fill execution, review, verification, or closeout content.

When executing a ready ledger, append or update these sections:

```markdown
## Execution Reports

- status: fixed | failed | blocked | needs_scope_change
- actual_changed_files:
  - <path>
- verification:
  - command: <command>
    result: pass | fail
- notes: <execution summary>

## Reviews

- integration_check:
  - status: clean | findings_addressed | blocked
  - findings:
    - <scope, ledger, diff, or combined-behavior finding or none>
- independent_review:
  - trigger: <explicit request, security, destructive behavior, public compatibility, cross-task interaction, reconciled conflict, or none>
  - status: not_required | clean | findings_addressed | blocked
  - findings:
    - <finding or none>
- review_decisions:
  - <Critical/Important finding handled, pushed back with evidence, or none>

## Verification

- final_commands:
  - command: <command>
    result: pass | fail | not_run
- regression_test_result: <summary>
- evidence: <fresh verification evidence>

## Closeout

- status: complete | failed | blocked
- response_draft: <final user/reporter response>
- git_disposition: requested | not_requested | blocked
```
