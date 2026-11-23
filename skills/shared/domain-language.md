# Domain Language & Glossary

Use the repository's `GLOSSARY.md` (when present) and approved source vocabulary
consistently across requirements, specs, code, and tests.

## Rules

1. **Separate overloaded names.** If one term (e.g., "account") refers to two
   distinct concepts (login identity vs trading account), name both explicitly.
2. **Test apparent synonyms with a scenario.** When two terms might imply
   different behavior (e.g., cancelling an item vs cancelling the whole order),
   ask the decision owner instead of collapsing them.
3. **Map across boundaries instead of renaming public contracts.** Preserve
   established API, schema, and enum names; document how business concepts map
   to wire identifiers.
4. **Keep definitions local and lean.** Update `GLOSSARY.md` when a project uses
   one, or define a new term once beside the rule that uses it.
