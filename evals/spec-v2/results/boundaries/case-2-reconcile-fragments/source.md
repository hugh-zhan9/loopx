# Case 2 accepted fragments and facts

The supplied fixture is the complete factual scope; no application repository was inspected. These quotations preserve accepted source wording and contradictions; they are not silently replaced by the proposal.

- **AC-001**: “repeated date queries return exactly the same symbols.”
- **Facts**: “the existing database is updated between calls by task completion; the new query reads current rows, with no snapshots or cache.”
- **D-001 prose**: “raw stored symbols are returned unchanged”.
- **D-001 algorithm**: “does TrimSpace before deduplication”.
- **D-002**: “errors contain internal detail invalid_date”.
- **Existing transport**: “exports only status Internal and message error_code=427012”.
- **Client table**: “it receives detail invalid_date”.
- **Existing QA claim**: “diagrams are rendered”.
- **Rendering fact**: “no rendering took place”.

User: “Use spec-v2 to reconcile these accepted design fragments before handoff. … Keep the accepted source requirements visible and produce a reviewable corrected/proposed fragment; no implementation or new infrastructure.”
