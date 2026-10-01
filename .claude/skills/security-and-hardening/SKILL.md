---
name: security-and-hardening
description: OWASP Top 10 prevention, auth patterns, secrets management, dependency auditing, three-tier boundary system. Use when handling user input, auth, data storage, or external integrations.
---

# Security and Hardening

Security is not a feature. It's a property of the system. Build it in from the start.

## OWASP Top 10 — Quick Reference

| # | Vulnerability | Prevention |
|---|--------------|-----------|
| 1 | Broken Access Control | Check auth on every request, not just routes |
| 2 | Cryptographic Failures | TLS everywhere, bcrypt for passwords, no MD5/SHA1 |
| 3 | Injection | Parameterized queries, input validation at boundaries |
| 4 | Insecure Design | Threat model before building auth, payments, data flows |
| 5 | Security Misconfiguration | No default creds, no debug in prod, explicit CORS |
| 6 | Vulnerable Components | `npm audit`, update dependencies, pin versions |
| 7 | Identity/Auth Failures | Sessions invalidated on logout, short token expiry |
| 8 | Data Integrity Failures | Sign and verify data from untrusted sources |
| 9 | Logging Failures | Log auth events, never log secrets/PII |
| 10 | SSRF | Validate and allowlist URLs before fetching |

## The Three-Tier Boundary System

```
Internet → [Validation Tier] → [Business Logic Tier] → [Data Tier]
```

### Validation Tier (entry point)
- Validate all input: type, length, format, range
- Reject early, reject loudly
- Never trust: query params, headers, cookies, request bodies

### Business Logic Tier
- Auth checks here, not just at the route level
- Never construct SQL/HTML/shell commands from user input
- Log all security-relevant events

### Data Tier
- Parameterized queries only
- Principle of least privilege for DB credentials
- Encrypt sensitive fields at rest

## Secrets Management

**Never:**
- Hardcode secrets in source code
- Commit secrets to git (even in "private" repos)
- Log secrets or tokens
- Pass secrets as URL parameters

**Always:**
- Load from environment variables or secrets manager
- Rotate on suspected compromise
- Different secrets per environment

```bash
# Wrong
const API_KEY = "sk-abc123";

# Right
const API_KEY = process.env.API_KEY;
if (!API_KEY) throw new Error("API_KEY environment variable is required");
```

## Auth Checklist
- [ ] Passwords hashed with bcrypt (cost ≥12) or Argon2
- [ ] Sessions invalidated on logout
- [ ] Token expiry ≤1 hour (refresh tokens for longer sessions)
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after N failed attempts
- [ ] No sensitive data in JWT payload (JWTs are readable)
- [ ] CSRF protection on state-changing requests

## Pre-Commit Security Check
- [ ] No hardcoded secrets or API keys
- [ ] All user input validated
- [ ] SQL queries parameterized
- [ ] Auth checked on new endpoints
- [ ] Dependencies audited (`npm audit --audit-level=high`)

Source: github.com/addyosmani/agent-skills · MIT
