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

export const ValidationChecklist: React.FC<{ checks: ValidationCheck[]; confidence?: number | null }> = ({
  checks, confidence,
}) => {
  if (!checks.length && confidence == null) return null;
  const pct = confidence != null ? Math.round(confidence <= 1 ? confidence * 100 : confidence) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Validações da extração
        </span>
        {pct != null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
            pct >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : pct >= 80 ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            {pct}% de confiança
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {checks.map((c, i) => (
          <li key={i} className="px-3 py-2 flex items-start gap-2 text-[11px]">
            {c.ok
              ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              : <X className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />}
            <span className={c.ok ? 'text-slate-700' : 'text-rose-700 font-semibold'}>
              {c.check}
              {c.detail && <span className="block text-slate-400 font-normal">{c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
