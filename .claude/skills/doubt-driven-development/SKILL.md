---
name: doubt-driven-development
description: Adversarial fresh-context review of every non-trivial decision in-flight — CLAIM → EXTRACT → DOUBT → RECONCILE → STOP. Use when stakes are high (production, security, irreversible), in unfamiliar code, or when a confident output feels too easy.
---

# Doubt-Driven Development

When stakes are high, confidence is a liability. Apply adversarial doubt.

## When To Use
- Production changes
- Security-sensitive code
- Irreversible operations (data deletion, payment processing)
- Unfamiliar codebase
- When an AI output feels suspiciously confident

## The CEDRS Loop

```
CLAIM → EXTRACT → DOUBT → RECONCILE → STOP
```

### CLAIM
State the decision being made:
> "I'm going to use [approach] for [reason]"

### EXTRACT
Pull out the key assumptions:
- What does this depend on being true?
- What would make this wrong?
- What edge cases exist?

### DOUBT
For each assumption, actively try to disprove it:
- What's the failure mode?
- What happens under load / at scale / with bad input?
- What would a skeptical code reviewer ask?

### RECONCILE
After doubting, make a final decision:
- Stand by the original approach (with justification)
- Modify it based on the doubts
- Abandon it and try a different approach

### STOP
Define the stopping condition before you start doubting. Doubt without limits becomes paralysis.

## Doubt Triggers

Doubt these things automatically:

| Trigger | Questions to ask |
|---------|-----------------|
| "This is the obvious approach" | Is it obvious because it's right, or because it's familiar? |
| "I've done this before" | Is this context identical? What's different? |
| "Tests pass" | Do tests cover the failure modes I just identified? |
| "It works in dev" | What's different about production? |
| Security code | What's the attack surface? What happens with malicious input? |
| Data mutations | What happens if this runs twice? Partial failure? |

## Output Format

```markdown
## Decision: [What you're deciding]

**Chosen approach:** [approach]

**Key assumptions:**
1. [Assumption]
2. [Assumption]

**Doubts considered:**
- [Doubt] → [Resolution]
- [Doubt] → [Resolution]

**Confidence:** High | Medium | Low
**Residual risk:** [What could still go wrong]
**Mitigation:** [How you'd catch it]
```

Source: github.com/addyosmani/agent-skills · MIT
