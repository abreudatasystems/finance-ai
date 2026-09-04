---
name: browser-testing-with-devtools
description: Chrome DevTools MCP for live runtime data — DOM inspection, console logs, network traces, performance profiling. Use when building or debugging anything that runs in a browser.
---

# Browser Testing with DevTools

Real runtime data beats assumptions. Use the browser to prove behavior.

## When To Use
- Building UI components
- Debugging visual or interaction issues
- Verifying network requests
- Profiling performance
- Checking accessibility in-browser

## DevTools Workflow

### 1. Console — First stop for errors
```javascript
// Check for errors before anything else
// Filter: Errors only, then All
// Look for: Uncaught exceptions, network errors, deprecation warnings
```

### 2. Network — Verify API calls
Check every request:
- Status code (200, 4xx, 5xx)
- Request payload (correct structure?)
- Response body (expected data?)
- Timing (any slow requests?)
- Headers (CORS, auth, content-type)

### 3. Elements — Inspect DOM state
- Computed styles (what's actually applied, not what you wrote)
- Box model (margins, padding, border)
- Event listeners on elements
- Accessibility tree (what screen readers see)

### 4. Performance — Profile before optimizing
```
Performance tab → Record → Reproduce the behavior → Stop
Look for:
- Long tasks (>50ms blocks main thread)
- Layout thrashing (forced reflows)
- Paint events
- Memory leaks (heap snapshots)
```

### 5. Application — Check storage/state
- LocalStorage / SessionStorage / Cookies
- IndexedDB
- Cache Storage
- Service Workers

## Accessibility Audit
```
Lighthouse → Accessibility audit (score ≥90)
Elements tab → Accessibility tree (verify roles and labels)
Tab through the page (verify keyboard navigation)
```

## Common Issues Checklist

| Issue | Where to look |
|-------|--------------|
| JS errors | Console → Errors |
| Network failures | Network → Status/Response |
| Layout issues | Elements → Computed → Box model |
| Performance | Performance → Long tasks |
| Memory leak | Memory → Heap snapshot comparison |
| Accessibility | Lighthouse → Accessibility |
| CORS errors | Console + Network → Response headers |

## Runtime Verification
Before marking any UI task done:
- [ ] No console errors
- [ ] All network requests succeed
- [ ] Visual matches design at 375px, 768px, 1280px
- [ ] Keyboard navigable
- [ ] No layout shift on load or interaction

Source: github.com/addyosmani/agent-skills · MIT
