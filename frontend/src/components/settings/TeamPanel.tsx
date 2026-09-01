'use client';

/**
 * Equipa — who works inside the active company, and what they may do.
 *
 * Three things live here:
 *  • **Convidar** — an email plus a role produces a link the inviter sends.
 *  • **Membros** — the roles, changeable, with the guard that a company can
 *    never be left without a proprietário (the backend refuses; we show why).
 *  • **Atividade** — what each person has been moving, which is the point of
 *    "administrar o que elas movimentam".
 *
 * Only proprietário and administrador see the management controls; everyone
 * else sees the team read-only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, UserPlus, Shield, Eye, Trash2, Copy, Check, Loader2, Link2, X,
  Activity, ArrowUpRight, ArrowDownRight, Mail, Clock,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Invitation, MemberActivity, TeamMember, UserRole } from '@/types';
import {
  fetchTeamMembers, fetchInvitations, createInvitation, revokeInvitation,
  updateMemberRole, removeMember, fetchMemberActivity,
} from '@/services/data';
import { API_BASE } from '@/services/api';

/** What each role may do, in the words the user sees. */
const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'owner', label: 'Proprietário', hint: 'Controlo total, incluindo a propriedade da empresa.' },
  { value: 'admin', label: 'Administrador', hint: 'Gere a equipa, as definições e todo o financeiro.' },
  { value: 'finance_manager', label: 'Gestor financeiro', hint: 'Lança, aprova e liquida. Não gere a equipa.' },
  { value: 'viewer', label: 'Consulta', hint: 'Vê tudo, não altera nada.' },
];

const INVITABLE = ROLES.filter((r) => r.value !== 'owner');

