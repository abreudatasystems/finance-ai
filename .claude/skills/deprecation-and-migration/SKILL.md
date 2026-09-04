---
name: deprecation-and-migration
description: Code-as-liability mindset, compulsory vs advisory deprecation, migration patterns, zombie code removal. Use when removing old systems, migrating users, or sunsetting features.
---

# Deprecation and Migration

Code is a liability. Every line of code has a maintenance cost. Remove what you don't need.

## Code-As-Liability Mindset
The goal is not to write more code. The goal is to solve problems. If a problem can be solved by deleting code, delete the code.

## Deprecation Types

| Type | When | User action required |
|------|------|---------------------|
| **Advisory** | Signaling future removal, migration path exists | Encouraged |
| **Compulsory** | Sunset date set, migration required | Required |
| **Emergency** | Security issue, remove immediately | Required now |

## Deprecation Process

### Step 1 — Document what's being removed
```markdown
# Deprecation Notice: [Feature/API Name]

**Deprecated in:** v2.3.0 (2026-01-15)
**Removed in:** v3.0.0 (estimated 2026-06-01)

**Why:** [Reason — security issue / replaced by X / no longer used]

**Migration:** Use `newFeature` instead:
  ```javascript
  // Before
  oldFunction(param);
  
  // After
  newFunction({ param });
  ```

**Help:** [Link to migration guide or issue]
```

### Step 2 — Add deprecation warnings
```javascript
function oldFunction(param) {
  console.warn(
    '[Deprecated] oldFunction() is deprecated and will be removed in v3.0.0. ' +
    'Use newFunction() instead. See: https://docs.example.com/migration'
  );
  return newFunction({ param });
}
```

### Step 3 — Set a sunset date
No sunset date = never gets removed. Set a date and commit to it.

### Step 4 — Migrate users
- Notify via changelog, email, docs
- Provide tooling if migration is complex (codemods)
- Track adoption via logs

### Step 5 — Remove on the sunset date
When the date arrives:
- Confirm no production usage (check logs)
- Remove the code
- Update docs

## Zombie Code

Zombie code: code that runs but serves no purpose. Signs:
- Feature flags that are always `true` or `false`
- Configuration for systems that no longer exist
- Functions with no callers
- Tables with no readers

```bash
# Find potential dead code
grep -r "oldFeatureName" src/
git log --all --full-history -- path/to/file  # When was this last touched?
```

## Database Migration Safety

For any schema change:
1. Add columns before using them (backward compatible)
2. Deploy code that handles both old and new schema
3. Migrate data
4. Remove old columns only after all code is updated

Never: rename columns, change column types, or drop columns in a single deploy.

Source: github.com/addyosmani/agent-skills · MIT
