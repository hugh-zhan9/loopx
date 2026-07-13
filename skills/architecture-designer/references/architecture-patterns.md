# Architecture Patterns

## Pattern Comparison

| Pattern | Best For | Team Size | Trade-offs |
|---------|----------|-----------|------------|
| **Monolith** | Simple domain, small team | 1-10 | Simple deploy; hard to scale parts |
| **Modular Monolith** | Growing complexity | 5-20 | Module boundaries; still single deploy |
| **Microservices** | Complex domain, large org | 20+ | Independent scale; operational complexity |
| **Serverless** | Variable load, event-driven | Any | Auto-scale; cold starts, vendor lock |
| **Event-Driven** | Async processing | 10+ | Loose coupling; debugging complexity |
| **Hexagonal** | Testability, port swapping | Any | Clean boundaries; more indirection |
| **CQRS** | Read-heavy, complex queries | 10+ | Optimized reads; eventual consistency |

## Monolith

```
┌─────────────────────────────────────┐
│            Application              │
│  ┌─────┐  ┌─────┐  ┌─────┐         │
│  │Users│  │Orders│ │Products│       │
│  └─────┘  └─────┘  └─────┘         │
│  └──────────┬──────────────┘        │
│          Database                    │
└─────────────────────────────────────┘
```

**When to Use**:
- Starting a new project
- Small team (< 10 developers)
- Simple domain
- Rapid iteration needed

**Pros**: Simple deployment, easy debugging, no network latency
**Cons**: Hard to scale independently, technology locked, deployment risk

## Modular Monolith

```
┌───────────────────────────────────────────────┐
│                 Application                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐ │
│  │  Users    │  │  Orders   │  │ Products  │ │
│  │  Module   │  │  Module   │  │  Module   │ │
│  │ ┌───────┐ │  │ ┌───────┐ │  │ ┌───────┐ │ │
│  │ │ API   │ │  │ │ API   │ │  │ │ API   │ │ │
│  │ │Domain │ │  │ │Domain │ │  │ │Domain │ │ │
│  │ │ Data  │ │  │ │ Data  │ │  │ │ Data  │ │ │
│  │ └───────┘ │  │ └───────┘ │  │ └───────┘ │ │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │
│        └───────────────┼───────────────┘       │
│                   Shared DB                    │
└───────────────────────────────────────────────┘
```

**When to Use**:
- Team is growing but not ready for distributed systems
- Domain boundaries are emerging but service split is premature
- Need independent module development with single deployment
- Want to prepare for future microservices extraction

**Key Principles**:
- Each module owns its domain logic, data access, and public API
- Modules communicate through explicit interfaces, not shared tables
- Database schema is logically separated per module (separate schemas or table prefixes)
- Cross-module calls go through published interfaces, never direct data access

**Boundary Enforcement**:
- Compile-time: package visibility, internal packages (Go), module systems
- Runtime: integration tests that verify no cross-module direct DB access
- Review-time: ADR for any new cross-module dependency

**Pros**: Module autonomy, single deploy, easy extraction to services later
**Cons**: Still coupled at deploy, shared DB can leak, requires discipline

**Migration Path to Microservices**:
1. Identify the module with the most independent scaling/deployment need
2. Extract its data into a separate database
3. Replace in-process calls with API/event calls
4. Deploy independently
5. Repeat for next module

