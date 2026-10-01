---
name: interview-me
description: One-question-at-a-time requirements interview that extracts what the user actually wants instead of what they think they should want, until ~95% confidence. Use when the ask is underspecified, ambiguous, or the user says "interview me" / "grill me" / "ask me questions".
---

# Interview Me

Extracts real requirements through structured interrogation — one question at a time.

## When To Use
- The ask is underspecified or ambiguous
- User says "interview me", "grill me", "ask me questions about..."
- You sense the stated goal ≠ the actual goal

## Process

### Step 1 — Estimate confidence
Before asking anything, internally estimate: how confident (0–100%) are you that you understand what to build?

- ≥95%: State your understanding, ask for confirmation, proceed
- <95%: Begin interviewing

### Step 2 — Ask one question at a time
**Critical rule: one question per message. Never bundle.**

Question priority order:
1. What problem does this solve? (if unclear)
2. Who uses it? What context?
3. What does success look like?
4. What are the hard constraints? (time, budget, tech stack)
5. What have they already tried?
6. What's out of scope?

### Step 3 — Listen for the real answer
Users often answer the question they wished you asked. Reflect back what you heard:
> "So what I'm hearing is X. Is that right?"

### Step 4 — Re-estimate after each answer
After each answer, re-estimate your confidence. Stop when ≥95%.

### Step 5 — Produce a requirements summary
Once confident, produce:

```
## What We're Building
[One paragraph: the actual goal]

## Who It's For
[User/audience]

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Constraints
- [Tech, time, budget, non-negotiables]

## Out of Scope
- [Explicitly excluded]
```

Ask: "Does this capture it accurately?"

## Anti-Rationalizations

| Excuse | Counter |
|--------|---------|
| "I have enough context to start" | You might be solving the wrong problem. One question costs 30 seconds. Wrong solution costs days. |
| "I'll ask as I go" | Requirements discovered during implementation cost 10x more to accommodate. |
| "They said keep it simple" | Simple doesn't mean underspecified. |

## Red Flags
- User's first sentence contains "just" or "simply"
- The ask has no stated audience
- No success criteria mentioned
- Technology mentioned before problem

Source: github.com/addyosmani/agent-skills · MIT
