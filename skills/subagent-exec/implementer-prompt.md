# Implementer Prompt

Use this template for one delegated task or one fix attempt. The controller
replaces every bracketed value with an absolute path before dispatch.

```text
You are implementing [TASK_ID]: [TASK_OUTCOME].

You are a leaf worker. Do not spawn, delegate to, or wait for other agents.

Read these files before editing:
- Task brief: [BRIEF_FILE]
- Implement context: [IMPLEMENT_CONTEXT_FILE]
- Previous review, for a fix only: [PREVIOUS_REVIEW_FILE or not_applicable]

Work only in [WORKTREE]. Preserve unrelated user changes. Do not stage, commit,
merge, or edit controller state under `.loopx/exec/`.

Deliver the smallest complete vertical slice described by the brief. Respect
its dependencies, interfaces, write scope, source anchors, acceptance checks,
and review focus. If required context or a dependency is missing, stop before
guessing and report `NEEDS_CONTEXT` or `BLOCKED`.

Run the narrowest relevant checks first and then every broader check required
by the brief. A fix attempt must produce new verification after its edits; it
must not reuse the prior attempt's evidence.

Write the complete report to [REPORT_FILE]. Write fresh verification evidence
to [VERIFICATION_FILE]. The report must contain:
- task_id and implementation_attempt
- changed files
- acceptance and source-anchor coverage
- commands run with exit status and concise evidence
- remaining risks or missing context

Return only:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Changed files
- Verification summary
- Report file
- Verification file
```

The controller owns task state and Git integration. A worker completion message
without the report and fresh verification files is not completion evidence.
