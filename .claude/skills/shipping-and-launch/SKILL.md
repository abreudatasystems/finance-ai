---
name: shipping-and-launch
description: Pre-launch checklists, feature flag lifecycle, staged rollouts, rollback procedures, monitoring setup. Use when preparing to deploy to production.
---

# Shipping and Launch

Shipping is not the end. It's the beginning of production operation. Prepare accordingly.

## Pre-Launch Checklist

### Code Quality
- [ ] All tests pass in CI
- [ ] Code reviewed and approved
- [ ] No high/critical security findings
- [ ] Performance tested (Lighthouse ≥ targets)
- [ ] Accessibility tested (Lighthouse ≥90)

### Observability
- [ ] Logging in place for key operations
- [ ] Metrics instrumented (RED: rate, errors, duration)
- [ ] Alerts configured (error rate, latency, availability)
- [ ] Runbooks written for new alerts
- [ ] Dashboards updated

### Deployment
- [ ] Deployment script tested in staging
- [ ] Database migrations tested and reversible
- [ ] Feature flags in place for risky changes
- [ ] Rollback procedure documented and tested
- [ ] Rollback decision threshold defined

### Communication
- [ ] Changelog updated
- [ ] Internal team notified
- [ ] Support team briefed (if user-facing)
- [ ] Status page updated (if applicable)

## Staged Rollout

Don't ship to 100% at once:

```
1%   → Monitor for 30 minutes
10%  → Monitor for 1 hour
50%  → Monitor for 2 hours
100% → Monitor for 24 hours
```

Feature flags enable this without code changes.

## Rollback Decision Framework

Define before you ship:
- **Rollback immediately if:** error rate > [X]% for > 5 minutes
- **Page on-call if:** error rate > [X]% for > 2 minutes
- **Monitor closely if:** latency p95 > [X]ms

```bash
# Know this command before you need it
# Kubernetes
kubectl rollout undo deployment/my-service

# Vercel
vercel rollback

# Heroku
heroku releases:rollback v[N]
```

## Feature Flag Lifecycle

```
1. Create flag (default: OFF)
2. Deploy code with flag
3. Enable for internal users
4. Enable for % of users (staged rollout)
5. Enable for 100% of users
6. Remove flag from code (cleanup task)
```

Flag cleanup is part of the launch. Schedule it.

## Post-Launch Monitoring (first 24 hours)

Check these after every deploy:
- Error rate (compare to pre-deploy baseline)
- Latency p50, p95, p99
- Key business metrics (if applicable)
- User-reported issues

## Definition of "Shipped"

A feature is not shipped until:
- [ ] It's in production
- [ ] It's monitored
- [ ] The feature flag is managed
- [ ] The rollback plan is confirmed
- [ ] The team knows how to operate it

Source: github.com/addyosmani/agent-skills · MIT
