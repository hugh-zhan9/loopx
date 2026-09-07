# Red–Green–Refactor Example

Suppose the accepted requirement is: submitting an empty email returns
`Email required` and does not save a record. Existing valid-email behavior must
remain unchanged. Names here are illustrative; use the project's actual API and
test runner.

## Red

```javascript
test('rejects an empty email without saving a record', async () => {
  const store = createInMemoryStore();
  const result = await submitForm({ email: '' }, store);
  assert.deepEqual(result, { error: 'Email required' });
  assert.equal(await store.count(), 0);
});
```

Run the test before the repair. An unexpected successful submission demonstrates
the missing validation. An undefined test helper or failed import does not;
repair the test setup first. An already passing test may show the behavior
exists; inspect the original reproduction before changing production code.

## Green

Implement validation at the existing boundary that owns it. Return the specified
error before saving. Do not add an email normalization policy, new persistence
abstraction, or notification path without a requirement.

Run the new test and checks for the existing valid-email path. If an assertion
was based on a mistaken contract, correct it from the source evidence; do not
change the expected error or remove the no-save assertion just to match a bug.

## Refactor and completion

Simplify duplication introduced by the change only when it improves the result.
Rerun affected checks after edits and the repository's required checks before
claiming completion. Preserve the red failure reason and final green result.

For pre-existing correct implementation, use characterization evidence and label
it honestly. If the repair predates the test, a safe isolated reproduction can
show the test detects the original defect; do not delete current user work to
recreate that state.
