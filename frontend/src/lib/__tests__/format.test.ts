import { describe, it, expect } from 'vitest';
import { documentStatusLabel, formatDate } from '@/lib/format';

describe('formatDate', () => {
  it('formats an ISO date as dd/mm/yyyy', () => {
    expect(formatDate('2026-08-31')).toBe('31/08/2026');
  });

  it('ignores the time part of an ISO datetime (no timezone shift)', () => {
    expect(formatDate('2026-01-01T00:30:00Z')).toBe('01/01/2026');
    expect(formatDate('2025-12-31T23:59:59+05:00')).toBe('31/12/2025');
  });

  it.each([undefined, null, ''])('returns a dash for %j', (v) => {
    expect(formatDate(v)).toBe('—');
  });

  it('returns anything that is not an ISO date unchanged', () => {
    expect(formatDate('31/08/2026')).toBe('31/08/2026');
    expect(formatDate('amanhã')).toBe('amanhã');
    expect(formatDate('2026-8-31')).toBe('2026-8-31');
  });
});

describe('documentStatusLabel', () => {
  it.each([
    ['draft', 'Rascunho'],
    ['approved', 'Aprovado'],
    ['pending_approval', 'Por aprovar'],
    ['pending_ai', 'Em leitura'],
    ['paid', 'Pago'],
    ['received', 'Recebido'],
    ['cancelled', 'Anulado'],
  ])('%s -> %s', (status, label) => {
    expect(documentStatusLabel(status)).toBe(label);
  });

  it('shows an unknown status as is', () => {
    expect(documentStatusLabel('archived')).toBe('archived');
  });

  it.each([undefined, null, ''])('returns a dash for %j', (v) => {
    expect(documentStatusLabel(v)).toBe('—');
  });

  it('does not resolve inherited object keys', () => {
    expect(documentStatusLabel('toString')).toBe('toString');
    expect(documentStatusLabel('constructor')).toBe('constructor');
  });
});
