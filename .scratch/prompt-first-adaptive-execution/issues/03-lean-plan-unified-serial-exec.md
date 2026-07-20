# 03 — Deliver lean plans and one serial exec entry

**What to build:** Provide an optional lean planning intent and a single execution intent that can run either a clear request or a persistent plan in the current context. Users should no longer choose a serial, subagent, or parallel executor before work starts.

**Blocked by:** 02 — Route the installed product prompt-first.

**Status:** ready-for-agent

- [ ] An ordinary persistent plan contains outcomes, boundaries, likely modules, known dependencies, acceptance, and verification.
- [ ] Ordinary plans do not require implementation transcription, minute-scale steps, review ceremonies, or fixed parallel metadata.
- [ ] Persistent planning is selected only for explicit planning, approval boundaries, interruption recovery, or durable coordination.
- [ ] The exec intent accepts either a clear request or a plan and completes a strongly coupled case serially with fresh verification.
- [ ] Old planning and execution names forward explicitly to the canonical intent without participating in automatic routing.
