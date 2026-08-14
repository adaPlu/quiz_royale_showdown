---
name: audit
description: Run a full repository audit as a dependency-aware analysis graph — map architecture and trust boundaries, fan out read-only auditors across independent workstreams, reconcile cross-component findings, independently verify every High/Critical, then emit a severity-ranked report and a remediation graph without changing any code. Use when the user asks for a full audit, security review of the whole repo, "audit this repository", or a findings report to hand to remediation.
---

# Full Repository Audit as an Analysis Graph

Produce a defensible, evidence-backed assessment. Not a list of grep hits.

Pairs with `/remediate`, which consumes this output. **Use the same finding IDs**
(`SEC-nn`, `REL-nn`, `DATA-nn`, `PERF-nn`, `CI-nn`, `MAINT-nn`, `TEST-nn`) so the
two compose across sessions.

## 0. Rules — read-only, and enforce it structurally

**Do not modify code. Do not commit, push, open PRs, or deploy.** Do not fix
findings you discover — that is `/remediate`'s job.

Don't rely on instructions to hold that line. Spawn auditors as
`subagent_type: "Explore"`, which has **no Edit, Write, or NotebookEdit tool at
all**. A read-only agent cannot accidentally "helpfully" apply a fix. Use
`general-purpose` only when an auditor genuinely needs to run a build or test
harness to reach its conclusion.

If you spot something out of scope worth fixing later, file it with
`spawn_task` — don't widen the audit.

## 1. Scope before you look for bugs

Reviewing files without knowing their role produces noise. Map first:

entry points · routes · middleware · auth · authorization · data access ·
schemas and migrations · caches · queues · background jobs · scheduled work ·
external integrations · deployment and IaC · CI/CD · env and secrets · logging
and telemetry · file and network access · clients (web, mobile, desktop) ·
package manifests and lockfiles · tests

Use `Glob` and `Grep` for this, not `find`/`rg` through Bash — results integrate
with the permission UI and produce clickable file links.

Emit an architecture map: component · responsibility · inputs · outputs ·
dependencies · external systems · security-sensitive operations · trust
boundaries.

**Check the repo layout for traps before assigning work.** This project is
several git worktrees of one repo (`QuizGame`, `-main`, `-backend`, `-android`,
`-webapp`) on *different branches*. An auditor pointed at the wrong worktree will
report a real defect against the wrong branch. That happened in a previous audit
here: a finding was raised against `main`'s `start.sh` when the defect existed
only on `feature/backend`. **State the worktree and branch in every agent brief.**

Also read `LLMHandOff.md` first — prior findings, their IDs, and their evidence
levels. Don't re-derive what's already established, and don't renumber.

## 2. Build the graph — show it before deep analysis

**Rule 1 — read dependency.** Does a step need another's output to proceed
*correctly*? Then edge it and preserve order. Architecture mapping precedes
everything. Don't create an edge just because one topic appears first in a
checklist.

**Rule 2 — shared analysis.** Do two workstreams examine the same component,
trust boundary, data flow, or security mechanism? They can still run in
parallel — but their results **must** be reconciled later by a dedicated
cross-component reviewer (Phase 6). Note the reconciliation edge now; it is the
easiest thing to lose.

Adapt workstreams to what the repo actually is. Present the graph before deep
analysis — `EnterPlanMode` when the user should approve scope first.

## 3. Fan out

One `Agent` per independent workstream, `run_in_background: true` for true
parallelism. Group findings that share a component into one auditor rather than
several thin ones.

```
Agent(
  subagent_type: "Explore",       # read-only by construction
  run_in_background: true,
  description: "Audit auth and session lifecycle",
  prompt: "<brief>"
)
```

Every brief must state: the **worktree path and branch**, the exact files or
directories, the trust boundaries in play, what to trace (not just what to
look at), and the report format — `file:line`, execution path, impact, and
whether the finding is CONFIRMED (path traced end to end) or SPECULATIVE.

