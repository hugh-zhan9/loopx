# Requirement Quality Attributes Rubric

Use this reference to score individual requirement statements for quality. Apply in `standard` and `deep` analysis depth. In `quick` mode, skip per-statement scoring and only flag statements scoring 0 on any attribute.

Do not let scoring dominate the report. Quality scores are a diagnostic lens for finding unclear or untestable requirements; P0/P1 findings, behavioral model gaps, and readiness routing remain the main output.

## Scoring Scale

Each attribute is scored 0-2 per requirement statement:

- **2** = Fully satisfies the attribute
- **1** = Partially satisfies (some aspects present, others missing)
- **0** = Fails the attribute (absent, contradictory, or severely deficient)

## Quality Attributes

### 1. Testability (可测试性)

Can the requirement be verified by a concrete, repeatable test?

| Score | Criteria |
|-------|----------|
| 2 | Acceptance criteria are explicit, quantified where applicable, and a test case can be written directly from the requirement |
| 1 | Intent is testable but criteria are vague ("works correctly", "responds quickly") or edge cases are unspecified |
| 0 | No way to determine pass/fail from the requirement text; purely subjective language ("user-friendly", "intuitive", "good performance") |

**Examples:**

- Score 2: "When user submits a form with all required fields, the system creates a record and returns HTTP 201 within 200ms"
- Score 1: "The system should respond quickly to user submissions"
- Score 0: "The system provides a good user experience"

### 2. Atomicity (原子性)

Does the requirement describe exactly one behavior or capability?

| Score | Criteria |
|-------|----------|
| 2 | Single, focused behavior that can be implemented and tested independently |
| 1 | Mostly one behavior but bundles a related concern (e.g., "create and notify") that could be separated |
| 0 | Multiple unrelated behaviors bundled into one statement; would require splitting to implement or test |

**Examples:**

- Score 2: "Admin users can deactivate a user account"
- Score 1: "Admin users can deactivate a user account and send a notification email"
- Score 0: "The system manages user lifecycle including creation, activation, deactivation, deletion, role changes, and audit logging"

### 3. Necessity (必要性)

Is this requirement necessary for the stated business goal?

| Score | Criteria |
|-------|----------|
| 2 | Clearly required by the stated problem/goal; removing it would leave the goal unmet |
| 1 | Related to the goal but could be deferred without blocking the core value; nice-to-have bundled with must-have |
| 0 | No connection to the stated goal; gold-plating, premature optimization, or scope creep |

**How to assess:**

- Check if the requirement maps to a stated business goal or user problem.
- Ask: "If we shipped without this, would the stated goal still be met?"
- Consider whether it belongs in a later phase rather than being unnecessary.

### 4. Unambiguity (无歧义性)

Can the requirement be interpreted in only one way?

| Score | Criteria |
|-------|----------|
| 2 | Only one interpretation is possible; terms are defined, quantities specified, conditions explicit |
| 1 | Mostly clear but contains one or two terms that could be interpreted differently (e.g., "recent", "admin", "relevant") |
| 0 | Multiple valid interpretations exist that would lead to different implementations |

**Common ambiguity signals (Chinese):**

及时、尽快、相关、默认、自动、必要时、支持、可配置、保持一致、合理、视情况而定、参考xx、等/等等

**Common ambiguity signals (English):**

real-time, admin, recent, all users, appropriate, relevant, as needed, configurable, compatible, secure, performant, etc.

### 5. Completeness (完整性)

Are all conditions, inputs, outputs, and error cases defined?

| Score | Criteria |
|-------|----------|
| 2 | Happy path, error cases, boundary conditions, inputs, outputs, and preconditions are all specified |
| 1 | Happy path is clear but error handling, edge cases, or boundary conditions are missing |
| 0 | Only a vague description of intent; no actionable specification of behavior |

**Completeness checks:**

- Input: What data is required? What are valid values? What happens with invalid input?
- Output: What is produced on success? On failure? On partial success?
- Preconditions: What must be true before this can execute?
- Error handling: What happens when dependencies fail, data is missing, or conflicts occur?
- Boundary: What are the limits (max items, max size, timeout, concurrency)?

### 6. Consistency (一致性)

Does this requirement contradict other requirements in the same document or referenced documents?

| Score | Criteria |
|-------|----------|
| 2 | No contradiction with other requirements; terminology is used consistently |
| 1 | Minor inconsistency in terminology or implied behavior that can be resolved by context |
| 0 | Direct contradiction with another stated requirement; both cannot be true simultaneously |

