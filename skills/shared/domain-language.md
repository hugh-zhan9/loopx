# Domain language checks

Use when competing names or meanings could change requirements, data selection,
permissions, state transitions or caller-visible behavior. Ordinary wording
changes do not require a terminology exercise.

Read relevant definitions in the approved source and any existing glossary,
then compare them with code, schemas and examples. Distinguish the intended
rule from current implementation: code is evidence of what happens, not automatic
authority for what should happen.

- Separate concepts that share a name. An account might mean a login identity
  or a trading account; the difference matters if disabling one affects the other.
- Check apparent synonyms with a concrete scenario. Does cancelling one order
  item cancel the whole order? If the answer changes behavior and is not already
  settled, ask the decision owner rather than choosing the shorter term.
- Preserve legitimate context-specific meanings. Map them explicitly at the
  interface instead of renaming every domain to one global vocabulary.
- Distinguish business concepts from technical identifiers. Keep established API
  names, enum values and fields; explain their mapping without silently changing
  a public contract.

Record resolved meanings in their existing authoritative home and link from the
requirements or design that uses them. If no definition exists, a short definition
beside the affected rule is enough; no new glossary or ADR is required. Keep
implementation details out of a glossary. Unsettled business meaning remains a
pending requirement; a recommendation or code observation is not an approved
change. Ask only about the affected meaning, not settled unrelated decisions.
