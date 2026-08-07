# Go Concurrency

Use this reference when a change affects goroutines, cancellation, channels,
locks, atomics, concurrent collections, or synchronization correctness.

## Establish Ownership And Lifetime

- Name who starts each goroutine, who can stop it, what it owns, and who waits
  for it. Avoid fire-and-forget work without an explicit process-lifetime reason.
- Propagate `context.Context` as the first parameter for request-scoped
  cancellation and deadlines. Do not store request contexts in structs or use
  context values as untyped business parameters.
- Long-lived workers need an idempotent shutdown path and a defined policy for
  draining, cancellation, timeout, and surfaced asynchronous errors.
- Channel ownership includes who sends, receives, closes, and observes shutdown.
  The owning producer closes a channel when receivers require closure; receivers
  do not close a channel they do not own.

## Choose The Simplest Primitive

- Use `sync.Mutex` for shared composite state and invariants. A locked Mutex is
  not associated with a particular goroutine, although ownership should remain
  simple enough to audit.
- Consider `sync.RWMutex` only after measurement shows read concurrency helps;
  read-heavy ratios alone do not prove it is faster.
- Use typed atomics for independent counters, flags, or pointers when a single
  atomic state transition expresses the invariant. Do not assemble multi-field
  invariants from unrelated atomic operations.
- Use channels for ownership transfer, work distribution, coordination, and
  asynchronous results. Use locks when they express shared-state protection more
  directly.
- Use `WaitGroup` for completion without error propagation. Use an established
  group abstraction when cancellation, limits, or first-error propagation are
  part of the contract; do not add a dependency without checking local practice.
- Use `sync.Map` only for its documented use cases or measured contention wins.
  Prefer a typed map plus a lock for general shared maps.
- Use `sync.Pool` for disposable temporary values, never as durable storage.

## Review Correctness

- Check every shared mutable value for a synchronization edge and every blocking
  send, receive, lock, wait, or I/O operation for cancellation or bounded exit.
- Keep lock ordering explicit and consistent. Do not call unknown or blocking
  code while holding a lock unless the contract makes that safe.
- Do not copy synchronization primitives after first use. Check value receivers,
  struct copies, append operations, and interface assignments.
- Add before `Wait` when required by the selected `WaitGroup` pattern, prevent
  negative counts, and do not reuse a group until prior waits have returned.
- Treat channel buffer size as part of backpressure and shutdown behavior, not
  as a generic deadlock fix.
- Preserve the Go memory model: ordinary reads and writes are not made safe by
  timing, sleep, goroutine completion assumptions, or unsuccessful `TryLock`.

## Diagnose And Verify

Use focused tests that execute the concurrent path:

```bash
go test -race ./path/to/pkg
go test -run='TestConcurrentBehavior$' -count=100 ./path/to/pkg
go vet ./path/to/pkg
```

- Use goroutine, block, mutex, and trace profiles to investigate leaks,
  contention, scheduler delay, and blocked operations.
- Use `testing/synctest` only when the module's Go version supports the needed
  API and the code under test uses synchronization it can observe.
- Remember that the race detector proves only the executions it observes. Pair
  it with ownership and happens-before review.
- Pin a discovered race, deadlock, leak, or cancellation defect with a focused
  regression test whenever deterministic verification is possible.

Distributed locks, leases, leader election, and queues are distributed-system
protocols rather than local `sync` substitutions. Review fencing, expiry,
session loss, consistency, and failure recovery with the architecture or service
reliability discipline before adopting them.

This reference consolidates core material from `chao-go-sync` (MIT, copyright
smallnest) while treating the Go memory model and package documentation as the
authority.
