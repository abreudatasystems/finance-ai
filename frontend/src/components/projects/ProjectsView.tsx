'use client';

/**
 * Rentabilidade por projeto.
 *
 * The question is "did I make money on this job?", so the margin is the column
 * the eye lands on and losses sort to the top: a report that buries the work
 * costing more than it brings at the bottom of the page is a report nobody
 * acts on.
 *
 * "Sem projeto" is drawn as its own row, visibly apart. Whatever is attributed
 * to nothing still belongs to the company, and a profitability report that
 * quietly drops it gives confident margins on a fraction of the business and
 * calls them the business's.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Loader2, FolderKanban, Plus, X, ChevronDown, AlertTriangle, Check, RefreshCw,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Profitability, ProfitRow, ProjectStatement } from './types';
import { createProject, fetchProfitability, fetchStatement } from './api';

const YEAR = new Date().getFullYear();

const yearOptions = () => [YEAR, YEAR - 1, YEAR - 2];

/** New project: the four fields that matter, not a form with fourteen. */
const NewProject: React.FC<{ onDone: () => void; onCancel: () => void }> = ({
  onDone, onCancel,
}) => {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [budget, setBudget] = useState('');
  const [contract, setContract] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) {
      setError('O projeto precisa de um nome.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: failure } = await createProject({
      name: name.trim(),
      entity_name: client.trim() || undefined,
      budget: budget ? Number(budget.replace(',', '.')) : undefined,
      contract_value: contract ? Number(contract.replace(',', '.')) : undefined,
    });
    setSaving(false);
    if (failure) setError(failure);
    else onDone();
  };

  return (
    <div className="bg-white rounded-2xl border border-indigo-200 shadow-xs p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-slate-900">Novo projeto</h3>
        <button onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100" aria-label="Cancelar">
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">Nome *</span>
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Website da Câmara"
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">Cliente</span>
          <input
            value={client} onChange={(e) => setClient(e.target.value)}
            placeholder="Câmara de Loulé"
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">
            Custo previsto <span className="normal-case font-semibold text-slate-400">sem IVA</span>
          </span>
          <input
            value={budget} onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal" placeholder="4000,00"
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500">
            Valor contratado <span className="normal-case font-semibold text-slate-400">sem IVA</span>
          </span>
          <input
            value={contract} onChange={(e) => setContract(e.target.value)}
            inputMode="decimal" placeholder="6150,00"
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

      <button
        onClick={save} disabled={saving}
        className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {saving ? 'A criar…' : 'Criar projeto'}
      </button>
    </div>
  );
};

/** The documents behind one project's margin. */
const Statement: React.FC<{ id: string; formatMoney: (n: number) => string }> = ({
  id, formatMoney,
}) => {
  const [data, setData] = useState<ProjectStatement | null>(null);

  useEffect(() => { fetchStatement(id).then(setData); }, [id]);

  if (!data) {
    return (
      <tr className="bg-slate-50/70">
        <td colSpan={7} className="px-4 py-3 text-slate-400 text-[11px]">A carregar…</td>
      </tr>
    );
  }

  return (
    <>
      {data.movimentos.map((m) => (
        <tr key={m.id} className="bg-slate-50/70 text-[11px]">
          <td className="px-4 py-1.5 pl-10 text-slate-500 font-mono text-[10px]">{m.data}</td>
          <td className="px-4 py-1.5 text-slate-600" colSpan={2}>
            {m.descricao}
            <span className="text-slate-400"> · {m.entidade}</span>
          </td>
          <td className={`px-4 py-1.5 text-right font-semibold ${
            m.tipo === 'income' ? 'text-emerald-700' : 'text-slate-600'
          }`}>
            {m.tipo === 'income' ? '+' : '−'}{formatMoney(m.valor)}
          </td>
          <td className="px-4 py-1.5 text-right text-slate-400" colSpan={3}>{m.categoria}</td>
        </tr>
      ))}
      {!data.movimentos.length && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-3 pl-10 text-slate-400 text-[11px]">
            Ainda não há documentos neste projeto.
          </td>
        </tr>
      )}
    </>
  );
};

