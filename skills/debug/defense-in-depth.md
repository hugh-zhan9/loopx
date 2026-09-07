# Validation at Required Boundaries

Use this technique after identifying the cause of an invalid-data failure and
when repair is authorized. Additional checks must enforce an existing required
invariant or a named failure scenario; do not validate at every layer by default.

## Choose the owning boundary

Trace where invalid data enters and where it becomes dangerous. Determine whether
one existing boundary covers every supported path. Reuse its validation when it
does. Add another check only when a real caller or trust boundary can bypass it,
and explain which case that check prevents.

For example, an empty working-directory argument may cause a subprocess to use
the current directory. Reject the empty argument at the boundary that owns the
operation. If independent callers bypass the public API, that shared operation
may need the check instead of duplicating it in every caller.

## Check the actual invariant

Existence, directory type, authorization, and containment are different questions.
A textual path prefix is not proof of containment: sibling names and symlinks can
cross the intended boundary. Use repository-tested path handling when containment
is required, and test the relevant escape cases. Do not introduce a filesystem
security policy merely to repair unrelated test setup.

## Verify and avoid duplication

Add regression coverage for the original failure and each distinct bypass path
that justifies another check. A passing test proves those scenarios, not that a
bug is impossible. Diagnostic logging may help locate failures, but it does not
prevent invalid operations and is not another validation layer.

Keep temporary instrumentation attributable and remove it after investigation,
unless lasting logging is itself required by the task. Preserve required failure
semantics; no new retries, fallback, or recovery policy follows from this technique.
