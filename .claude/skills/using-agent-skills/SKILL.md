---
name: using-agent-skills
description: Maps incoming work to the right skill workflow and defines shared operating rules. Use when starting a session, deciding which skill applies, or when unsure how to proceed.
---

# Using Agent Skills

Maps incoming work to the right skill and defines how all skills operate.

## Skill Selection Map

| What you're doing | Use skill |
|---|---|
| Exploring a vague idea | idea-refine |
| Requirements are unclear | interview-me |
| Starting a new feature/project | spec-driven-development |
| Need to set quality standards | constraint-driven-development |
| Have a spec, need tasks | planning-and-task-breakdown |
| Implementing code | incremental-implementation |
| Need tests | test-driven-development |
| Building UI/frontend | frontend-ui-engineering |
| Designing an API | api-and-interface-design |
| Debugging browser issues | browser-testing-with-devtools |
| Something is broken | debugging-and-error-recovery |
| Reviewing before merge | code-review-and-quality |
| Code is too complex | code-simplification |
| Security concerns | security-and-hardening |
| Performance issues | performance-optimization |
| Making commits | git-workflow-and-versioning |
| Setting up CI/CD | ci-cd-and-automation |
| Removing old code | deprecation-and-migration |
| Writing docs | documentation-and-adrs |
| Adding monitoring | observability-and-instrumentation |
| Deploying to production | shipping-and-launch |
| Grounding in official docs | source-driven-development |
| High-stakes decision | doubt-driven-development |
| Feeding agent context | context-engineering |

## Shared Operating Rules

1. **No skipping steps.** Every skill has checkpoints. Do not rationalize past them.
2. **Tests are proof, not commentary.** "It should work" is never sufficient.
3. **Verification before handoff.** Every task ends with evidence — passing tests, build output, runtime data.
4. **Small, atomic changes.** One concern per commit. One slice at a time.
5. **Document the why, not the what.** Code shows what; comments and ADRs show why.

Source: github.com/addyosmani/agent-skills · MIT
