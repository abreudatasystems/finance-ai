'use client';

/**
 * Recorrências — o que se repete todos os meses.
 *
 * The transactions carried an `is_recurring` flag that nothing acted on, so
 * the rent got retyped every month. Here the rule is the record: what to book
 * and how often. Generating is idempotent per period, so the button can be
 * pressed as often as you like — and the panel says so, because a button that
 * might double the rent is a button nobody presses.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Repeat, Plus, Play, Loader2, Pause, Trash2, CalendarClock, Check, X,
  ArrowDownLeft, ArrowUpRight, AlertCircle, SkipForward,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Category } from '@/types';
import { fetchCategories } from '@/services/data';
import { Recurrence, UpcomingOccurrence } from './types';
import {
  fetchRecurrences, fetchUpcoming, createRecurrence, updateRecurrence,
  deleteRecurrence, runGeneration, skipPeriod, RecurrenceInput,
} from './api';

const FREQUENCIES = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'weekly', label: 'Semanal' },
];

const today = () => new Date().toISOString().slice(0, 10);

export const RecurrencesPanel: React.FC = () => {
  const { formatMoney } = useApp();

  const [rows, setRows] = useState<Recurrence[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingOccurrence[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<RecurrenceInput>({
    name: '', type: 'expense', description: '', amount: 0,
    frequency: 'monthly', start_date: today(),
  });
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState('23');
  const [dayOfMonth, setDayOfMonth] = useState('1');

  const reload = useCallback(async () => {
    setLoading(true);
    const [r, u] = await Promise.all([fetchRecurrences(), fetchUpcoming(90)]);
    setRows(r);
    setUpcoming(u);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    fetchCategories().then((tree) => {
      const flat: Category[] = [];
      const walk = (nodes: Category[], prefix = '') => nodes.forEach((n) => {
        flat.push({ ...n, name: prefix ? `${prefix} › ${n.name}` : n.name });
        if (n.children?.length) walk(n.children, prefix ? `${prefix} › ${n.name}` : n.name);
      });
      walk(tree);
      setCategories(flat);
    });
  }, [reload]);

  const run = async () => {
    setBusy(true);
    setError(null);
    const res = await runGeneration();
    setBusy(false);
    if (res.error || !res.data) { setError(res.error || 'Não foi possível gerar.'); return; }
    setNotice(res.data.message);
    await reload();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const category = categories.find((c) => c.id === form.category_id);
    setBusy(true);
    setError(null);
    const res = await createRecurrence({
      ...form,
      amount: parseFloat(amount.replace(',', '.')) || 0,
      vat_rate: parseFloat(vatRate.replace(',', '.')) || undefined,
      day_of_month: form.frequency === 'weekly' ? undefined : parseInt(dayOfMonth, 10) || undefined,
      category_name: category?.name,
    });
    setBusy(false);
    if (res.error) { setError(res.error); return; }
    setOpen(false);
    setForm({ name: '', type: 'expense', description: '', amount: 0, frequency: 'monthly', start_date: today() });
    setAmount('');
    setNotice('Recorrência criada. Use "Gerar em falta" para lançar os períodos já vencidos.');
    await reload();
  };

  const toggle = async (rec: Recurrence) => {
    setError(null);
    const res = await updateRecurrence(rec.id, { active: !rec.active });
    if (res.error) { setError(res.error); return; }
    await reload();
  };

  const drop = async (rec: Recurrence) => {
    if (!window.confirm(`Eliminar "${rec.name}"? Se já gerou lançamentos, é apenas desativada e o histórico mantém-se.`)) return;
    setError(null);
    const res = await deleteRecurrence(rec.id);
    if (res.error) { setError(res.error); return; }
    setNotice(res.data?.message || 'Recorrência eliminada.');
    await reload();
  };

  const skip = async (item: UpcomingOccurrence) => {
    if (!window.confirm(`Saltar ${item.period} de "${item.name}"? Fica registado que este período não é para lançar.`)) return;
    setError(null);
    const res = await skipPeriod(item.recurrence_id, item.period);
    if (res.error) { setError(res.error); return; }
    await reload();
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Recorrências</h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {rows.filter((r) => r.active).length} ativa(s) · {upcoming.length} por lançar em 90 dias
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={run} disabled={busy}
              title="Lança os períodos já vencidos que ainda não foram lançados. Pode carregar as vezes que quiser."
              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-[11px] hover:bg-slate-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Gerar em falta
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5"
            >
              {open ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {open ? 'Fechar' : 'Nova recorrência'}
            </button>
          </div>
        </div>

        <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50/60 border border-indigo-100 text-indigo-900 text-[11px]">
          <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Cada período é lançado <b>uma única vez</b>: carregar em &ldquo;Gerar em falta&rdquo; duas vezes não
          duplica a renda. O lançamento nasce como <b>obrigação por pagar</b>, com data de vencimento.
        </p>

        {notice && <p className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-[11px]">{notice}</p>}
        {error && (
          <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px] flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
          </p>
        )}

        {/* ------------------------------------------------------------ form */}
        {open && (
          <form onSubmit={submit} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Nome *</span>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                       placeholder="Renda do escritório"
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Descrição do lançamento *</span>
                <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                       placeholder="Renda mensal — Rua X"
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Natureza</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'expense' | 'income' })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100">
                  <option value="expense">Despesa</option>
                  <option value="income">Receita</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Categoria</span>
                <select value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100">
                  <option value="">— Por classificar —</option>
                  {categories.filter((c) => c.type === form.type).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Valor (com IVA) *</span>
                <input required value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                       placeholder="615,00"
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Taxa de IVA (%)</span>
                <input value={vatRate} onChange={(e) => setVatRate(e.target.value)} inputMode="decimal"
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Frequência</span>
                <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100">
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              {form.frequency !== 'weekly' && (
                <label className="space-y-1.5">
                  <span className="font-bold text-slate-700">Dia do mês</span>
                  <input value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} inputMode="numeric"
                         className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
                  <span className="text-[10px] text-slate-400">Dia 31 num mês curto cai no último dia.</span>
                </label>
              )}
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Início *</span>
                <input type="date" required value={form.start_date}
                       onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Fim (opcional)</span>
                <input type="date" value={form.end_date || ''}
                       onChange={(e) => setForm({ ...form, end_date: e.target.value || undefined })}
                       className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100" />
              </label>
            </div>
            <button type="submit" disabled={busy}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Criar recorrência
            </button>
          </form>
        )}

        {/* ------------------------------------------------------------ list */}
        {loading ? (
          <p className="py-8 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> A carregar…
          </p>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <Repeat className="w-7 h-7 text-slate-300 mx-auto" />
            <p className="text-slate-600 font-semibold">Ainda não há nada a repetir.</p>
            <p className="text-[11px] text-slate-400">Renda, salários, avenças e subscrições entram aqui uma vez e lançam-se sozinhos.</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {rows.map((rec) => (
              <div key={rec.id} className={`px-3 py-2.5 flex items-center gap-3 ${rec.active ? '' : 'opacity-60'}`}>
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  rec.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {rec.type === 'income' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 truncate">{rec.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                      {rec.frequency_label}
                    </span>
                    {!rec.active && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                        Em pausa
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {rec.category_name || 'Por classificar'}
                    {rec.proximo_vencimento ? ` · próximo ${rec.proximo_vencimento}` : ' · terminada'}
                    {rec.occurrences_created > 0 && ` · ${rec.occurrences_created} lançado(s)`}
                  </p>
                </div>

                <span className="font-bold font-mono text-slate-900 shrink-0">{formatMoney(rec.amount)}</span>

                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggle(rec)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                          title={rec.active ? 'Pausar' : 'Retomar'}>
                    {rec.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => drop(rec)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- upcoming */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm text-slate-900">Por lançar nos próximos 90 dias</h3>
          </div>
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden max-h-72 overflow-y-auto">
            {upcoming.map((item) => (
              <div key={`${item.recurrence_id}-${item.period}`} className="px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.period} · vence {item.due_date}{item.category_name ? ` · ${item.category_name}` : ''}
                  </p>
                </div>
                <span className={`font-bold font-mono shrink-0 ${item.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {item.type === 'income' ? '+' : '−'}{formatMoney(item.amount)}
                </span>
                <button onClick={() => skip(item)} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50"
                        title="Saltar este período">
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
