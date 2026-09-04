---
name: code-simplification
description: Chesterton's Fence, Rule of 500, reduce complexity while preserving exact behavior. Use when code works but is harder to read or maintain than it should be.
---

# Code Simplification

Complexity is a cost. Simplicity is a feature. But never remove something you don't understand.

## Chesterton's Fence

> "Don't remove a fence until you know why it was built."

Before deleting or simplifying any code, understand why it exists. Comment history, git blame, and tests are evidence.

## The Rule of 500
If a file exceeds 500 lines, it's doing too much. Split it.
If a function exceeds 50 lines, it's doing too much. Split it.
If a class has more than 10 methods, it probably has too many responsibilities.

These aren't hard rules — they're signals worth investigating.

## Simplification Process

### Step 1 — Understand before touching
- Read the tests
- Read git history (`git log -p [file]`)
- Understand what the code is supposed to do

### Step 2 — Identify complexity sources

| Type | Signs |
|------|-------|
| Accidental complexity | Could be simpler with better abstractions |
| Essential complexity | Complexity that comes from the problem itself |

Only fight accidental complexity. Essential complexity is irreducible.

### Step 3 — Apply simplifications
In order of safety:

1. **Rename** for clarity (safest — behavior unchanged)
2. **Extract** repeated logic into a function
3. **Inline** abstractions that add no value
4. **Delete** dead code (verify with tests that nothing breaks)
5. **Restructure** control flow for readability

### Step 4 — Verify behavior preserved
- All existing tests must still pass
- No behavior change — only clarity change
- If tests don't exist, write them before simplifying

## Common Simplifications

```javascript
// Nested ternaries (hard to read)
const label = isAdmin ? 'Admin' : isEditor ? 'Editor' : isViewer ? 'Viewer' : 'Guest';

// Object lookup (clear)
const roleLabels = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const label = roleLabels[role] ?? 'Guest';
```

```javascript
// Complex condition
if (user && user.subscription && user.subscription.status === 'active' && !user.subscription.cancelled) {

// Named boolean
const hasActiveSubscription = user?.subscription?.status === 'active' && !user?.subscription?.cancelled;
if (hasActiveSubscription) {
```

## Never Simplify

- Code that handles a known edge case (without replacing that handling)
- Error recovery paths
- Security checks
- Code with no tests and no documentation of intent

Source: github.com/addyosmani/agent-skills · MIT