## Microservices

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Users   │  │  Orders  │  │ Products │
│ Service  │  │ Service  │  │ Service  │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
┌────▼────┐  ┌────▼────┐  ┌────▼────┐
│ User DB │  │Order DB │  │ Prod DB │
└─────────┘  └─────────┘  └─────────┘
```

**When to Use**:
- Large team (20+ developers)
- Complex domain with clear boundaries
- Different scaling requirements per service
- Polyglot technology needs

**Pros**: Independent scaling, team autonomy, fault isolation
**Cons**: Distributed system complexity, eventual consistency, operational overhead

**Prerequisites (Do Not Skip)**:
- Automated CI/CD pipeline per service
- Centralized logging and distributed tracing
- Service discovery and load balancing
- Health checks and circuit breakers
- Clear ownership model (one team per service)

## Hexagonal Architecture (Ports and Adapters)

```
                    ┌─────────────────────────────────┐
                    │         Application              │
 ┌─────────┐       │  ┌───────────────────────────┐  │       ┌─────────┐
 │  HTTP   │──Port──│  │                           │  │──Port──│Database │
 │ Adapter │  (in)  │  │      Domain Core          │  │ (out)  │ Adapter │
 └─────────┘       │  │                           │  │       └─────────┘
                    │  │  - Entities               │  │
 ┌─────────┐       │  │  - Value Objects           │  │       ┌─────────┐
 │  gRPC   │──Port──│  │  - Domain Services        │  │──Port──│  Queue  │
 │ Adapter │  (in)  │  │  - Repository Interfaces  │  │ (out)  │ Adapter │
 └─────────┘       │  │                           │  │       └─────────┘
                    │  └───────────────────────────┘  │
 ┌─────────┐       │                                  │       ┌─────────┐
 │  CLI    │──Port──│                                  │──Port──│  Cache  │
 │ Adapter │  (in)  │                                  │ (out)  │ Adapter │
 └─────────┘       └─────────────────────────────────┘       └─────────┘
```

**When to Use**:
- Domain logic is complex and must be tested without infrastructure
- Multiple entry points (HTTP, gRPC, CLI, events) drive the same logic
- Infrastructure may change (swap databases, message queues, providers)
- Long-lived system where maintainability is more important than speed-to-first-deploy

**Key Principles**:
- Domain core has zero dependencies on frameworks, databases, or transport
- Ports are interfaces defined by the domain (what it needs, what it offers)
- Adapters implement ports and live outside the core
- Dependency direction always points inward (adapters depend on ports, never reverse)

**Inbound Ports** (Driving): Define use cases the outside world can trigger
```
type OrderService interface {
    PlaceOrder(ctx context.Context, cmd PlaceOrderCmd) (OrderID, error)
    CancelOrder(ctx context.Context, id OrderID) error
}
```

**Outbound Ports** (Driven): Define what the domain needs from infrastructure
```
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
    FindByID(ctx context.Context, id OrderID) (*Order, error)
}
```

**Testing Benefits**:
- Unit test domain logic with in-memory adapters
- Integration test adapters against real infrastructure
- E2E test through inbound adapters against the full stack

**Pros**: Testable, swappable infrastructure, clear boundaries, long-term maintainability
**Cons**: More indirection, initial boilerplate, over-engineering risk for simple CRUD

## Event-Driven

```
┌──────────┐     ┌─────────────┐     ┌──────────┐
│ Producer │────▶│ Message Bus │────▶│ Consumer │
└──────────┘     │  (Kafka)    │     └──────────┘
                 └─────────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ Consumer │
                 └──────────┘
```

**When to Use**:
- Async processing required
- Loose coupling between services
- Event sourcing needs
- High throughput messaging

**Pros**: Decoupled services, scalable, audit trail
**Cons**: Eventual consistency, debugging complexity, message ordering

## CQRS (Command Query Responsibility Segregation)

```
┌─────────┐         ┌─────────────┐
│ Commands│────────▶│ Write Model │──┐
└─────────┘         └─────────────┘  │
                                     ▼
                              ┌──────────┐
                              │  Events  │
                              └──────────┘
                                     │
┌─────────┐         ┌─────────────┐  │
│ Queries │◀────────│ Read Model  │◀─┘
└─────────┘         └─────────────┘
```

**When to Use**:
- Read/write ratio heavily skewed (10:1 or more)
- Complex read queries that don't map to the write model
- Event sourcing architecture
- Different optimization needs for reads vs writes

**CQRS + Event Sourcing Detail**:

```
Command ──▶ Aggregate ──▶ Events ──▶ Event Store
                                         │
                                    ┌────┴────┐
                                    ▼         ▼
                              ┌─────────┐ ┌─────────┐
                              │Read DB 1│ │Read DB 2│
                              │(search) │ │(reports)│
                              └─────────┘ └─────────┘
