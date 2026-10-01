---
name: observability-and-instrumentation
description: Structured logging, RED metrics, OpenTelemetry tracing, symptom-based alerting — instrument as you build. Use when adding telemetry or shipping anything that runs in production.
---

# Observability and Instrumentation

If you can't measure it, you can't operate it. Instrument as you build, not after.

## Three Pillars

| Pillar | What it tells you | Tool examples |
|--------|-----------------|--------------|
| **Logs** | What happened | Winston, Pino, CloudWatch |
| **Metrics** | How often / how much | Prometheus, Datadog, CloudWatch |
| **Traces** | How a request flowed | OpenTelemetry, Jaeger, X-Ray |

## RED Metrics (for every service)

| Metric | What to measure |
|--------|----------------|
| **R**ate | Requests per second |
| **E**rrors | Error rate (%) |
| **D**uration | Latency (p50, p95, p99) |

```javascript
// Every HTTP endpoint should emit these
const requestDuration = histogram.observe({ method, route, statusCode }, durationMs);
const requestErrors = counter.inc({ method, route, errorType });
```

## Structured Logging

Use JSON. Every log entry should be machine-parseable.

```javascript
// Bad — unstructured
console.log(`User ${userId} logged in from ${ip}`);

// Good — structured
logger.info('user.login', {
  userId,
  ip,
  userAgent,
  timestamp: new Date().toISOString(),
  requestId: req.id,
});
```

### Log Levels
- **ERROR**: Something failed, needs attention
- **WARN**: Unexpected but handled, worth investigating
- **INFO**: Normal operations, key events
- **DEBUG**: Detailed information for debugging (off in production)

### Never Log
- Passwords or secrets
- Full credit card numbers
- PII without explicit need and appropriate masking

## Symptom-Based Alerting

Alert on symptoms (what users experience), not causes (what's happening inside).

```
# Wrong: alert on CPU usage
ALERT cpu_usage > 80%

# Right: alert on user-visible symptoms
ALERT error_rate > 1% for 5 minutes
ALERT p95_latency > 2000ms for 5 minutes
ALERT availability < 99.9% over 1 hour
```

## Pre-Launch Observability Gate

Before shipping to production:
- [ ] Errors logged with context (requestId, userId)
- [ ] Key operations timed (API calls, DB queries)
- [ ] Alert on error rate spike
- [ ] Alert on latency spike
- [ ] Alert on availability drop
- [ ] Runbook exists for each alert
- [ ] On-call knows what the service does

## OpenTelemetry Tracing

```javascript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

async function processOrder(orderId: string) {
  const span = tracer.startSpan('processOrder');
  span.setAttribute('order.id', orderId);
  
  try {
    const result = await doWork();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}
```

Source: github.com/addyosmani/agent-skills · MIT
