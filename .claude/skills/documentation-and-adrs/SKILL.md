---
name: documentation-and-adrs
description: Architecture Decision Records, API docs, inline documentation standards — document the WHY. Use when making architectural decisions, changing APIs, or shipping features.
---

# Documentation and Architecture Decision Records

Document the *why*. Code shows the *what*. The *why* lives only in documentation.

## Architecture Decision Records (ADRs)

An ADR captures a significant technical decision so future engineers understand *why* the system is built the way it is.

Write an ADR when:
- Choosing a technology or framework
- Establishing a pattern that will be followed everywhere
- Making a trade-off with significant consequences
- Rejecting an apparently obvious approach

### ADR Template

```markdown
# ADR-[number]: [Short title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by ADR-[N]
**Deciders:** [Names or roles]

## Context

[What is the situation? What problem are we solving?
What constraints exist? What forces are at play?]

## Decision

[What we decided to do, stated clearly.]

## Rationale

[Why this option over the alternatives?
What did we evaluate and reject?]

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| [Option A] | [Reason] |
| [Option B] | [Reason] |

## Consequences

**Positive:**
- [Benefit 1]

**Negative:**
- [Trade-off 1]

**Risks:**
- [Risk 1] — Mitigation: [how]
```

## Inline Documentation

### When to comment
- Non-obvious *why* (not *what*)
- Edge case handling with the reason
- Workarounds with the bug/issue reference
- Business rules that look like arbitrary code

### When NOT to comment
- What the code does (the code itself shows this)
- Type information (use TypeScript)
- Obvious logic

```javascript
// Bad — states the obvious
// Increment i
i++;

// Good — explains the why
// Skip the first item — it's always the header row
for (let i = 1; i < rows.length; i++) {
```

## API Documentation

Every public function/endpoint needs:
- What it does (one sentence)
- Parameters with types and constraints
- Return value / response shape
- Error cases
- Example

```typescript
/**
 * Creates a new user account.
 * 
 * @param input - User creation parameters
 * @param input.email - Must be a valid email, unique in the system
 * @param input.name - Display name, 1-100 characters
 * @returns The created user with generated ID and timestamps
 * @throws {ValidationError} If email is invalid or already in use
 * @throws {RateLimitError} If too many accounts created from this IP
 * 
 * @example
 * const user = await createUser({ email: 'user@example.com', name: 'Alice' });
 * console.log(user.id); // "usr_abc123"
 */
```

## README Requirements

Every project needs a README with:
- What this project does (one paragraph)
- Prerequisites
- How to run locally
- How to run tests
- How to deploy
- Key architectural decisions (link to ADRs)
- Who to contact for help

Source: github.com/addyosmani/agent-skills · MIT