export const ProjectsView: React.FC = () => {
  const { formatMoney } = useApp();
  const [year, setYear] = useState(YEAR);
  const [data, setData] = useState<Profitability | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setData(await fetchProfitability(`${year}-01-01`, `${year + 1}-01-01`));
    setLoading(false);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> A somar cada projeto…
      </div>
    );
  }
  if (!data) return null;

  const losing = data.projetos.some((p) => !p.sem_projeto && p.margem < 0);

  const marginCell = (row: ProfitRow) => (
    <span className={row.margem < 0 ? 'text-rose-700' : 'text-emerald-700'}>
      {row.margem > 0 ? '+' : ''}{formatMoney(row.margem)}
      {row.margem_pct !== null && (
        <span className="block text-[9px] font-semibold text-slate-400 normal-case">
          {row.margem_pct}% da receita
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-indigo-600" />
          <select
            value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
          >
            {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Plus className="w-3 h-3" /> Novo projeto
          </button>
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {creating && (
        <NewProject onDone={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />
      )}

      {/* The sentence first: which job is losing money. */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
        losing ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
      }`}>
        {losing ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          : <Check className="w-4 h-4 shrink-0 mt-0.5" />}
        <p className="font-semibold leading-relaxed">{data.mensagem}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white border border-emerald-100">
          <p className="text-[9px] uppercase font-bold text-emerald-600">Rendimentos</p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.totais.rendimentos)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-rose-100">
          <p className="text-[9px] uppercase font-bold text-rose-600">Gastos</p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">{formatMoney(data.totais.gastos)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200">
          <p className="text-[9px] uppercase font-bold text-slate-500">Margem</p>
          <p className={`font-bold text-sm mt-0.5 ${
            data.totais.margem < 0 ? 'text-rose-700' : 'text-slate-900'
          }`}>
            {formatMoney(data.totais.margem)}
            {data.totais.margem_pct !== null && (
              <span className="text-[10px] font-semibold text-slate-400"> · {data.totais.margem_pct}%</span>
            )}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-white border border-slate-200">
          <p className="text-[9px] uppercase font-bold text-slate-500">Sem projeto</p>
          <p className="font-bold text-slate-900 text-sm mt-0.5">
            {data.nao_atribuido.documentos} doc.
          </p>
          {data.nao_atribuido.peso_pct !== null && data.nao_atribuido.peso_pct > 0 && (
            <p className="text-[10px] font-bold text-amber-700 mt-0.5">
              {data.nao_atribuido.peso_pct}% do movimento
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-500 font-bold">
              <tr>
                <th className="px-4 py-2.5">Projeto</th>
                <th className="px-4 py-2.5">Cliente</th>
                <th className="px-4 py-2.5 text-right">Rendimentos</th>
                <th className="px-4 py-2.5 text-right">Gastos</th>
                <th className="px-4 py-2.5 text-right">Margem</th>
                <th className="px-4 py-2.5 text-right">Custo previsto</th>
                <th className="px-4 py-2.5 text-right">Doc.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.projetos.map((row) => {
                const key = row.id || row.projeto;
                const expanded = open === key;
                return (
                  <React.Fragment key={key}>
                    <tr className={row.sem_projeto ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-2.5">
                        {row.id ? (
                          <button
                            onClick={() => setOpen(expanded ? null : key)}
                            className="flex items-center gap-1.5 font-semibold text-slate-800"
                          >
                            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            {row.projeto}
                            {row.codigo && (
                              <span className="text-[9px] text-slate-400 font-mono">{row.codigo}</span>
                            )}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700">{row.projeto}</span>
                            {row.por_criar && (
                              <span
                                className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[9px] font-bold uppercase"
                                title="Escrito nos documentos mas nunca criado como projeto"
                              >
                                Por criar
                              </span>
                            )}
                          </div>
                        )}
                        {row.estado === 'closed' && (
                          <span className="text-[9px] text-slate-400">fechado</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.cliente || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatMoney(row.rendimentos)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{formatMoney(row.gastos)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">{marginCell(row)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {row.orcamento !== null ? (
                          <>
                            <span className="text-slate-600">{formatMoney(row.orcamento)}</span>
                            {row.orcamento_usado_pct !== null && (
                              <span className={`block text-[9px] font-bold ${
                                row.acima_do_orcamento ? 'text-rose-700' : 'text-slate-400'
                              }`}>
                                {row.orcamento_usado_pct}% usado
                              </span>
                            )}
                          </>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{row.documentos}</td>
                    </tr>

                    {expanded && row.id && <Statement id={row.id} formatMoney={formatMoney} />}
                  </React.Fragment>
                );
              })}

              {!data.projetos.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Ainda não há movimentos neste ano.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 px-1">{data.base}</p>
    </div>
  );
};
