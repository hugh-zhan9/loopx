# Non-Functional Requirements Checklist

## NFR Categories

### Scalability

| Question | Common Targets | How to Measure |
|----------|----------------|----------------|
| Expected concurrent users? | 100 / 1K / 10K / 100K | Load test with realistic user sessions |
| Requests per second? | 10 / 100 / 1000 / 10000 | Throughput benchmark under load |
| Data volume? | GB / TB / PB | Current size + growth projection |
| Growth rate? | 10% / 50% / 100% per year | Historical data or business forecast |
| Peak vs average load? | 2x / 5x / 10x | Traffic analysis over time windows |

**Quantified Example**:
> The system must handle 5,000 concurrent WebSocket connections with < 100ms message delivery p95. During daily peak (09:00-11:00 UTC), traffic reaches 8x the off-peak average. The system must auto-scale within 60 seconds when QPS exceeds 2,000.

### Performance

| Question | Common Targets | How to Measure |
|----------|----------------|----------------|
| API response time? | < 100ms / 200ms / 500ms p95 | APM percentile tracking |
| Page load time? | < 1s / 2s / 3s | Lighthouse, Core Web Vitals |
| Database query time? | < 10ms / 50ms / 100ms | Slow query log, EXPLAIN ANALYZE |
| Batch processing throughput? | 1K / 10K / 100K records/hour | Job completion time tracking |
| Cold start time? | < 500ms / 1s / 3s | First-request latency after deploy |

**Quantified Example**:
> API endpoints must respond within 200ms at p95 and 500ms at p99 under normal load (< 1000 QPS). Search queries over datasets > 1M rows must complete within 1s at p95. Background job processing must sustain 50K events/hour with < 5 minute end-to-end latency.

### Availability

| Target | Downtime/Year | Use Case | Error Budget/Month |
|--------|---------------|----------|-------------------|
| 99% | 3.65 days | Internal tools | 7.3 hours |
| 99.9% | 8.76 hours | Business apps | 43.8 minutes |
| 99.95% | 4.38 hours | E-commerce | 21.9 minutes |
| 99.99% | 52.6 minutes | Financial systems | 4.38 minutes |
| 99.999% | 5.26 minutes | Life-critical | 26.3 seconds |

**Quantified Example**:
> The payment processing service requires 99.95% availability measured monthly. Planned maintenance windows (max 2 hours/month, announced 72h in advance) are excluded. Degraded mode (read-only, cached responses) is acceptable for up to 15 minutes before counting as downtime.

### Security

| Question | Considerations | Verification |
|----------|----------------|--------------|
| Authentication required? | JWT, OAuth, SAML, MFA | Penetration testing, auth bypass tests |
| Authorization model? | RBAC, ABAC, ACL | Permission matrix review |
| Data sensitivity? | Public, internal, confidential, PII | Data classification audit |
| Compliance requirements? | GDPR, HIPAA, PCI DSS, SOC 2 | Compliance audit checklist |
| Encryption needs? | At rest, in transit, end-to-end | Certificate and key rotation policy |
| Secret management? | Vault, KMS, env vars | Secret scanning in CI |

**Quantified Example**:
> All PII must be encrypted at rest (AES-256) and in transit (TLS 1.3). Authentication tokens expire in 15 minutes with refresh tokens valid for 7 days. Failed login attempts are rate-limited to 5 per minute per IP. All admin actions require MFA. Secrets must rotate every 90 days.

### Reliability

| Question | Considerations | Verification |
|----------|----------------|--------------|
| Acceptable data loss? | RPO: 0 / 1hr / 24hr | Backup restore drill |
| Recovery time target? | RTO: 1hr / 4hr / 24hr | Disaster recovery exercise |
| Backup frequency? | Real-time / hourly / daily | Backup monitoring alerts |
| Disaster recovery? | Single region / multi-region | Failover test |
| Data integrity? | Checksums, reconciliation | Periodic data validation jobs |

**Quantified Example**:
> RPO: 1 hour (max 1 hour of data loss acceptable). RTO: 30 minutes (service must recover within 30 minutes). Automated daily backups with 30-day retention. Cross-region backup replication with 6-hour lag tolerance. Monthly disaster recovery drill required.

### Maintainability

| Question | Considerations | Verification |
|----------|----------------|--------------|
| Deployment frequency? | Daily / weekly / monthly | Deployment metrics |
| Deployment strategy? | Blue-green, canary, rolling | Rollback success rate |
| Monitoring requirements? | Logs, metrics, traces, alerts | Observability coverage audit |
| On-call requirements? | 24/7, business hours | Incident response SLA |
| Code health? | Test coverage, tech debt ratio | SonarQube or equivalent |

**Quantified Example**:
> Deploy to production at least twice per week with < 5 minute rollback capability. Zero-downtime deployments required. Alert on: error rate > 1%, p95 latency > 500ms, CPU > 80% for 5 minutes. On-call rotation with 15-minute acknowledgment SLA during business hours, 30-minute outside.

