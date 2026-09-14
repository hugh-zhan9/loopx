# Interrupted execution

Keep recoverable failures `in_progress` and the plan `ready`; do not unlock
dependents. Before dispatch and after each integration or controller-owned edit,
save a content checkpoint and identify it in the Resume note: baseline HEAD and
checkout, baseline user delta, complete tracked/staged/untracked run delta (including
new files, deletions, and modes), candidate identity/integration state, failed check,
and next action. Store artifacts at a named host-local location; exclude only named
plan/checkpoint bookkeeping from its own snapshot. No new execution runtime is needed.

On resume, require the same baseline HEAD and exact content equality with baseline
plus accepted run delta. Paths alone never establish ownership. A missing checkpoint,
changed HEAD, or uncheckpointed edit stops mutation; preserve the changes and obtain
explicit attribution before recording a replacement baseline and redispatching.
Use `blocked` for a material unresolved decision, unsafe dependency, invalid
independence claim, or unattributable contamination; record the exact blocker,
affected slices, and recovery point. Keep unrelated safe work available.

