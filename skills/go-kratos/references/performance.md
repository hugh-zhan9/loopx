# Go Performance

Use this reference for performance diagnosis, optimization, benchmark work, or
performance review. The governing rule is measurement before and after a small,
testable change.

## Define The Claim

- Name the metric: latency percentile, throughput, CPU time, bytes/op, allocs/op,
  resident memory, GC frequency, pause time, contention, or binary/build cost.
- Capture the workload, input distribution, concurrency, environment, and
  acceptance threshold. A microbenchmark that does not represent the relevant
  workload cannot prove the user-facing claim.
- Preserve a functional test for the behavior before changing the hot path.

## Measure

Use the narrowest relevant tools:

```bash
go test -run='^$' -bench='BenchmarkName$' -benchmem -count=10 ./path/to/pkg > old.txt
go test -run='^$' -bench='BenchmarkName$' -cpuprofile=cpu.out ./path/to/pkg
go test -run='^$' -bench='BenchmarkName$' -memprofile=mem.out ./path/to/pkg
go test -run='^$' -bench='BenchmarkName$' -mutexprofile=mutex.out ./path/to/pkg
go test -run='^$' -bench='BenchmarkName$' -trace=trace.out ./path/to/pkg
```

- Use `go tool pprof` to distinguish cumulative cost from flat cost and
  allocation volume from live retained memory.
- Use `benchstat old.txt new.txt` for repeated before/after samples. Inspect
  variance and environmental noise, not only the reported delta.
- Use compiler diagnostics such as escape and inlining output to test a specific
  hypothesis; compiler internals and thresholds are version-dependent.
- Use production profiles only through an already authorized, access-controlled
  profiling surface. Do not expose a new debug endpoint as an incidental change.

## Optimize The Proven Hot Path

- Fix algorithmic or I/O cost before micro-optimizing syntax.
- Preallocate slices, maps, or builders only when size estimates are reliable and
  measurements show growth or allocation cost matters.
- Treat value-vs-pointer, interface boxing, escape behavior, field layout,
  cache-line padding, pooling, atomics, lock sharding, and PGO as hypotheses to
  validate on the target compiler, architecture, and workload.
- Use `sync.Pool` only for disposable temporary objects. Its contents may be
  dropped at any time; reset objects before reuse and cap unexpectedly large
  buffers when retention matters.
- Treat `GOGC` and `GOMEMLIMIT` as runtime tradeoffs. `GOMEMLIMIT` is a soft
  runtime memory limit, not a hard heap cap.
- Do not sort, copy, change representation, or introduce `unsafe` solely for a
  presumed CPU/cache benefit without including its full cost and semantics.

## Reject Absolute Heuristics

Do not encode universal thresholds such as a read percentage for `RWMutex`, a
fixed speedup for atomics, a fixed map-vs-switch size, or a universal cache-line
width. Benchmark the actual alternatives. Prefer the simplest implementation
when results are indistinguishable.

## Verify The Result

Run functional tests, repeat the benchmark under comparable conditions, compare
with `benchstat`, and inspect secondary metrics for regressions. Report exact
commands and evidence. If the improvement is not repeatable or does not meet the
claim, do not keep complexity justified only by the performance hypothesis.

This reference consolidates measurement-oriented ideas from `chao-go-perf`
(MIT, copyright smallnest) while keeping Go toolchain documentation and fresh
benchmark evidence authoritative.
