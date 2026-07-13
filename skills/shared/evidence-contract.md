# Verification Evidence Contract

Completion evidence is a durable record, not a confidence statement.

```yaml
command: npm test
cwd: /absolute/repository/path
timestamp: 2026-07-13T00:00:00.000Z
exit_code: 0
scope: focused | full
result: pass | fail | blocked
output_summary: 84 tests passed, 0 failed
skipped_checks: []
environment_constraints: []
```

## Rules

- Record the command actually run and its working directory.
- Use fresh output from the code under review.
- `focused` evidence proves only the named surface; it does not imply the full
  suite passed.
- A blocked environment is recorded as `result: blocked`, with the missing
  dependency in `environment_constraints`.
- Skipped checks require a reason and remain visible to review and finish.

