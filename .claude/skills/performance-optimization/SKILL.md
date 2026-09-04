---
name: performance-optimization
description: Measure-first approach — Core Web Vitals targets, profiling workflows, bundle analysis, anti-pattern detection. Use when performance requirements exist or you suspect regressions.
---

# Performance Optimization

Measure first. Optimize second. Never guess.

## Rule
**No optimization without a measurement that proves the problem exists.**

Premature optimization wastes time and creates complexity. Measure, find the bottleneck, fix the bottleneck.

## Core Web Vitals Targets

| Metric | Good | Needs work | Poor |
|--------|------|-----------|------|
| LCP (Largest Contentful Paint) | ≤2.5s | 2.5-4s | >4s |
| INP (Interaction to Next Paint) | ≤200ms | 200-500ms | >500ms |
| CLS (Cumulative Layout Shift) | ≤0.1 | 0.1-0.25 | >0.25 |

## Profiling Workflow

### Step 1 — Establish baseline
```bash
# Lighthouse CLI
npx lighthouse https://yoursite.com --output=json --output-path=baseline.json

# Or use Chrome DevTools → Lighthouse tab
```

### Step 2 — Profile the bottleneck
For LCP issues: Network tab → identify large resources
For INP issues: Performance tab → record interaction → find long tasks
For CLS issues: Layout Instability API / Chrome DevTools CLS debug

### Step 3 — Fix the specific bottleneck
### Step 4 — Measure again (confirm improvement)

## Common Fixes by Metric

### LCP (slow to render)
- Preload the LCP image: `<link rel="preload" as="image" href="...">`
- Reduce TTFB (server response time)
- Eliminate render-blocking resources
- Use a CDN for static assets

### INP (slow interactions)
- Break long tasks into smaller chunks
- Use `requestIdleCallback` for non-urgent work
- Debounce expensive event handlers
- Avoid layout thrashing (read, then write — never interleave)

### CLS (layout shifts)
- Set explicit width/height on images and videos
- Reserve space for dynamic content (ads, embeds)
- Don't insert content above existing content

## Bundle Analysis

```bash
# Webpack Bundle Analyzer
npx webpack-bundle-analyzer stats.json

# Vite Bundle Visualizer
npx vite-bundle-visualizer
```

Look for:
- Duplicate libraries (lodash and lodash-es both present)
- Large dependencies with small usage (moment.js for one function)
- Unoptimized images in the bundle

## N+1 Query Pattern (Backend)

```
# N+1: 1 query for list + N queries for each item
users = User.all
users.each { |u| u.posts.count }  # N additional queries

# Fixed: eager loading
users = User.includes(:posts).all
```

## Anti-Patterns That Kill Performance

- Synchronous operations in render/response path
- Fetching more data than needed
- Re-rendering entire lists on single item change
- Missing database indexes on frequently queried columns
- Synchronous file I/O in Node.js request handlers

Source: github.com/addyosmani/agent-skills · MIT
