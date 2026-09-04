---
name: test-driven-development
description: Red-Green-Refactor, test pyramid (80/15/5), DAMP over DRY, Beyonce Rule. Use when implementing logic, fixing bugs, or changing behavior. Tests are proof, not commentary.
---

# Test-Driven Development

Tests are proof that code does what you claim. Write them first.

## The Beyonce Rule
> "If you liked it, you should have put a test on it."

If behavior matters, it has a test. No exceptions.

## Red-Green-Refactor

```
RED:    Write a failing test for the behavior you want
GREEN:  Write the minimum code to make it pass
REFACTOR: Clean up without breaking tests
```

Never skip RED. A test that was never failing doesn't prove anything.

## Test Pyramid

| Layer | Share | Speed | Cost |
|-------|-------|-------|------|
| Unit | 80% | Fast (<1s each) | Low |
| Integration | 15% | Medium | Medium |
| E2E | 5% | Slow | High |

Invert this pyramid and you have a slow, brittle test suite.

## Test Sizes (Google standard)

- **Small (unit):** No I/O, no filesystem, no network. Pure logic.
- **Medium (integration):** May use local DB, local filesystem. No external network.
- **Large (E2E):** Full stack, real network. Run less frequently.

## DAMP over DRY
Tests should be **D**escriptive **A**nd **M**eaningful **P**hrases, not maximally DRY.

```javascript
// Too DRY — hard to understand
test('validates correctly', () => {
  runValidation(testData);
  expect(result).toBe(true);
});

// DAMP — clear what's being tested
test('email validation rejects addresses without @ symbol', () => {
  const result = validateEmail('notanemail.com');
  expect(result.isValid).toBe(false);
  expect(result.error).toBe('Email must contain @ symbol');
});
```

## Test Anatomy

```javascript
describe('[Unit under test]', () => {
  describe('[Scenario / state]', () => {
    it('[Expected behavior]', () => {
      // Arrange
      const input = ...;
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

## Coverage Rules
- New code: ≥80% line coverage
- Critical paths (auth, payments, data mutations): ≥95%
- Never lower coverage thresholds to make CI green

## Anti-Rationalizations

| Excuse | Counter |
|--------|---------|
| "I'll add tests later" | Later never comes. Red-green-refactor or don't write the code. |
| "This is too simple to test" | Simple code has simple tests. Takes 2 minutes. |
| "The tests are slow" | Slow tests signal integration tests masquerading as unit tests. |
| "We'll write tests after the feature is done" | Code written without tests is harder to test. Write them first. |

Source: github.com/addyosmani/agent-skills · MIT
