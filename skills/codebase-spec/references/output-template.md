# Codebase Spec Template

Use this structure for the final Markdown unless the user requested another format. Keep sections even when brief; write `Unknown` or `Not applicable` with a reason instead of silently deleting important areas.

```markdown
# <Project Or Module> Codebase Spec

Generated from repository evidence on <YYYY-MM-DD>.

## 1. Executive Summary

### 1.1 Current Purpose

### 1.2 Primary Users Or Callers

### 1.3 Key Capabilities

### 1.4 Evidence Confidence

| Area | Confidence | Notes |
|---|---|---|

## 2. Scope

### 2.1 Included

### 2.2 Excluded

### 2.3 Evidence Sources

| Source | Role |
|---|---|

## 3. Repository Map

### 3.1 Top-Level Structure

### 3.2 Canonical Sources And Generated Artifacts

### 3.3 Ownership And Module Boundaries

## 4. Runtime Surfaces

### 4.1 CLI Surface

| Command | Purpose | Inputs | Outputs | Evidence |
|---|---|---|---|---|

### 4.2 API Surface

### 4.3 Library Or Package Surface

### 4.4 Hooks, Jobs, And Plugin Surfaces

## 5. Core Behavior

### 5.1 Main Workflows

### 5.2 State Machines

| State | Meaning | Valid Next States | Evidence |
|---|---|---|---|

### 5.3 Validation Gates And Invariants

### 5.4 Error Handling And Diagnostics

### 5.5 Idempotency, Concurrency, And Recovery

## 6. Data Model And Persistence

### 6.1 Persisted Files Or Tables

### 6.2 Schemas And Serialized Formats

### 6.3 Migration And Compatibility Behavior

## 7. Configuration

| Name | Required | Default | Effect | Evidence |
|---|---:|---|---|---|

## 8. External Dependencies

| Dependency | Purpose | Failure Impact | Evidence |
|---|---|---|---|

## 9. Security, Privacy, And Safety

### 9.1 Trust Boundaries

### 9.2 Secret Handling

### 9.3 Destructive Operation Controls

### 9.4 User Data And Local State

## 10. Testing And Verification

### 10.1 Test Strategy

### 10.2 Behavior Proven By Tests

### 10.3 Important Untested Areas

## 11. Operations

### 11.1 Build, Test, And Release

### 11.2 Install, Uninstall, And Repair

### 11.3 Observability And Troubleshooting

## 12. Contradictions And Gaps

| Type | Summary | Evidence | Impact |
|---|---|---|---|

## 13. Rebuild Notes

Describe the minimum behavior, contracts, data, and operational requirements a replacement implementation would need to preserve. Do not include a task plan.

## Appendix A. Evidence Index

| Claim Area | Representative Evidence |
|---|---|

## Appendix B. Glossary
```