**How to check:**

- Same term used with different meanings in different sections.
- Same entity with different state models in different parts.
- Conflicting rules (section A says X is automatic, section B says X requires approval).
- Conflicting NFRs (one section implies real-time, another implies batch).

### 7. Implementation-Freedom (实现无关性)

Does the requirement specify WHAT without prescribing HOW?

| Score | Criteria |
|-------|----------|
| 2 | Describes desired behavior/outcome without dictating technology, architecture, or implementation approach |
| 1 | Mostly behavioral but includes one or two implementation hints that constrain design unnecessarily |
| 0 | Dictates specific technology, database schema, API structure, or algorithm without justification |

**Examples:**

- Score 2: "The system must support 10,000 concurrent users with < 200ms response time"
- Score 1: "The system must use Redis to cache user sessions for fast access"
- Score 0: "Implement a microservice using Go with gRPC, PostgreSQL, and deploy on Kubernetes with 3 replicas"

**Exception:** Technology constraints that come from real business/legal/organizational requirements (e.g., "must use the company's existing SSO provider") score 2, not 0.

### 8. Measurability (可量化性)

Are quantities, timing, sizes, rates, and thresholds specified where applicable?

| Score | Criteria |
|-------|----------|
| 2 | All relevant metrics are quantified (response time, throughput, retention period, max size, SLA) |
| 1 | Some metrics are stated but others that matter are left vague ("fast", "large", "many") |
| 0 | No quantification where it clearly matters; impossible to set acceptance thresholds |

**Where measurability matters:**

- Performance: response time, throughput, concurrent users
- Data: retention period, max record count, max file size
- Availability: uptime SLA, recovery time, failover time
- Timing: processing deadline, notification delay, batch frequency
- Scale: max users, max tenants, max items per page

**Where measurability is NOT required:**

- Pure boolean behavior (feature on/off)
- Simple CRUD without performance concerns
- UI text or label requirements

## Scoring Process

1. **Identify requirement statements** — Break the document into individual testable requirement statements. A statement is one atomic assertion about system behavior. In `standard`, focus on high-risk statements instead of exhaustively scoring every sentence.

2. **Score each statement** — Apply all 8 attributes. Use the scoring table above. In `standard`, scoring may be summarized by attribute and worst offender; in `deep`, include per-statement scoring.

3. **Compute statement score** — Sum of all 8 attributes (max 16 per statement).

4. **Identify worst offenders** — Flag any statement with a 0 on any attribute as needing attention.

5. **Compute document average** — Average of all statement scores, normalized to percentage.

## Output Format

### Per-Statement Scoring (deep mode)

```markdown
| # | Requirement Statement | Test | Atom | Nec | Unamb | Comp | Cons | Impl | Meas | Total |
|---|----------------------|------|------|-----|-------|------|------|------|------|-------|
| R1 | "Admin can deactivate user" | 2 | 2 | 2 | 2 | 1 | 2 | 2 | - | 13/14 |
| R2 | "System supports real-time sync" | 0 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 6/16 |
```

Note: Use `-` when an attribute is not applicable (e.g., measurability for a boolean feature).

### Summary Scoring (standard mode)

```markdown
| Attribute | Avg Score | Statements at 0 | Worst Offender |
|-----------|-----------|-----------------|----------------|
| Testability | 1.4 | 3 | R7: "system handles edge cases gracefully" |
| Atomicity | 1.8 | 1 | R12: bundles 4 behaviors |
| Necessity | 1.9 | 0 | - |
| Unambiguity | 1.1 | 5 | R3: "relevant users are notified" |
| Completeness | 1.2 | 4 | R5: no error handling defined |
| Consistency | 1.7 | 1 | R9 contradicts R4 on approval rules |
| Impl-freedom | 1.6 | 2 | R11: dictates Redis + specific schema |
| Measurability | 1.0 | 6 | R2: "real-time" without latency target |

Overall quality: 11.7/16 (73%)
```

In standard mode, omit the table if it would distract from higher-signal P0/P1 findings. Instead, state the two or three worst quality patterns and cite examples.

## Contribution to Maturity Score

The quality attributes contribute to the **Clarity** dimension (20 points) of the maturity scorecard:

- Average quality score >= 80%: 20 points
- Average quality score 60-79%: 15 points
- Average quality score 40-59%: 10 points
- Average quality score 20-39%: 5 points
- Average quality score < 20%: 0 points

Additionally, any statement with Testability = 0 reduces the **Testability** dimension score.
