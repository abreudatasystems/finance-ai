---
name: api-and-interface-design
description: Contract-first design, Hyrum's Law, One-Version Rule, error semantics, boundary validation. Use when designing APIs, module boundaries, or public interfaces.
---

# API and Interface Design

Contracts first. Implementations second. Stability always.

## Hyrum's Law
> "With a sufficient number of users of an API, it does not matter what you promise in the contract: all observable behaviors of your system will be depended on by somebody."

Design your API knowing that everything observable becomes a contract — even bugs.

## Contract-First Process

### Step 1 — Define the contract before code
Write the interface/schema before any implementation:

```typescript
// Define the contract
interface UserService {
  getUser(id: UserId): Promise<User>;
  createUser(input: CreateUserInput): Promise<User>;
  updateUser(id: UserId, patch: Partial<User>): Promise<User>;
  deleteUser(id: UserId): Promise<void>;
}

// Define the types
type UserId = string; // UUID
interface User {
  id: UserId;
  email: string;
  name: string;
  createdAt: Date;
}
```

### Step 2 — Design error semantics
Every function should have explicit error cases:

```typescript
// Don't return null — return a Result or throw typed errors
type GetUserResult =
  | { success: true; user: User }
  | { success: false; error: 'NOT_FOUND' | 'UNAUTHORIZED' }
```

### Step 3 — Validate at boundaries
All external input is untrusted. Validate at the entry point, not deep in the stack.

```typescript
// Validate at the API boundary
function createUser(rawInput: unknown): Promise<User> {
  const input = CreateUserInputSchema.parse(rawInput); // throws on invalid
  return userRepository.create(input);
}
```

## REST API Rules

| Aspect | Rule |
|--------|------|
| Resources | Nouns, plural (`/users`, `/orders`) |
| Actions | HTTP verbs (GET, POST, PUT, PATCH, DELETE) |
| IDs | In path (`/users/{id}`) |
| Filters | In query string (`?status=active`) |
| Versioning | In path (`/v1/users`) or header |
| Errors | Consistent structure with `code`, `message`, `details` |

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email address is invalid",
    "details": [
      { "field": "email", "message": "Must be a valid email address" }
    ],
    "requestId": "req_abc123"
  }
}
```

## One-Version Rule
Support one version at a time. Deprecate old versions with a migration path. Never run two incompatible versions of the same API simultaneously if you can avoid it.

## Versioning Strategy
- **Non-breaking changes:** Add fields (never remove), add endpoints — no version bump
- **Breaking changes:** New version, deprecation notice, migration guide, sunset date

## Anti-Patterns

- Returning 200 with error in body
- Generic error messages ("Something went wrong")
- Null instead of explicit empty state
- Mixing concerns in one endpoint
- Undocumented behavior relied on by callers

Source: github.com/addyosmani/agent-skills · MIT