Require auditors to **trace execution paths**, follow calls across modules, and
check middleware inheritance, wrappers, parent routers, config, and error paths.
Reading filenames and docs is not auditing.

**A dangerous function existing is not a finding.** A finding needs a plausible
path through the actual application, or a concrete reliability, correctness, or
maintainability failure. Say so in the brief — it's the single biggest source of
audit noise.

## 4. What to cover

Adapt to the repo; don't run the whole list where it doesn't apply.

**Security** — authn (bypass, token/session validation, expiry, refresh, replay);
authz (missing checks, horizontal/vertical escalation, IDOR/BOLA, tenant
isolation, client-side-only enforcement); input handling (SQL/NoSQL/command/
template injection, SSRF, path traversal, unsafe redirects, deserialization,
ReDoS); web/API (CORS, CSRF, XSS, headers, size limits, method and content-type
restrictions, WebSocket and GraphQL where present); secrets (hardcoded values,
keys in URLs, leakage through logs and telemetry, over-scoped credentials);
crypto (weak algorithms, weak randomness, nonce/IV reuse, password hashing,
home-rolled primitives, certificate validation); data protection (PII exposure,
over-logging, insecure storage and caching, error messages); abuse and cost
(rate limits, concurrency caps, unbounded loops, retry storms, provider spend
amplification); supply chain (unpinned deps, install scripts, unpinned GitHub
Actions, excessive workflow permissions, dependency confusion).

**Reliability** — races, deadlocks, retry behavior, missing timeouts, cascading
and partial failure, transaction consistency, idempotency, stale or poisoned
cache, key collisions, startup and shutdown, resource cleanup, connection
management, swallowed errors, duplicate processing, message loss, unbounded
background work. Call out anywhere one failing dependency stalls unrelated work.

**Data** — schema and constraints, migrations, transaction boundaries, indexes,
N+1 and full-table scans, dynamic queries, authorization at the data layer,
tenant separation, pooling, retention, cache/DB consistency, unbounded tables,
unsafe startup loading. Trace input → validation → logic → storage → retrieval →
output.

> **Migration drift is a high-yield check here.** Declared schema and applied
> migrations diverge silently, because `prisma migrate deploy` (and equivalents)
> never read the schema file. Compare declared models and indexes against what
> migrations actually create. A previous audit of this repo found three tables,
> an enum, and 18 indexes that existed only in the schema — on routes that were
> already mounted.

**Client** — client-side auth/authz assumptions, token storage, sensitive state,
unsafe HTML rendering, deep links and redirects, exposed env vars, races and
stale state, error and loading logic, mobile permissions, local storage, network
security config. Never treat client-side enforcement as a substitute for
server-side.

**Infrastructure and CI** — containers, IaC, platform config, proxies, env vars,
ports, TLS, health checks, resource limits, startup commands. Then workflow
permissions, PR triggers and fork behavior, secret availability, third-party and
unpinned actions, artifact handling, deploy credentials, and whether lint /
typecheck / tests are actually enforced. Look specifically for **controls the
application assumes but the deployment layer does not provide**, and for paths by
which untrusted repo content reaches privileged CI execution.

**Tests** — what security properties are actually covered, whether tests reach
the sensitive path, whether mocks bypass the logic under test, and whether
negative and boundary cases exist. A suite that passes regardless of correctness
is worse than none: it manufactures confidence. Name the test that *should* exist
for each significant finding — but do not write it.

## 5. Verify before reporting

**Every High and Critical must be independently verified by a different reviewer
than the one who raised it.** Mediums too where practical.

The verifier's job is to **disprove**: trace the path independently, then check
inherited middleware, wrappers, parent routers, configuration, tests, deployment
assumptions, and any compensating control.

Classify: **VERIFIED · DOWNGRADED · FALSE_POSITIVE · NEEDS_MORE_EVIDENCE.**
Nothing enters the report as confirmed without verification support.