### Cost

| Question | Considerations | Verification |
|----------|----------------|--------------|
| Infrastructure budget? | $/month, $/user, $/request | Monthly cost reports |
| Operational budget? | FTE for maintenance | Team capacity planning |
| Cost per transaction? | Target unit economics | Cost attribution per service |
| Cost optimization? | Reserved instances, spot, autoscaling | Monthly optimization review |
| Cost alerts? | Thresholds for notification | Budget alerts in cloud console |

**Quantified Example**:
> Infrastructure cost must stay below $0.001 per API request at 1M requests/day. Total monthly cloud spend must not exceed $15K for the first year. Auto-scaling must scale down within 10 minutes when load drops below 30% capacity to avoid waste.

## NFR Priority Framework

Not all NFRs are equally important. Use this framework to prioritize.

### Priority Matrix

| Priority | Meaning | Action |
|----------|---------|--------|
| **P0 - Must Have** | System is unusable without this | Design for it from day 1 |
| **P1 - Should Have** | Significant user/business impact | Plan in architecture, may defer implementation |
| **P2 - Nice to Have** | Improves experience but not critical | Design to not preclude, implement later |
| **P3 - Future** | Anticipated need, not current | Document for future, avoid painting into corner |

### Common Priority Conflicts

| Conflict | Trade-off | Decision Driver |
|----------|-----------|-----------------|
| Performance vs Cost | Faster = more expensive infra | Unit economics, user tolerance |
| Availability vs Consistency | Higher availability often means eventual consistency | Data correctness requirements |
| Security vs UX | Stricter auth = more friction | Risk profile, compliance needs |
| Scalability vs Simplicity | Scale-ready = more complexity | Growth timeline, team size |
| Maintainability vs Time-to-Market | Clean code takes longer | Technical debt budget |

### Decision Template

When two NFRs conflict, document the trade-off:

```markdown
## NFR Trade-off: {NFR A} vs {NFR B}

**Context**: [Why they conflict in this system]
**Decision**: Prioritize {NFR A} because [reason]
**Consequence**: {NFR B} will be limited to [specific bound]
**Mitigation**: [How we partially address the deprioritized NFR]
**Revisit When**: [Trigger for re-evaluating this trade-off]
```

## NFR Elicitation Questions

Use these when stakeholders haven't specified NFRs.

### For Product Owners

1. What happens to revenue if the system is down for 1 hour? 1 day?
2. How many users do you expect in 6 months? 2 years?
3. Which markets/regions must we serve? (latency, compliance implications)
4. What is the acceptable delay for data to appear after submission?
5. Are there regulatory requirements we must meet?

### For Engineering Teams

1. What is our current deployment frequency? Target?
2. What is our error budget? How much have we consumed?
3. What is the most expensive query/operation today?
4. What broke last quarter? What would have prevented it?
5. Where does the on-call team spend the most time?

### For Security/Compliance

1. What data classification applies to our user data?
2. Which compliance frameworks must we satisfy?
3. What is our threat model? Who are we defending against?
4. What is our incident response time target?
5. How often must secrets/certificates rotate?

## Template

```markdown
## Non-Functional Requirements

### Performance
- API response time: < 200ms p95, < 500ms p99
- Page load time: < 2s (LCP)
- Database query time: < 50ms p95
- Background job latency: < 5 min end-to-end

### Scalability
- Concurrent users: 10,000
- Requests per second: 1,000 (peak: 5,000)
- Data volume: 1TB (growing 50%/year)
- Auto-scale trigger: CPU > 70% for 2 minutes

### Availability
- Target: 99.9% (43.8 min downtime/month)
- RPO: 1 hour
- RTO: 30 minutes
- Degraded mode: read-only acceptable for 15 min

### Security
- Authentication: JWT (15 min) + refresh token (7 days)
- Authorization: RBAC with tenant isolation
- Encryption: AES-256 at rest, TLS 1.3 in transit
- Compliance: GDPR, SOC 2

### Observability
- Logging: Structured JSON, 30-day retention
- Metrics: Prometheus + Grafana, 1-year retention
- Tracing: OpenTelemetry, 7-day retention
- Alerts: PagerDuty, 15-min ack SLA

### Cost
- Monthly budget: $15K infrastructure
- Target unit cost: < $0.001 per request
- Optimization: Reserved instances for baseline, spot for burst
```

## Quick Reference

| Category | Key Metric | Typical Range |
|----------|------------|---------------|
| Performance | Response time (p95) | 100ms - 500ms |
| Scalability | Concurrent users, RPS | 1K - 100K |
| Availability | Uptime percentage | 99% - 99.99% |
| Reliability | RPO, RTO | Minutes - Hours |
| Security | Compliance requirements | GDPR, SOC2, PCI |
| Cost | $/month budget | Based on unit economics |
