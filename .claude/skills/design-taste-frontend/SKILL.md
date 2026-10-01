---
name: design-taste-frontend
description: Anti-slop frontend design skill. Use when building or improving any frontend interface — websites, landing pages, dashboards, components, apps. Reads the brief, infers the right design direction, and ships interfaces that don't look templated or AI-generated. Applies three adjustable dials: VARIANCE (layout experimentation), MOTION (animation depth), DENSITY (information per viewport). Triggers on: "make this look better", "redesign", "it looks like AI made this", "improve the UI", "frontend", "landing page", "component", "web design", or any frontend design/styling task.
version: 2.0
---

# Design Taste — Frontend

The Anti-Slop Frontend Framework. Reads the brief, infers the design language, and ships interfaces that don't look templated.

## Settings (adjust these dials: 1-10)

```
DESIGN_VARIANCE: 6    # Layout experimentation (low: centered/clean · high: asymmetric/modern)
MOTION_INTENSITY: 5   # Animation depth (low: hover only · high: scroll/magnetic/spring)
VISUAL_DENSITY: 5     # Information per viewport (low: spacious · high: dense dashboards)
```

## Step 0 — Read the Brief

Before designing anything, read the brief carefully. Infer:
- **Who** is the audience
- **What** is the purpose (sell, inform, tool, dashboard, portfolio...)
- **What feeling** should the design evoke
- **What aesthetic** fits (editorial, clinical, brutalist, warm, technical, playful...)

Do NOT default to "modern SaaS" when the brief doesn't specify.

## Design Direction Map

Map the brief to a direction before touching code:

| Brief signals | Direction to avoid | Direction to explore |
|--------------|-------------------|---------------------|
| "startup", "product" | SaaS-cream template | Committed brand color, strong type |
| "warm", "family", "artisan" | Beige/sand bg | Saturated accent, rich typography |
| "technical", "developer tool" | Soft gradients | Terminal-native, monospace, high contrast |
| "luxury", "premium" | Gradient cards | Restraint, whitespace, editorial |
| "fintech" | Navy + gold | Unexpected palette, data-forward |
| "creative agency" | Card grid | Asymmetric, editorial, full-bleed |

## Hard Rules — Always Apply

### Typography
- Body line length: 60–75ch maximum
- Pair on contrast axis only: serif + sans, geometric + humanist. Never two similar sans-serifs.
- `text-wrap: balance` on all headings (h1–h3)
- `text-wrap: pretty` on body paragraphs
- Display type ceiling: 6rem (96px). Above that is shouting.
- Letter-spacing floor on display: -0.04em minimum

### Color
- Use OKLCH for all color definitions
- Verify contrast: body text ≥4.5:1, large text ≥3:1
- Never use gray text on a colored background — use a dark shade of the background hue
- **The warm-neutral band (OKLCH L 0.84-0.97, C < 0.06, hue 40-100) = cream/sand/beige = AI default. Avoid.**
- Tint neutrals toward the brand hue (0.005–0.015 chroma), not toward "warmth by default"

### Layout
- Flexbox for 1D flow. Grid for 2D layout.
- Responsive grids: `repeat(auto-fit, minmax(280px, 1fr))`
- Vary spacing for rhythm — don't use the same spacing unit everywhere
- Semantic z-index scale (never `z-index: 9999`)

### Motion
- Motion is intentional, not decorative by default
- Ease-out curves for enters: `cubic-bezier(0.23, 1, 0.32, 1)`
- Never `ease-in` for UI animations (starts slow, feels broken)
- `@media (prefers-reduced-motion: reduce)` on every animation
- GSAP for scroll-driven, complex, or performance-critical motion
- Framer Motion / Motion for React component transitions
- Duration: UI interactions < 300ms. Marketing animations can be longer.

## Absolute Bans — Never Write These

If you're about to write any of the following, stop and redesign the element:

1. **`border-left` or `border-right` > 1px as decorative accent** on cards/callouts — rewrite with full border, background tint, or leading icon
2. **`background-clip: text` with gradient** — gradient text. Use solid color; emphasize via weight/size
3. **Glassmorphism as default** — blurs and glass cards decoratively. Only purposeful and rare.
4. **Hero-metric template** — big number, small label, gradient accent. SaaS cliché.
5. **Identical card grid** — icon + heading + text, repeated. Break the pattern.
6. **Uppercase tracked eyebrow above every section** — one named kicker as brand system is voice; on every section is AI grammar
7. **01 / 02 / 03 section numbering as default scaffolding** — only when order actually matters
8. **Inter as the only font** — if you reach for Inter first without thinking, stop. Pick intentionally.
9. **Purple-to-blue gradient as primary brand expression**
10. **Rounded-square icon tile above every section heading**
11. **Em dashes (—) in UI copy** — use commas, colons, or restructure the sentence

## The AI Slop Test

Before shipping, ask: "Could someone tell AI made this in 3 seconds?"

Signals that fail:
- Palette predictable from domain alone (fintech = navy, wellness = sage, startup = purple gradient)
- Every section uses the same layout pattern
- Eyebrow + heading + body + CTA on every section
- Cards for everything
- The same font pairing as every other project in the category
- Motion that's either everywhere or nowhere

## Anti-Slop Checklist (run before finishing)

- [ ] Palette: not predictable from domain alone
- [ ] Body bg: not cream/sand/warm-beige unless the brief explicitly calls for it
- [ ] Typography: contrast pair, not two similar sans-serifs
- [ ] Layout: at least one section that breaks the card-grid default
- [ ] Motion: intentional, not sprinkled
- [ ] Every animation has `prefers-reduced-motion` alternative
- [ ] No gradient text
- [ ] No side-stripe decorative borders
- [ ] No eyebrow on every section
- [ ] Contrast verified (4.5:1 body, 3:1 large text)
- [ ] Responsive: tested at mobile, tablet, desktop

## GSAP Scroll Skeleton (for MOTION_INTENSITY ≥ 7)

```js
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Staggered reveal
gsap.from(".reveal", {
  y: 40,
  opacity: 0,
  duration: 0.8,
  stagger: 0.1,
  ease: "power3.out",
  scrollTrigger: {
    trigger: ".section",
    start: "top 80%",
  },
});
```

## Pre-Flight Matrix

Before handing off, verify:

| Check | Pass condition |
|-------|---------------|
| Contrast | All text ≥ 4.5:1 (body), ≥ 3:1 (large) |
| Responsive | Works at 375px, 768px, 1280px, 1440px |
| Motion safe | `prefers-reduced-motion` handled |
| Slop test | Can't be identified as AI-generated in 3s |
| Overflow | No text overflows its container |
| Fonts | Loading strategy defined (font-display: swap) |
| Empty states | Designed, not blank |
| Error states | Designed, not generic |

Source: github.com/Leonxlnx/taste-skill · License: MIT
