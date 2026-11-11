# Review coverage during execution

A slice's `review` line names a risk, not automatically a new reviewer or a stop
after that slice. Follow the review points recorded in the plan: several slices
may share one independent review of their integrated behavior before completion
or release. For an older plan with only risk labels, record their review points
from the existing contract before dispatch. Preserve explicit per-slice gates.
Never postpone review past an unsafe dependent action, an irreversible operation,
or an explicit user/repository requirement. Keep pending shared review visible
even when its implementation slices are done; it still blocks plan completion.

The controller checks findings against source requirements, code and concrete
consequences; severity labels alone are not repair instructions. Explain rejected
findings with evidence and resolve material disagreements with focused evidence.
Optional improvements do not block completion.

Batch confirmed findings into a repair assignment when ownership permits.
Confirmed Critical or Important findings require correction, fresh affected
verification and independent re-review of the fixes and affected behavior. Do not restart a
full review for each finding. Reopen unaffected coverage only for new contradictory
evidence; an unresolved finding cannot be waived to meet a review-count limit.

At integration, inspect the final diff against existing independent review
coverage. Reuse findings on unchanged content and review remaining changes and
interactions. Do not repeat every slice review solely because work has reached
integration. A plan/design review never substitutes for required code review.
Record reviewed content, scope, findings and remaining coverage in the existing
plan so reuse is supported by evidence, not just an earlier pass verdict.

## Task and requirement review

Use [task scope](../../shared/task-scope.md) to identify local acceptance and the
requirement-level integration still needed. A task review checks its original source
sections, shared constraints and affected consumers; final integration checks full
requirement coverage and interactions. Reuse unchanged evidence, but reopen affected
coverage for shared-contract changes. Do not add a review merely for each task or
repeat settled design review when the implementation needs verification.
