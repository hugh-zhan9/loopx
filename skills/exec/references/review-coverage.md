# Review coverage during execution

A slice's `review` line names a risk, not automatically a new reviewer or a stop
after that slice. Follow the review points recorded in the plan: several slices
may share one independent review of their integrated behavior before completion
or release. For an older plan with only risk labels, record their review points
from the existing contract before dispatch. Preserve explicit per-slice gates.
Never postpone review past an unsafe dependent action, an irreversible operation,
or an explicit user/repository requirement. Keep pending shared review visible
even when its implementation slices are done; it still blocks plan completion.

Batch findings from one review into a repair assignment when ownership permits.
Critical or Important findings require correction, fresh affected verification,
and independent re-review of the fixes and affected behavior. Do not restart a
full review for each finding. Reopen unaffected coverage only for new contradictory
evidence; an unresolved finding cannot be waived to meet a review-count limit.

At integration, inspect the final diff against existing independent review
coverage. Reuse findings on unchanged content and review remaining changes and
interactions. Do not repeat every slice review solely because work has reached
integration. A plan/design review never substitutes for required code review.
Record reviewed content, scope, findings and remaining coverage in the existing
plan so reuse is supported by evidence, not just an earlier pass verdict.
