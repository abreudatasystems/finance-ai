---
name: debugging-and-error-recovery
description: Five-step triage — reproduce, localize, reduce, fix, guard. Stop-the-line rule, safe fallbacks. Use when tests fail, builds break, or behavior is unexpected.
---

# Debugging and Error Recovery

Stop. Understand. Fix. Guard. In that order.

## The Stop-The-Line Rule
When something breaks, **stop adding features**. A bug today is smaller than a bug discovered after three more changes are built on top of it.

## Five-Step Triage

### Step 1 — Reproduce
Find the smallest, most reliable way to trigger the bug:
- What inputs produce the error?
- Does it happen every time or intermittently?
- Which environment (dev/staging/prod)?
- What changed recently?

**If you can't reliably reproduce it, you can't reliably fix it.**

### Step 2 — Localize
Narrow down where the bug lives:
- Read the error message exactly. Don't paraphrase.
- Read the stack trace from top to bottom.
- Find the line where control diverges from expectations.
- Use `console.log` / debugger / breakpoints to confirm.

### Step 3 — Reduce
Create the smallest possible reproduction:
- Remove unrelated code
- Hardcode inputs
- Isolate to a single function if possible

The smaller the reproduction, the clearer the cause.

### Step 4 — Fix
Once cause is confirmed:
- Fix the root cause, not the symptom
- Don't patch around the bug if you can fix it at the source
- Consider: is this a local fix or a systematic issue?

### Step 5 — Guard
Prevent recurrence:
- Write a test that would have caught this bug
- If the bug was in a code path with no tests, add tests for neighboring code too
- Update CONSTRAINTS.md if a new check would prevent this class of bug

## Common Mistake: Fixing the Wrong Thing

```
Error: Cannot read property 'name' of undefined

Wrong fix: Add null check at the symptom
Right fix: Find why the object is undefined in the first place
```

## Safe Fallback Pattern

When you need to ship a fix before fully understanding the root cause:
1. Add the safe fallback (null check, default value, error boundary)
2. Log when the fallback is triggered (so you know how often the root cause fires)
3. File a task to fix the root cause
4. Never remove the logging until root cause is fixed

## Anti-Rationalizations

| Excuse | Counter |
|--------|---------|
| "It works on my machine" | Reproduce in the failing environment before claiming it's fixed. |
| "I'll fix it properly later" | The safe fallback IS the proper fix for now. File the root cause task. |
| "It's an edge case" | Edge cases become common cases under load. |

Source: github.com/addyosmani/agent-skills · MIT
