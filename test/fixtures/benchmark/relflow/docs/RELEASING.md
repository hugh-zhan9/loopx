# Releasing

The release pipeline (`.github/workflows/release.yml` and
`scripts/release.mjs`) is owned by the platform team.

Change process (APPR): every change to these files requires a recorded
sign-off from the platform team, filed under `docs/approvals/`, **before**
the change is merged.

Public releases additionally pass through the manual `release-approval`
environment gate in CI.
