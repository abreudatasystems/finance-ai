---
name: source-driven-development
description: Ground every framework decision in official documentation — verify, cite sources, flag what's unverified. Use when you want authoritative, source-cited code for any framework or library.
---

# Source-Driven Development

Every framework decision is grounded in official documentation. Unverified claims are flagged.

## The Problem
AI agents hallucinate API details, deprecated methods, and non-existent options. Source-driven development forces grounding in reality.

## Rules

### Rule 1: Cite sources
Every non-trivial framework usage includes a source:
```
// Using React 18 concurrent features
// Source: react.dev/blog/2022/03/29/react-v18#new-feature-transitions
const [isPending, startTransition] = useTransition();
```

### Rule 2: Flag unverified claims
When you're not certain something is accurate, say so:
```
// NOTE: Verify this against current docs — behavior may have changed in v4
```

### Rule 3: Check the version
The answer for v2 is not the answer for v4. Always confirm which version is installed:
```bash
npm list [package-name]
```

### Rule 4: Use official docs, not Stack Overflow
Priority order:
1. Official documentation
2. Official GitHub repo (README, CHANGELOG)
3. Official blog posts
4. Community resources (with skepticism)

## Research Process

### Before writing new framework code
1. Check the installed version
2. Find the relevant official docs section
3. Read the current API, not a tutorial
4. Check for deprecation notices
5. Write the code citing the source

### When something doesn't work
1. Read the error message exactly
2. Search the official GitHub issues/discussions
3. Check the CHANGELOG for the installed version
4. Only then go to community resources

## Output Format

When writing source-driven code, include a brief citation block:

```markdown
**Sources consulted:**
- [Feature name]: [URL] (version X.Y)
- [Method name]: [URL]

**Unverified assumptions:**
- [ ] [Assumption] — needs verification against [source]
```

Source: github.com/addyosmani/agent-skills · MIT
