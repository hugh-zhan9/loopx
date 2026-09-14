# spec-v2 document evaluation

This is an opt-in maintainer exercise, outside the installed skill/runtime.
It compares documents produced from the same input, not template wording or
diagram counts. It does not modify the original corporate-action design.

## Repeat the comparison

Give independent host-native agents [read-only-rpc.md](read-only-rpc.md), each
with one skill: canonical `skills/spec/SKILL.md` or candidate
`skills/spec-v2/SKILL.md`. Give both the same task and evidence, no earlier output
and no evaluation answers. Keep model/settings the same and record them when
available. Generate in isolated temporary directories; preserve the fixture as
`source.md`. No implementation or real-project writes are permitted.

Give a separate reader the two outputs and source, initially labeled A/B when
practical, and the questions below. Require evidence paths/sections and report
all findings. Inspect semantics before accepting shorter output as an improvement.
Keep render limitations separate from semantic results. Record run identities,
artifact hashes, findings and limits in RESULTS.md; do not turn one run into a
statistical quality or speed claim.

## Reader questions

1. Where can a reviewer see the entry, skip, empty-success, failure and normal
   result paths together? Are accumulated symbols discarded on later failure?
2. Can the reader locate the shared candidate/policy stages and the different RPC
   versus Redis projections? Does the comparison accidentally imply the RPC
   accesses or writes Redis?
3. Are raw values, exact deduplication, stable ordering and changing database
   contents consistent? Are wire errors distinct from internal errors?
4. Does the overview explain behavior, exceptions, reasons and cost without
   burying that account in signatures, file paths or generator versions?
5. Which sections repeat the same algorithm or rule in full? Are necessary field,
   error and verification details retained when repetition is removed?
6. Does each D decision have one complete home and a working index link? Can the
   reader recover every source AC/TC, decision status and implementation boundary?
7. What source scenarios were actually walked through, what concrete result was
   obtained, and what remains unverified? Does a renderer limitation conceal a
   missing semantic check or an unresolved source contradiction?

Use supported / partial / missing / contradictory per question with evidence;
do not score by headings, required phrases, line limits or quantity of diagrams.

## Boundary trials

Also try a clear local pure-function change and a source/design reconciliation
case involving changing read data, an unapproved string transformation, and
internal-versus-wire error differences. Keep their raw requests with the results.
Check that local work stays small and unresolved source guarantees remain visible;
do not invent extra diagrams, infrastructure, approval or acceptance.

## Automated scope

`node --test test/spec-v2.test.mjs` checks skill resource isolation, default
installation exclusion and collected candidate document links/decision anchors.
Those structural checks complement the reader exercise; they do not prove that
the documents are correct or easier to understand.
