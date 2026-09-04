---
name: planning-and-task-breakdown
description: Decompose specs into small, verifiable tasks with acceptance criteria and dependency ordering. Use when you have a spec and need implementable units. Trigger on "break this down", "create tasks", "plan the implementation".
---

# Planning and Task Breakdown

Specs become small, verifiable tasks. No task should take more than a few hours.

## Rule
A task that can't be verified independently isn't a task — it's a wish.

## Process

### Step 1 — Read the spec
Confirm you have an approved spec. If not, use spec-driven-development first.

### Step 2 — Identify slices
A vertical slice = working software, top to bottom, for one user-visible outcome.

Bad slicing (horizontal): "Add database layer" → "Add API layer" → "Add UI layer"
Good slicing (vertical): "User can log in with email" → "User can reset password"

### Step 3 — Write the task list

For each task:

```markdown
## Task [N]: [Short name]

**Phase:** Define | Plan | Build | Verify | Review | Ship
**Size:** XS (<30min) | S (<2h) | M (<half day) | L (<1 day)
**Depends on:** Task [N-x] (or "none")

### What to build
[One paragraph description]

### Acceptance criteria
- [ ] Criterion 1 (observable, binary)
- [ ] Criterion 2
- [ ] Tests pass

### Definition of done
- [ ] Code written
- [ ] Tests written and passing
- [ ] Reviewed (if ≥M size)
- [ ] Committed with clear message
```

### Step 4 — Order by dependency
List tasks in the order they must be done. Make dependencies explicit.

### Step 5 — Flag risks
For any task marked L, flag it before starting:
> "This task is large. Can we split it into smaller slices?"

## Task Size Rules
- XS: Single function, config change, copy fix
- S: Single component, single endpoint
- M: A feature slice with tests
- L: Multiple related changes — consider splitting

## Anti-Rationalizations

| Excuse | Counter |
|--------|---------|
| "I'll track it in my head" | Invisible tasks become invisible failures. |
| "This is too small to write down" | XS tasks take 2 minutes to write and prevent drift. |
| "Dependencies are obvious" | They're obvious to you today. Write them down for tomorrow. |

Source: github.com/addyosmani/agent-skills · MIT