const roleStyle = (role: UserRole) =>
  role === 'owner' ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
    : role === 'admin' ? 'bg-violet-50 text-violet-700 border-violet-200'
    : role === 'finance_manager' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-slate-100 text-slate-600 border-slate-200';

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** The link the inviter sends. Built from the app's own origin, not the API's. */
const inviteLink = (token?: string) => {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/invite/${token}`;
};

export const TeamPanel: React.FC = () => {
  const { currentCompany, userRole, formatMoney } = useApp();
  const companyId = currentCompany?.id;
  const canManage = userRole === 'owner' || userRole === 'admin';

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('finance_manager');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [activityFor, setActivityFor] = useState<string | null>(null);
  const [activity, setActivity] = useState<MemberActivity | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const [m, i] = await Promise.all([
      fetchTeamMembers(companyId),
      canManage ? fetchInvitations(companyId) : Promise.resolve([] as Invitation[]),
    ]);
    setMembers(m);
    setInvites(i.filter((x) => x.status === 'pending'));
    setLoading(false);
  }, [companyId, canManage]);

  useEffect(() => { reload(); }, [reload]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSending(true);
    setError(null);
    const res = await createInvitation(companyId, { email: email.trim(), role, message: message.trim() || undefined });
    setSending(false);
    if (res.error) { setError(res.error); return; }
    setEmail(''); setMessage(''); setInviteOpen(false);
    await reload();
    if (res.data?.token) copy(res.data.token);
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setError('Não foi possível copiar. Selecione o link manualmente.');
    }
  };

  const changeRole = async (userId: string, next: UserRole) => {
    if (!companyId) return;
    setError(null);
    const res = await updateMemberRole(companyId, userId, next);
    if (res.error) { setError(res.error); return; }
    await reload();
  };

  const drop = async (member: TeamMember) => {
    if (!companyId) return;
    const self = member.is_you;
    if (!window.confirm(self
      ? 'Sair desta empresa? Perde o acesso aos dados dela.'
      : `Remover ${member.name} da equipa? Deixa de ter acesso a esta empresa.`)) return;
    setError(null);
    const res = await removeMember(companyId, member.user_id);
    if (res.error) { setError(res.error); return; }
    if (self && typeof window !== 'undefined') { window.location.href = '/dashboard'; return; }
    await reload();
  };

  const openActivity = async (userId: string) => {
    if (!companyId) return;
    if (activityFor === userId) { setActivityFor(null); setActivity(null); return; }
    setActivityFor(userId);
    setActivity(null);
    setActivity(await fetchMemberActivity(companyId, userId));
  };

  const revoke = async (id: string) => {
    setError(null);
    const res = await revokeInvitation(id);
    if (res.error) { setError(res.error); return; }
    await reload();
  };

  return (
    <div className="space-y-5 text-xs">
      {/* ------------------------------------------------------------ header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-900">Equipa de {currentCompany?.name || 'a empresa'}</h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {members.length} membro(s){invites.length ? ` · ${invites.length} convite(s) por aceitar` : ''}
            </span>
          </div>
          {canManage && (
            <button
              onClick={() => setInviteOpen((v) => !v)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-xs"
            >
              {inviteOpen ? <X className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
              {inviteOpen ? 'Fechar' : 'Convidar pessoa'}
            </button>
          )}
        </div>

        <div className="flex items-start gap-2.5 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-[11px] text-indigo-900">
          <Shield className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
          <span>
            Cada pessoa vê <b>apenas esta empresa</b> — as suas outras empresas continuam separadas.
            Quem entra por convite trabalha aqui mas <b>não pode abrir empresas próprias</b>.
          </span>
        </div>

        {error && (
          <p className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-[11px]">{error}</p>
        )}

        {/* ------------------------------------------------------ invite form */}
        {inviteOpen && canManage && (
          <form onSubmit={send} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700 flex items-center gap-1.5"><Mail className="w-3 h-3" /> Email</span>
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="pessoa@empresa.pt"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="font-bold text-slate-700">Papel</span>
                <select
                  value={role} onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                >
                  {INVITABLE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[10px] text-slate-500">{INVITABLE.find((r) => r.value === role)?.hint}</p>
            <input
              value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensagem (opcional)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit" disabled={sending}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] flex items-center gap-1.5 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                Gerar convite
              </button>
              <span className="text-[10px] text-slate-500">
                O link é copiado para a área de transferência — envie-o à pessoa.
              </span>
            </div>
          </form>
        )}

        {/* --------------------------------------------------- pending invites */}
        {canManage && invites.length > 0 && (
          <div className="border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 font-bold text-amber-900 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Convites por aceitar
            </div>
            <div className="divide-y divide-amber-100">
              {invites.map((inv) => (
                <div key={inv.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 justify-between">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800">{inv.email}</span>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${roleStyle(inv.role)}`}>
                      {inv.role_label}
                    </span>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Expira a {fmtDate(inv.expires_at)}{inv.invited_by_name ? ` · convidado por ${inv.invited_by_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => inv.token && copy(inv.token)}
                      className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold text-[10px] flex items-center gap-1 hover:bg-slate-50"
                    >
                      {copied === inv.token ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      {copied === inv.token ? 'Copiado' : 'Copiar link'}
                    </button>
                    <button
                      onClick={() => revoke(inv.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Cancelar convite"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------ members */}
        {loading ? (
          <p className="py-6 text-center text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> A carregar a equipa…
          </p>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">Membros</div>
            <div className="divide-y divide-slate-100">
              {members.map((m) => (
                <div key={m.user_id}>
                  <div className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800">{m.name}</span>
                        {m.is_you && <span className="text-[9px] font-bold uppercase bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">Você</span>}
                        {m.account_type === 'invited' && (
                          <span className="text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                            Convidado
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {m.email} · entrou a {fmtDate(m.joined_at)} · {m.movimentos} movimento(s)
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openActivity(m.user_id)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1 hover:bg-slate-50"
                      >
                        <Activity className="w-3 h-3" /> {activityFor === m.user_id ? 'Fechar' : 'Atividade'}
                      </button>

                      {canManage ? (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m.user_id, e.target.value as UserRole)}
                          className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold ${roleStyle(m.role)}`}
                        >
                          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span className={`px-2 py-1 rounded-lg border text-[10px] font-bold ${roleStyle(m.role)}`}>
                          {m.role_label}
                        </span>
                      )}

                      {(canManage || m.is_you) && (
                        <button
                          onClick={() => drop(m)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title={m.is_you ? 'Sair da empresa' : 'Remover da equipa'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* --------------------------------------------- activity */}
                  {activityFor === m.user_id && (
                    <div className="px-4 pb-4 bg-slate-50/60 border-t border-slate-100">
                      {!activity ? (
                        <p className="py-4 text-slate-400 flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> A carregar…
                        </p>
                      ) : (
                        <div className="pt-3 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                              <p className="text-[9px] uppercase font-bold text-slate-400">Lançamentos</p>
                              <p className="font-bold text-slate-900 text-sm">{activity.lancamentos}</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                              <p className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3 text-emerald-600" /> Entradas
                              </p>
                              <p className="font-bold text-emerald-700 text-sm">{formatMoney(activity.total_entradas)}</p>
                            </div>
                            <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                              <p className="text-[9px] uppercase font-bold text-slate-400 flex items-center gap-1">
                                <ArrowDownRight className="w-3 h-3 text-rose-600" /> Saídas
                              </p>
                              <p className="font-bold text-rose-700 text-sm">{formatMoney(activity.total_saidas)}</p>
                            </div>
                          </div>

                          {activity.movimentos.length === 0 ? (
                            <p className="text-slate-400 text-[11px]">Ainda não lançou nada nesta empresa.</p>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                              {activity.movimentos.map((t) => (
                                <div key={t.id} className="px-3 py-2 flex items-center justify-between border-b border-slate-100 last:border-0">
                                  <span className="truncate text-slate-700">{t.date} · {t.description}</span>
                                  <span className={`font-bold font-mono ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {activity.acoes.length > 0 && (
                            <div>
                              <p className="text-[9px] uppercase font-bold text-slate-400 mb-1">Últimas ações</p>
                              <ul className="space-y-1">
                                {activity.acoes.slice(0, 6).map((a, idx) => (
                                  <li key={idx} className="text-[10px] text-slate-600">
                                    <span className="font-mono text-slate-400">{a.timestamp.slice(0, 16).replace('T', ' ')}</span>
                                    {' · '}{a.description}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!canManage && (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Só o proprietário ou um administrador pode convidar pessoas e alterar papéis.
          </p>
        )}
      </div>

      <p className="text-[10px] text-slate-400 text-center">
        Convites e papéis são verificados no servidor ({API_BASE}) — o que se altera aqui não contorna essa validação.
      </p>
    </div>
  );
};
