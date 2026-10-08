'use client';

/**
 * What the extraction engine checked, and what it could not confirm.
 *
 * A failed check is not a blocker — it is a reason to look at the document
 * before approving, which is exactly what this screen is for.
 */

import React from 'react';
import { Check, X, ShieldCheck } from 'lucide-react';
import { ValidationCheck } from './types';
import { Badge, Card } from '@/components/ui';

export const ValidationChecklist: React.FC<{ checks: ValidationCheck[]; confidence?: number | null }> = ({
  checks, confidence,
}) => {
  if (!checks.length && confidence == null) return null;
  const pct = confidence != null ? Math.round(confidence <= 1 ? confidence * 100 : confidence) : null;

  return (
    <Card className="overflow-hidden rounded-xl">
      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
        <span className="font-bold text-neutral-700 flex items-center gap-1.5 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" aria-hidden="true" /> Validações da extração
        </span>
        {pct != null && (
          <Badge tone={pct >= 90 ? 'success' : pct >= 80 ? 'warning' : 'danger'}>
            {pct}% de confiança
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-neutral-100">
        {checks.map((c, i) => (
          <li key={i} className="px-3 py-2 flex items-start gap-2 text-xs">
            {c.ok
              ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" aria-label="Confirmado" />
              : <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" aria-label="Não confirmado" />}
            <span className={c.ok ? 'text-neutral-700' : 'text-rose-700 font-semibold'}>
              {c.check}
              {c.detail && <span className="block text-neutral-500 font-normal text-2xs">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
};
