---
name: remediate
description: Run dependency-aware audit remediation as a repair graph — normalize findings into stable IDs, build the dependency and write-conflict graph, fan out fixes across isolated worktrees, then verify with an independent reviewer. Use when working through a completed code audit, a findings list, or LLMHandOff.md; when the user says "remediate", "work the audit", "fix the findings", or "continue the plan".
---

# Audit Remediation as a Repair Graph

Turn a completed audit into fixed code, without the two failure modes a
checklist produces: fixing symptoms in audit-report order, and two fixes
silently clobbering each other.

## 0. Change control — check before acting

**Default: do not commit, push, open PRs, merge, or deploy.** Local edits and
local test runs are always fine. Commit only on an explicit request, and treat
that authorization as covering *that batch only* — it does not persist to the
next one.

Never weaken or delete a legitimate test to get a green suite. Never disable a
security control for compatibility. Prefer the smallest correct fix; no
unrelated refactors.

## 1. Ingest — don't re-audit

The audit is the authoritative input. Re-open it only when implementation shows
an audit assumption was wrong, or you must read more code to fix something
safely.

In this project the normalized audit lives in **`LLMHandOff.md`** (in the `main`
worktree). It already carries stable finding IDs and an evidence level per fix.
Read it first. `CODEX_HANDOFF.md` is frozen legacy — read for history, never
update.

Take only VERIFIED findings. Skip FALSE_POSITIVE, rejected, speculative, and
NEEDS_MORE_EVIDENCE. Use the final severity for anything downgraded. **Never
renumber an ID** — they are the join key across sessions.

### GATE 0 — the findings and your working tree must share a baseline

A verified finding is only verified *against the commit it was found on*. Before
fixing anything:

```bash
git fetch origin --quiet
git log --oneline HEAD..origin/main | wc -l    # your tree vs what ships
```

Then ask: **was the audit run on this same baseline?** If the audit branch and
your working tree differ, findings will not land where the audit said they were,
and some will already be fixed.

Non-zero, or an audit run elsewhere → **STOP and re-verify each finding against
the tree you are about to edit** before writing a line. Cheap: grep for the
vulnerable construct at the cited `file:line`. If it isn't there, the finding is
`FALSE_POSITIVE (stale baseline)` — record that, don't "fix" it.

Earned here: an audit against a branch 69 commits behind `origin/main` produced
seven findings; six were already fixed on main. Re-verification took one command
each. Implementing them would have re-introduced nothing and wasted everything.

## 2. Normalize root causes

Map `FINDING → ROOT CAUSE → REQUIRED CHANGE`. Fix a shared root cause once when
that genuinely resolves several findings.

Do **not** merge findings just because they look alike. Keep them separate when
impact, remediation, trust boundary, or required tests differ — or when fixing
one does not guarantee the other.

## 3. Build the graph — before editing anything

Two rules, applied to every pair:

**Rule 1 — read dependency.** Does B need A's output to be implemented
*correctly*? Then `A → B`. Do not create an edge merely because A appears first
in the report.

**Rule 2 — write conflict.** No read dependency? Do they touch the same file,
function, route, schema, migration, CI workflow, or test fixture? If yes:
combine, serialize, or isolate. If no: parallel.

Dependency order beats severity order. A Low foundational fix runs before the
High that depends on it. State any edge that inverts severity explicitly — it is
the most valuable output of this phase and the easiest to lose.

Present the graph before implementing. Use `EnterPlanMode` when the user should
approve it first; otherwise show it and proceed.

Per node: purpose, finding IDs, files, dependencies, write conflicts,
parallel-safe yes/no, and why.

## 4. Fan out — worktree isolation is the write-conflict answer

Claude Code solves Rule 2 mechanically. Spawn each independent workstream with
its own git worktree:

```
Agent(
  subagent_type: "general-purpose",
  isolation: "worktree",          # own worktree — cannot trample siblings
  run_in_background: true,        # true fan-out
  description: "Fix REL-02 slot claim",
  prompt: "<see brief below>"
)
```

Findings that share state go in **one** agent, not several. `isolation:
"worktree"` prevents file collisions; it does not prevent two agents making
semantically contradictory changes to the same subsystem.

This repo already spans worktrees (`QuizGame-main`, `-backend`, `-android`,
`-webapp`). Work in the one that owns the code — they are worktrees of one repo,
so a branch checked out in one cannot be checked out in another.

Each agent brief must carry: the finding ID and severity, the evidence, the
vulnerable path, the files it may modify, the correctness property expected, the
tests required, and dependencies already satisfied. Tell it to implement the
smallest correct change, add regression tests, run focused tests plus
typecheck/lint, and report every changed file and any newly discovered
dependency.

If two running workstreams turn out to overlap: stop treating them as
independent, update the graph, then combine or serialize.

## 5. Test the property, not the line