```

**Event Sourcing Principles**:
- Store events as the source of truth, not current state
- Rebuild current state by replaying events
- Events are immutable and append-only
- Snapshots optimize replay for aggregates with many events

**When NOT to Use CQRS**:
- Simple CRUD with balanced read/write
- Small team without event-driven experience
- Strong consistency requirements everywhere (CQRS introduces eventual consistency)

**Pros**: Optimized reads, audit trail, temporal queries, scalable
**Cons**: Eventual consistency, complexity, event versioning, debugging difficulty

## Saga Pattern

Use Sagas to coordinate multi-service transactions without distributed locks.

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Order   │───▶│ Payment │───▶│  Stock  │───▶│Shipping │
│ Service │    │ Service │    │ Service │    │ Service │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
 T1: Create    T2: Charge     T3: Reserve    T4: Ship
 Order         Payment        Stock          Package
     │              │              │              │
     ▼              ▼              ▼              ▼
 C1: Cancel    C2: Refund     C3: Release    C4: Cancel
 Order         Payment        Stock          Shipment
```

### Choreography vs Orchestration

| Aspect | Choreography | Orchestration |
|--------|-------------|---------------|
| Coordination | Event-driven, no central control | Central orchestrator directs steps |
| Coupling | Loose; services react to events | Orchestrator knows all participants |
| Visibility | Hard to trace full flow | Single place shows entire flow |
| Complexity | Grows with participant count | Grows with flow logic |
| Best for | Simple flows (2-4 steps) | Complex flows (5+ steps, conditions) |

### Choreography Example

```
OrderService publishes: OrderCreated
  → PaymentService listens, charges, publishes: PaymentCompleted
    → StockService listens, reserves, publishes: StockReserved
      → ShippingService listens, ships, publishes: ShipmentCreated

On failure at any step:
  Service publishes compensation event (e.g., PaymentFailed)
  → Upstream services listen and execute compensating transactions
```

### Orchestration Example

```
OrderSaga (orchestrator):
  1. Call PaymentService.Charge()
     - On success → step 2
     - On failure → Cancel Order
  2. Call StockService.Reserve()
     - On success → step 3
     - On failure → Refund Payment, Cancel Order
  3. Call ShippingService.Ship()
     - On success → Complete
     - On failure → Release Stock, Refund Payment, Cancel Order
```

### Saga Design Rules

- Each step must have a compensating transaction
- Compensating transactions must be idempotent (retries are safe)
- Design for partial failure: any step can fail at any time
- Use timeouts with compensation for steps that may hang
- Store saga state for recovery after crashes
- Prefer orchestration for flows with complex branching or conditional logic
- Prefer choreography for simple linear flows with few participants

## Serverless

**When to Use**:
- Variable or unpredictable load
- Event-driven processing (file uploads, webhooks, schedules)
- Cost optimization for low-traffic workloads
- Rapid prototyping without infrastructure management

**Considerations**:
- Cold start latency (100ms–3s depending on runtime and dependencies)
- Execution time limits (15 min for AWS Lambda)
- Stateless by design; external state in DB/cache/queue
- Vendor lock-in risk; abstract business logic from provider APIs
- Monitoring and debugging is harder than traditional servers

## Comparison Signals

Use these only as investigation prompts. Repository constraints, quantified
NFRs, team ownership, failure recovery, and rollout cost decide the pattern.

| Signal | Candidate To Evaluate |
|--------|-----------------------|
| Simple CRUD app | Monolith |
| Growing startup | Modular Monolith |
| Enterprise scale | Microservices |
| Variable load | Serverless |
| Async processing | Event-Driven |
| Read-heavy | CQRS |
| Complex domain, testability | Hexagonal |
| Multi-service transactions | Saga |
| Complex domain + team autonomy | Microservices + Event-Driven |

## Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|---|---|---|
| Distributed Monolith | Services share DB or deploy together | Enforce data ownership, async communication |
| Shared Nothing Fallacy | Every service duplicates infrastructure | Shared platform services (logging, auth, config) |
| Premature Microservices | < 10 devs, unclear boundaries | Start monolith, extract when boundaries are proven |
| CQRS Everywhere | Simple CRUD with CQRS complexity | Use CQRS only for genuinely asymmetric read/write |
| Event Soup | Everything is an event, no clear flow | Define event categories: domain, integration, notification |
| Saga Without Compensation | Distributed flow without rollback plan | Design compensation for every step before building |
