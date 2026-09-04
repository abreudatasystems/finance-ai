---
name: spec-driven-development
description: Write a PRD covering objectives, commands, structure, code style, testing, and boundaries before any code. Use when starting a new project, feature, or significant change. Trigger on "write a spec", "create a PRD", "plan this feature", or before any substantial implementation.
---

# Spec-Driven Development

Write the spec before writing code. Every substantial change starts here.

## Rule
No implementation until the spec is approved. "I'll figure it out as I go" is a red flag.

## Process

### Step 1 — Gather context
If requirements are unclear, use interview-me first. Come back here with answers.

### Step 2 — Write the spec

```markdown
# Spec: [Feature Name]

## Objective
One paragraph. What problem does this solve, for whom, and why now?

## Success Criteria
- [ ] Measurable outcome 1
- [ ] Measurable outcome 2
- [ ] Measurable outcome 3

## User Stories
- As a [user], I want [action] so that [benefit]

## Technical Approach
[High-level: what changes, which systems are involved]

## API / Interface Changes
[Endpoints, function signatures, events — if applicable]

## Data Model Changes
[Schema additions/modifications — if applicable]

## Code Style
[Language, framework conventions, naming, error handling]

## Testing Requirements
- Unit: [what to test]
- Integration: [what to test]
- E2E: [what to test]

## Out of Scope
- [Explicitly excluded to prevent scope creep]

## Open Questions
- [ ] Question that needs an answer before/during implementation

## Definition of Done
- [ ] All tests pass
- [ ] Code reviewed
- [ ] Docs updated
- [ ] Feature flag ready (if applicable)
```

### Step 3 — Get approval
Present the spec. Ask: "Anything missing or wrong before we start?"

Do not proceed until explicit approval.

### Step 4 — Hand off to planning
Once approved, pass to planning-and-task-breakdown.

## Anti-Rationalizations

| Excuse | Counter |
|--------|---------|
| "It's a small change, no spec needed" | Every large bug was once a "small change". |
| "We'll iterate anyway" | Iteration without a baseline is drift, not improvement. |
| "The spec will change, so why write it?" | The act of writing forces decisions that prevent costly surprises. |

Source: github.com/addyosmani/agent-skills · MIT
