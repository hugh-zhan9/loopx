# Review a design

Read the original requirements, existing `概要设计.md`, detailed design, linked
`D-*` decisions, and relevant code or contracts. Preserve overview-only decisions
and history. Do not reconstruct the overview from the detailed document alone.

Check whether the proposed behavior satisfies the source, whether the chosen
owners and boundaries fit the repository, and whether compatibility, data,
security, failure behavior, and verification are clear where they matter. Walk
concrete source scenarios through the design. A correct ID or diagram does not
establish that the expected result was preserved.

For each finding, name the decision, source evidence, consequence, and affected
work. Missing acceptance of a material choice can block that work. Formatting,
chapter order, wording, and optional detail are suggestions; correct them directly
when editing is authorized. Do not invent a second solution or a new requirement
to justify another review round.

Keep the design current. Preserve actual feedback in an existing review record
when one is used; detailed design does not need a discussion log. For such records, note:
accepted change, explained decision retained, or unresolved choice. Include who
raised it when known. Update the owning section, stable anchors, links, and revision
history. Do not maintain a second full copy of the decision in a review report.
Silence, elapsed time, and preparing or sending a document are not acceptance.
An approved decision needs no repeated sign-off.

Review the complete relevant design once, then check fixes and affected decisions.
New evidence of a substantive problem still matters; it must identify a concrete
failure or source conflict. A deferred required behavior needs explicit acceptance,
not just an owner, date, or rationale.

If implementation has happened, describe its actual state and review the code and
verification evidence against the source. Do not restart pre-implementation review
or relabel shipped behavior as merely proposed. Unapproved changes discovered in
code remain real findings and require a decision or repair.
