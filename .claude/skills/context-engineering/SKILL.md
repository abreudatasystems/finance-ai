---
name: context-engineering
description: Feed agents the right information at the right time — rules files, context packing, MCP integrations. Use when starting a session, switching tasks, or when output quality drops.
---

# Context Engineering

Agents are only as good as the context they receive. Garbage in, garbage out.

## Context Hierarchy

```
CLAUDE.md / AGENTS.md    ← Always-on project rules
Skills                   ← Task-specific workflows  
Reference files          ← Loaded on demand
Conversation history     ← Accumulates during session
```

## Session Start Checklist
Before starting work, confirm the agent has:

- [ ] Project structure overview (or has run `find . -type f | head -50`)
- [ ] Relevant constraints (CONSTRAINTS.md if it exists)
- [ ] The specific task/spec being worked on
- [ ] Which files are in scope
- [ ] What's out of scope

## Context Packing Rules

### Include
- The exact files being changed
- Adjacent files that define interfaces/types used
- Test files for the code being changed
- Recent git history for the area being changed

### Exclude
- Unrelated modules
- Generated files (dist/, build/, node_modules/)
- Binary files
- Files > 500 lines unless directly relevant

### Signal quality drop
If output quality drops, it's often a context problem. Ask:
- Is the agent referencing outdated information?
- Has the task switched without re-establishing context?
- Is the conversation history too long and noisy?

## CLAUDE.md / AGENTS.md Template

```markdown
# Project: [Name]

## What This Is
[One paragraph]

## Tech Stack
- Language: [version]
- Framework: [version]
- Test runner: [command]
- Lint: [command]

## Key Directories
- src/: [what's here]
- tests/: [what's here]

## How To Run
- Dev: [command]
- Test: [command]
- Build: [command]

## Conventions
- [Code style rules]
- [Naming conventions]
- [Patterns to follow]

## Things To Never Do
- [Anti-patterns specific to this project]
```

## MCP Integration
Use MCP servers to give agents live access to:
- Documentation (source-driven-development)
- Browser (browser-testing-with-devtools)
- Database (for schema inspection)
- Search (for up-to-date library information)

Source: github.com/addyosmani/agent-skills · MIT
