---
name: constraint-driven-development
description: Interviews you for a quality bar with sane default thresholds, writes CONSTRAINTS.md, places each check by cost, and catches agents silencing checks or skipping tests. Use when no standards are written down, or an agent is producing more than anyone reads.
---

# Constraint-Driven Development

Define quality constraints once. Enforce them everywhere.

## Default Thresholds (override as needed)

| Constraint | Default |
|------------|---------|
| Test coverage | ≥80% |
| Bundle size (initial JS) | ≤200kb gzip |
| Core Web Vitals — LCP | ≤2.5s |
| Core Web Vitals — CLS | ≤0.1 |
| Core Web Vitals — INP | ≤200ms |
| API response time (p95) | ≤200ms |
| Accessibility | WCAG 2.1 AA |
| Security | OWASP Top 10 |
| Change size | ≤100 lines per PR (guideline) |

## Process

### Step 1 — Interview (5 questions)
Ask these, one at a time:
1. "What does a broken build look like to you? What would make you rollback?"
2. "What performance number would embarrass you in production?"
3. "Who uses this? Any accessibility requirements?"
4. "What security risks keep you up at night for this system?"
5. "How much test coverage do you consider 'enough'?"

### Step 2 — Write CONSTRAINTS.md

```markdown
# CONSTRAINTS.md

## Quality Bar
[Derived from interview + defaults]

## Automated Checks (run on every commit)
- [ ] Lint: [command]
- [ ] Type check: [command]
- [ ] Unit tests: [command]
- [ ] Coverage: [threshold]

## Pre-merge Gates
- [ ] Integration tests pass
- [ ] Bundle size ≤ [threshold]
- [ ] No new high/critical security findings

## Performance Targets
- LCP ≤ [value]
- INP ≤ [value]
- API p95 ≤ [value]

## Accessibility
- WCAG 2.1 [AA/AAA]

## What We Explicitly Don't Check
- [Conscious exclusions with rationale]
```

### Step 3 — Place each check
For every constraint, specify:
- Where it runs (pre-commit / CI / pre-deploy)
- Who owns fixing it when it fails
- What the escalation path is

### Step 4 — Watch for silencing
Flag immediately if you see:
- Tests commented out "temporarily"
- Coverage threshold lowered without discussion
- `eslint-disable` without explanation
- CI steps marked `continue-on-error: true`

Source: github.com/addyosmani/agent-skills · MIT