A test that passes whether or not the code works is worse than no test — it
manufactures confidence. Prove the property:

- authz: unauthorized → DENIED **and** authorized → ALLOWED
- validation: valid → accepted, adversarial → rejected safely
- timeout/retry: dependency failure → *bounded* failure, not endless retry
- cache/keys: distinct logical keys cannot collide; entries cannot outlive TTL
- concurrency: assert the *ordering invariant* the fix establishes

**Then verify the test is load-bearing:** revert the fix, confirm the test goes
red, restore. If it can't fail, say so plainly rather than counting it as
coverage.

Where a property cannot be proven by unit test — database isolation semantics,
Redis atomicity, a real TLS handshake — say which mechanism actually carries the
guarantee and mark the finding's evidence level accordingly.

## 6. Evidence levels — the most important convention here

Record how strongly each fix is actually established. Do not upgrade one without
doing the work.

| Level | Means |
|---|---|
| VERIFIED | typecheck + tests run and passed after the change |
| COMPILED | builds, but no test exercises the changed path |
| WRITTEN | correct by inspection; never compiled or run |
| UNPROVEN | covered only by mocks that cannot fail if the code is broken |

"Fixed" for code that never reached a compiler is the specific failure this
guards against.

## 7. Independent review — the implementer never signs off

Spawn a **fresh** agent that did not write the code, and task it to *disprove*
the fix. Give it the original finding, the original code context, the diff, and
the tests.

For diff-shaped review, `/code-review` is the native path — `high` or `max` for
breadth, `ultra` for a multi-agent cloud review (user-triggered and billed; you
cannot launch it yourself).

Tell the reviewer to hunt alternate paths to the same operation, middleware and
router inheritance, background execution, concurrency, error handling — and
whether the tests genuinely prove the property or merely assert call shapes.
Verdict per finding: **APPROVED / NEEDS_CHANGES / REJECTED**.

**Agent findings are not ground truth.** Independently verify any blocking claim
before acting on it — and equally, before dismissing it.

## 8. Repair loop

`NEEDS_CHANGES` → repair → focused tests → review again. Don't stop at one retry
for convenience, and don't churn: if repeated attempts expose a design-level
blocker, document the blocker, mark the finding unresolved, and move on to
independent workstreams.

## 9. Recheck dependents

When a shared component changes, re-run tests and review for everything
downstream of it. An approval granted before a shared interface changed is
stale. Signature changes are a recheck trigger — including in test doubles that
stub the old shape.

## 10. Integrate, then regress

Resolve conflicts intentionally; never blind-pick ours/theirs on anything
security-sensitive. Then run the full suite, typecheck, lint, build, and
migration checks — **per affected component**, since this repo has backend,
webapp, and android with separate toolchains.

Re-ask, for each original finding: *can the original failure still occur?*
Reason through the original path; don't rely only on the new tests.

Trace across fixes for interactions individually-correct changes can create:
middleware ordering, duplicated or missing controls, conflicting retry policies,
transaction isolation, authorization gaps between layers, and deployment
settings that negate an application-level protection.

## 11. New issues you introduced

A fix that creates a bug gets its own node and its own ID — implement, test,
review, revalidate. Never quietly append it to an unrelated fix.

This includes **comments**: replacing a wrong rationale with a confident but
false safety claim is a new defect, because the next reader will trust it.

## 12. Final report

Map **every** verified finding to `FIXED` / `PARTIALLY_FIXED` / `NOT_FIXED` /
`REGRESSED`, with evidence. Include: executive summary, the final graph
(including edges discovered during implementation), per-finding detail, files
changed with their finding IDs, tests added and what each protects, test
results, a verification matrix, integration issues, and remaining risks.

Then **update `LLMHandOff.md`** — matrix, evidence levels, and next order — so
the next session resumes instead of re-deriving. That file is the durable output;
this report is the transient one.

## Claude Code mapping

| Framework concept | Claude Code |
|---|---|
| Spawn implementation agents | `Agent` + `subagent_type`, `run_in_background: true` |
| Isolate conflicting workstreams | `Agent` + `isolation: "worktree"` |
| Independent reviewer | a fresh `Agent`, or `/code-review high\|max\|ultra` |
| Show graph before implementing | `EnterPlanMode` → `ExitPlanMode` |
| Continue an existing agent | `SendMessage` (a new `Agent` call starts cold) |
| Long test/build runs | `Bash` + `run_in_background: true` |
| Track findings across sessions | `LLMHandOff.md` with stable IDs |
| Out-of-scope issue found in passing | `spawn_task` chip, not scope creep |
| Recurring cadence | `/loop`, or the `schedule` skill |

**Cost note:** every spawned agent starts cold and re-derives context. Fan out
when workstreams are genuinely independent and the isolation buys something —
not per finding by reflex. One well-briefed reviewer usually beats five thin
ones, because the load-bearing requirement is only that the implementer isn't
the reviewer.
