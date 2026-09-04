---
name: frontend-ui-engineering
description: Component architecture, design systems, state management, responsive design, WCAG 2.1 AA accessibility. Use when building or modifying user-facing interfaces.
---

# Frontend UI Engineering

Production-grade UI: accessible, performant, maintainable.

## Component Rules

### Single Responsibility
Each component does one thing. If you can't describe it in one sentence without "and", split it.

### Component Anatomy
```
ComponentName/
  index.tsx          # public export
  ComponentName.tsx  # implementation
  ComponentName.test.tsx
  ComponentName.stories.tsx (if using Storybook)
```

### Props Contract
- Explicit types for all props
- No `any`
- Required vs optional explicitly declared
- Document non-obvious props with JSDoc

## State Management Hierarchy

1. **Local state** — `useState` if only this component needs it
2. **Lifted state** — parent component if siblings need it
3. **Context** — for cross-cutting concerns (theme, auth, locale)
4. **Server state** — React Query / SWR for async data
5. **Global store** — Zustand / Redux only when genuinely global

Reach for the simplest option first.

## Accessibility (WCAG 2.1 AA — non-negotiable)

- Every interactive element reachable by keyboard
- Focus visible at all times (`outline` never `outline: none` without alternative)
- ARIA labels on non-text interactive elements
- Color contrast ≥4.5:1 for body text, ≥3:1 for large text
- Images have `alt` text (empty `alt=""` for decorative)
- Forms: labels associated with inputs, errors announced to screen readers
- No keyboard traps

## Responsive Design

Mobile-first. Design for 375px, then expand.

```css
/* Mobile first */
.component { ... }

/* Tablet */
@media (min-width: 768px) { ... }

/* Desktop */
@media (min-width: 1280px) { ... }
```

Never use fixed pixel widths for layout containers.

## Performance Budget

| Metric | Target |
|--------|--------|
| LCP | ≤2.5s |
| INP | ≤200ms |
| CLS | ≤0.1 |
| Initial JS | ≤200kb gzip |
| Images | WebP/AVIF, lazy-loaded below fold |

## Anti-Patterns to Avoid

- `useEffect` for derived state (derive inline instead)
- Prop drilling >2 levels (use context or composition)
- Inline styles for anything but dynamic values
- `!important` (signals specificity war)
- Uncontrolled forms in critical flows
- Missing loading/error/empty states

## Verification Checklist
- [ ] Works without JavaScript (progressive enhancement)
- [ ] Keyboard navigable
- [ ] Screen reader tested
- [ ] Works at 375px, 768px, 1280px
- [ ] Passes Lighthouse accessibility ≥90
- [ ] No layout shift on load
- [ ] Loading and error states handled

Source: github.com/addyosmani/agent-skills · MIT