**Agent output is evidence, not truth — in both directions.** In a prior audit
here one agent misattributed a defect to the wrong worktree, while another
correctly rejected a claim the lead had made. Re-verify blocking claims yourself
before acting on them *or* dismissing them.

## 6. Reconcile across components

A dedicated reviewer analyzes interactions between workstreams — this is where
the findings nobody else can see live:

frontend → API → middleware → database · route → cache → provider → retry ·
CI → build → deploy → production

Hunt: inconsistent assumptions between layers; auth enforced on one path and
omitted on a parallel one; authorization lost in a hand-off; validation applied
before mutation but not after; cache bypasses; alternate routes to a sensitive
operation; background workers skipping controls; deployment config invalidating
an application guarantee; and individually-safe behaviors that combine into an
unsafe system.

## 7. Consolidate

Merge duplicates. Collapse symptoms into their root cause — one clear finding
beats five describing the same defect in five routes. Keep them separate only
when impact or remediation genuinely differs.

Severity must reflect real impact. **Do not inflate because a category sounds
scary.** Critical is full-system compromise, catastrophic auth bypass, infra
credential compromise. Informational is maintainability and test gaps with no
current exploitable path.

## 8. Final adversarial pass

A fresh reviewer challenges the whole audit: What surface was missed? Which
findings rest on assumptions? Which are plausibly false positives? Which Lows
combine into a High? Are there unreviewed entry points or alternate paths? Are
controls enforced in production, or only by convention? Are there trust
boundaries missing from the architecture model? Unbounded operations? Hidden
cost-amplification paths?

## 9. Report

Use the **`ReportFindings`** tool when the host renders findings — it takes
severity-ranked, typed findings with `file`, `line`, `summary`,
`failure_scenario`, `category`, and a `verdict` of `CONFIRMED` or `PLAUSIBLE`,
which maps directly onto VERIFIED / NEEDS_MORE_EVIDENCE. When you call it, don't
also print the findings as prose.

For a consolidated report someone will read or share, publish an **`Artifact`** —
executive summary, architecture overview, coverage and limitations, verified
findings, rejected/downgraded findings with reasons, reliability, performance,
test gaps, remediation priority, and remaining risks.

Per finding: ID · title · severity · confidence · category · component · files ·
function or route · lines · description · execution path · impact · evidence ·
why existing controls are insufficient · recommended fix · recommended
regression test · verifier conclusion.

State coverage honestly: what was reviewed, what wasn't, and why. Environment
you couldn't inspect, config you couldn't see, external systems you couldn't
reach — say so. **"I could not verify this" is a finding.**

Finally, emit the **remediation graph** (`A → B` for read dependencies; group,
serialize, or isolate for overlapping state) and **write the results into
`LLMHandOff.md`** with stable IDs and evidence levels. That file is what the next
session and `/remediate` consume — the report itself is transient.

**Show the graph. Do not implement it.**

## Claude Code mapping

| Framework concept | Claude Code |
|---|---|
| Read-only auditor | `Agent` + `subagent_type: "Explore"` (no Edit/Write tools exist) |
| Parallel workstreams | `run_in_background: true` on each `Agent` |
| Repo discovery | `Glob` / `Grep` (clickable links, permission-aware) |
| Show graph before analysis | `EnterPlanMode` → `ExitPlanMode` |
| Typed findings for the UI | `ReportFindings` (`verdict: CONFIRMED \| PLAUSIBLE`) |
| Consolidated shareable report | `Artifact` |
| Security review of a diff | `/security-review`, `/code-review high\|max` |
| Deep multi-agent cloud review | `/code-review ultra` (user-triggered, billed) |
| Continue an auditor | `SendMessage` (a new `Agent` call starts cold) |
| Out-of-scope issue found | `spawn_task` chip |
| Cross-session finding state | `LLMHandOff.md` with stable IDs |
| Hand findings to fixes | `/remediate` |

**Cost note:** each agent starts cold and re-derives context. Fan out by
*component boundary*, not per checklist item — five well-scoped auditors beat
twenty thin ones, and the verification step matters more than the count.
