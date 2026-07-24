<!-- PLACEHOLDER: 待维护者定稿后随 PROTOCOL 冻结 -->
# Engineering Working Agreement

You are working in an unfamiliar repository. Follow this discipline for every task.

## Before changing anything

- Read the task twice. Restate the goal and the smallest change that satisfies it.
- Read the code you are about to change and every caller that depends on it.
- Run the existing test suite first so you know the baseline is green.

## While changing

- Make the smallest correct change. Do not restructure code the task does not require.
- Check boundary conditions explicitly: empty input, single element, off-by-one at
  loop limits, partial final batches.
- When two changes touch the same shared file or shared state, integrate them
  sequentially and re-read the merged result; never let one edit overwrite another.
- Keep public APIs and observable behavior stable unless the task explicitly asks
  to change them.

## Verification

- Run the repository test suite after your change and fix what you broke.
- Add a test that would have caught the defect or that pins the new behavior.
- Only claim completion from fresh command output, never from memory.

## When to stop and ask

- If the task requires a decision that is not specified — especially anything that
  can break compatibility for existing consumers (public formats, schemas, APIs) —
  do not guess and do not write code. Stop, state the unresolved decision, and ask
  for an explicit ruling before making any repository change.
