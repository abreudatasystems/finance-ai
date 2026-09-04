---
name: ci-cd-and-automation
description: Shift Left, Faster is Safer, feature flags, quality gate pipelines, failure feedback loops. Use when setting up or modifying build and deploy pipelines.
---

# CI/CD and Automation

Fast feedback loops. Every commit tested. Automated deployment.

## Core Principles

### Shift Left
Run checks as early as possible:
- Pre-commit: lint, type check, unit tests
- PR: full test suite, security scan
- Pre-deploy: integration tests, smoke tests

The later a bug is caught, the more expensive it is.

### Faster is Safer
Counterintuitive: faster deployments are safer because:
- Smaller changesets are easier to reason about
- Rollbacks are simpler
- Problems are caught sooner

## Pipeline Stages

```
Commit Push
    ↓
[Stage 1 — Fast feedback, <2 minutes]
  • Lint
  • Type check
  • Unit tests
  • Build check
    ↓
[Stage 2 — Full validation, <10 minutes]
  • Integration tests
  • Security scan (dependency audit)
  • Bundle size check
    ↓
[Stage 3 — Deploy to staging]
  • Smoke tests
  • E2E tests (critical paths only)
    ↓
[Stage 4 — Deploy to production]
  • Feature flags (gradual rollout)
  • Health checks
  • Monitoring alerts armed
```

## Quality Gates

Every gate must have:
1. A clear pass/fail condition
2. An owner (who fixes failures)
3. A maximum acceptable failure rate

```yaml
# Example: GitHub Actions quality gate
- name: Quality Gate
  run: |
    npm run lint        # Must pass
    npm run typecheck   # Must pass
    npm run test -- --coverage --coverageThreshold='{"global":{"lines":80}}'
    npm run build       # Must succeed
```

## Feature Flags

Use feature flags for any change that:
- Changes user-visible behavior
- Is in progress but needs to ship
- Needs to be rolled back without a deploy

```javascript
// Check flag at runtime, not build time
if (await flags.isEnabled('new-checkout-flow', { userId })) {
  return renderNewCheckout();
}
return renderLegacyCheckout();
```

## Rollback Plan

Before every deploy, know:
1. What's the rollback command?
2. How long does rollback take?
3. Is the database migration reversible?
4. What's the decision threshold for rollback? (error rate, latency)

## Failure Feedback Loop

When CI fails:
1. The commit author is notified immediately
2. Fix within the day, or revert
3. Never let main stay broken — it blocks everyone

## Anti-Patterns

- "Works on my machine" → enforce same environment in CI
- Flaky tests → fix or quarantine them, don't ignore
- Manual deployment steps → automate them
- Long-running pipelines → parallelize, fail fast

Source: github.com/addyosmani/agent-skills · MIT
