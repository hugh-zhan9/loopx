# Order summary

`summarize(items)` accepts an array of valid order records with an `id` field.
It returns `{ count, firstId }`. Empty input returns `{ count: 0, firstId: null }`.
For a non-empty list, retain the first record's exact ID, including numeric zero.
Do not modify the input array or records. No external dependencies or services.
