---
name: git-workflow-and-versioning
description: Trunk-based development, atomic commits, change sizing (~100 lines), the commit-as-save-point pattern. Use when making any code change.
---

# Git Workflow and Versioning

Every commit is a save point. Commits are the unit of collaboration.

## Trunk-Based Development
Work directly on main (or short-lived branches ≤2 days). No long-lived feature branches.

Why: Long branches cause merge conflicts, integration surprises, and delayed feedback.

## Commit as Save Point
Commit when code is in a known good state:
- Tests pass
- No broken behavior
- One logical change

Never commit: broken state, half-finished work, "WIP" commits that can't be reverted.

## Atomic Commits
One commit = one logical change. If you can't describe it in one sentence, split it.

```bash
# Good — atomic
git commit -m "feat: add email validation to signup form"
git commit -m "test: add unit tests for email validation"

# Bad — mixed
git commit -m "add email validation, fix password reset bug, update tests, refactor user model"
```

## Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

[body — optional, explains WHY]

[footer — optional, issue refs, breaking changes]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `docs`: Documentation only
- `chore`: Build, config, tooling
- `perf`: Performance improvement

Examples:
```
feat(auth): add OAuth2 login with Google

Users can now sign in with their Google account.
This replaces the manual Google OAuth implementation.

Closes: #342
```

```
fix(api): return 404 instead of 500 for missing users

Previously, fetching a non-existent user caused an unhandled
promise rejection. Now returns { error: "NOT_FOUND" } with 404.
```

## Change Sizing
Target: ~100 lines per pull request (excluding generated files).

Larger than 400 lines? Split by:
- Type: schema migration separate from application code
- Layer: backend separate from frontend
- Risk: safe refactors before behavior changes

## Pre-Commit Checklist
- [ ] `git diff --staged` — reviewed every line being committed
- [ ] Tests pass locally
- [ ] No secrets or debug logging
- [ ] Commit message follows format

## Branch Naming (if using branches)
```
feat/[issue-number]-short-description
fix/[issue-number]-short-description
chore/update-dependencies
```

Source: github.com/addyosmani/agent-skills · MIT
