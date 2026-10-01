---
name: incremental-implementation
description: Thin vertical slices — implement, test, verify, commit. Feature flags, safe defaults, rollback-friendly changes. Use for any change touching more than one file.
---

# Incremental Implementation

One slice at a time. Every slice is working software. Every commit is a rollback point.

## The Slice Loop

```
Pick slice → Implement → Test → Verify → Commit → Repeat
```

Never move to the next slice until the current one is:
- Implemented
- Tested (at least unit-level)
- Verified (runs, produces expected output)
- Committed

## Rules

### Rule 1: Feature flags for risky changes
Any change that affects production behavior before it's fully tested goes behind a flag:
```
if (featureFlags.isEnabled('new-auth-flow')) {
  // new implementation
} else {
  // existing implementation
}
```

### Rule 2: Safe defaults
New config options default to the current behavior. Opt-in to the new behavior.

### Rule 3: Rollback-friendly commits
Every commit should be independently revertable:
- One concern per commit
- Commit message explains *why*, not *what*
- Never commit broken state

### Rule 4: Stop at failures
If a slice breaks something:
1. Stop. Don't push forward hoping it'll resolve.
2. Revert to last green state.
3. Understand why it broke.
4. Take a smaller slice.

## Commit Format
```
[type]: short description

Why: [reason this change exists]
What: [what changed, if not obvious]

Fixes: #[issue] (if applicable)
```
Types: feat | fix | refactor | test | docs | chore

## Verification Checklist (per slice)
- [ ] Code runs without errors
- [ ] Tests written for new behavior
- [ ] Existing tests still pass
- [ ] No regressions in related areas
- [ ] Feature flag in place (if behavior-changing)

Source: github.com/addyosmani/agent-skills · MIT
