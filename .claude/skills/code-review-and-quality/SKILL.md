---
name: code-review-and-quality
description: Five-axis review, change sizing (~100 lines), severity labels (Nit/Optional/FYI), review speed norms, splitting strategies. Use before merging any change.
---

# Code Review and Quality

Code review is how good code becomes the default. Every change gets reviewed.

## Five-Axis Review

### 1. Correctness
- Does it do what it claims?
- Are edge cases handled? (null, empty, boundary values)
- Are error paths handled?
- Any race conditions or concurrency issues?

### 2. Security
- Is user input validated and sanitized?
- Are secrets hardcoded? (Never.)
- SQL injection risk?
- XSS risk?
- Auth checks in place?

### 3. Performance
- Any N+1 queries?
- Unbounded loops or recursion?
- Missing indexes for new queries?
- Memory leaks?

### 4. Maintainability
- Would a new engineer understand this in 6 months?
- Is complexity justified by necessity?
- Are names descriptive?
- Is there duplication that should be abstracted?

### 5. Test Coverage
- Are new behaviors tested?
- Are error cases tested?
- Would tests catch a regression?

## Severity Labels

| Label | Meaning | Action required |
|-------|---------|----------------|
| **Blocking** | Must fix before merge | Yes |
| **Optional** | Would improve the code | Author decides |
| **Nit** | Minor style/clarity preference | Take it or leave it |
| **FYI** | Note for awareness, no action | No |

## Change Sizing Rule
Target: ~100 lines changed per review.
Hard limit: 400 lines (excluding generated files).

If a change is larger:
- Split by layer (data model / business logic / UI)
- Split by feature (auth part / profile part)
- Split by risk (safe refactors first, behavior changes second)

Large changes have lower review quality. This is physics.

## Review Speed Norms

| Change size | Expected turnaround |
|-------------|-------------------|
| <100 lines | Same day |
| 100-300 lines | 1 business day |
| >300 lines | Push back on size or 2 business days |

## Review Comment Format

```
[Blocking] This will throw a null pointer if user is not logged in.
The `currentUser` can be null when accessed from a public route.

Suggestion:
if (!currentUser) {
  return redirect('/login');
}
```

```
[Nit] Consider renaming `data` to `userProfile` for clarity.
```

## What "Approved" Means
An approval means: "I am confident this is correct, secure, maintainable, and tested. I would be comfortable being on-call if this ships."

Source: github.com/addyosmani/agent-skills · MIT
