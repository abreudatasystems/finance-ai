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

import React, { useState } from 'react';
import {
  Users, UserPlus, Shield, Eye, Trash2, Copy, Check, Link2, X,
  Activity, ArrowUpRight, ArrowDownRight, Clock, Send, MailWarning,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useLoad } from '@/lib/use-load';
import { Invitation, MemberActivity, TeamMember, UserRole } from '@/types';
import {
  fetchTeamMembers, fetchInvitations, createInvitation, revokeInvitation,
  resendInvitation, updateMemberRole, removeMember, fetchMemberActivity,
} from '@/services/data';
import { API_BASE } from '@/services/api';
import { formatDate } from '@/lib/format';
import {
  Button, IconButton, Card, CardHeader, CardBody, Field, Input, Select, Badge, LoadingState, EmptyState, useConfirm,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

/** What each role may do, in the words the user sees. */
const ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: 'owner', label: 'Proprietário', hint: 'Controlo total, incluindo a propriedade da empresa.' },
  { value: 'admin', label: 'Administrador', hint: 'Gere a equipa, as definições e todo o financeiro.' },
  { value: 'finance_manager', label: 'Gestor financeiro', hint: 'Lança, aprova e liquida. Não gere a equipa.' },
  { value: 'viewer', label: 'Consulta', hint: 'Vê tudo, não altera nada.' },
];

const INVITABLE = ROLES.filter((r) => r.value !== 'owner');

const roleTone = (role: UserRole): BadgeTone =>
  role === 'owner' ? 'success'
    : role === 'admin' ? 'info'
    : 'neutral';

/** The link to send. The server builds it from the app's public address;
 *  falling back to this origin covers a deployment that has not set one. */
const inviteLink = (invitation: Pick<Invitation, 'token' | 'accept_url'>) => {
  if (invitation.accept_url) return invitation.accept_url;
  if (!invitation.token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/invite/${invitation.token}`;
};

const NO_MEMBERS: TeamMember[] = [];
const NO_INVITES: Invitation[] = [];

export const TeamPanel: React.FC = () => {
  const { currentCompany, userRole, formatMoney } = useApp();
  const confirm = useConfirm();
  const companyId = currentCompany?.id;
  const canManage = userRole === 'owner' || userRole === 'admin';

  // Sem empresa activa ainda não há o que pedir (fica a carregar).
  const { data, loading, reload } = useLoad(
    async () => {
      const [m, i] = await Promise.all([
        fetchTeamMembers(companyId!),
        canManage ? fetchInvitations(companyId!) : Promise.resolve([] as Invitation[]),
      ]);
      return { members: m, invites: i.filter((x) => x.status === 'pending') };
    },
    [companyId, canManage],
    { enabled: !!companyId },
  );
  const members: TeamMember[] = data?.members ?? NO_MEMBERS;
  const invites: Invitation[] = data?.invites ?? NO_INVITES;
  const [copied, setCopied] = useState<string | null>(null);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('finance_manager');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [activityFor, setActivityFor] = useState<string | null>(null);
  const [activity, setActivity] = useState<MemberActivity | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSending(true);
    const res = await createInvitation(companyId, { email: email.trim(), role, message: message.trim() || undefined });
    setSending(false);
    if (res.error) { toast.error(res.error); return; }
    setEmail(''); setMessage(''); setInviteOpen(false);
    await reload();

    // Say what actually happened. When no email went out the link is the
    // fallback, so it is copied straight away rather than left to be found.
    const mail = res.data?.email_result;
    if (mail?.enviado) {
      setNotice(`Convite enviado por email para ${res.data?.email}.`);
    } else {
      setNotice(mail?.detalhe || 'Convite criado. Envie o link à pessoa.');
      if (res.data) copy(res.data);
    }
  };

  const copy = async (invitation: Invitation) => {
    try {
      await navigator.clipboard.writeText(inviteLink(invitation));
      setCopied(invitation.token || null);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      toast.error('Não foi possível copiar. Selecione o link manualmente.');
    }
  };

  const resend = async (invitation: Invitation) => {
    setBusyInvite(invitation.id);
    setNotice(null);
    const res = await resendInvitation(invitation.id);
    setBusyInvite(null);
    if (res.error) { toast.error(res.error); return; }
    const mail = res.data?.email_result;
    setNotice(mail?.enviado
      ? `Convite reenviado para ${invitation.email}.`
      : mail?.detalhe || 'Não foi possível enviar; use o link.');
    await reload();
  };

  const changeRole = async (userId: string, next: UserRole) => {
    if (!companyId) return;
    const res = await updateMemberRole(companyId, userId, next);
    if (res.error) { toast.error(res.error); return; }
    await reload();
  };

  const drop = async (member: TeamMember) => {
    if (!companyId) return;
    const self = member.is_you;
    const ok = await confirm(self
      ? {
          title: 'Sair desta empresa?',
          description: 'Perde o acesso aos dados dela.',
          danger: true,
          confirmLabel: 'Sair da empresa',
        }
      : {
          title: `Remover ${member.name} da equipa?`,
          description: 'Deixa de ter acesso a esta empresa.',
          danger: true,
          confirmLabel: 'Remover',
        });
    if (!ok) return;
    const res = await removeMember(companyId, member.user_id);
    if (res.error) { toast.error(res.error); return; }
    if (self && typeof window !== 'undefined') {
      // Recarregamento completo de propósito: sair da empresa invalida tudo o
      // que o contexto tem em memória sobre ela, e router.push mantinha-o.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/dashboard';
      return;
    }
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
    const res = await revokeInvitation(id);
    if (res.error) { toast.error(res.error); return; }
    await reload();
  };

  return (
    <div className="space-y-5 text-xs">
      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardHeader
          icon={<Users />}
          title={`Equipa de ${currentCompany?.name || 'a empresa'}`}
          subtitle={`${members.length} membro(s)${invites.length ? ` · ${invites.length} convite(s) por aceitar` : ''}`}
          actions={canManage ? (
            <Button
              size="sm"
              variant={inviteOpen ? 'secondary' : 'primary'}
              onClick={() => setInviteOpen((v) => !v)}
              icon={inviteOpen ? <X /> : <UserPlus />}
              aria-expanded={inviteOpen}
            >
              {inviteOpen ? 'Fechar' : 'Convidar pessoa'}
            </Button>
          ) : undefined}
        />
        <CardBody className="space-y-4">
          <div className="flex items-start gap-2.5 p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-700">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" aria-hidden="true" />
            <span>
              Cada pessoa vê <b>apenas esta empresa</b> — as suas outras empresas continuam separadas.
              Quem entra por convite trabalha aqui mas <b>não pode abrir empresas próprias</b>.
            </span>
          </div>

          {notice && (
            <p role="status" className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">{notice}</p>
          )}

          {/* ------------------------------------------------------ invite form */}
          {inviteOpen && canManage && (
            <form onSubmit={send} className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/60 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Email" required>
                  {(p) => (
                    <Input
                      {...p}
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="pessoa@empresa.pt"
                    />
                  )}
                </Field>
                <Field label="Papel" hint={INVITABLE.find((r) => r.value === role)?.hint}>
                  {(p) => (
                    <Select {...p} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                      {INVITABLE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Mensagem (opcional)">
                {(p) => (
                  <Input
                    {...p}
                    value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Escreva uma nota para a pessoa convidada"
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" loading={sending} icon={<Link2 />}>
                  Gerar convite
                </Button>
                <span className="text-2xs text-neutral-500 flex items-center gap-1">
                  <MailWarning className="w-3 h-3 shrink-0" aria-hidden="true" />
                  Enviamos o convite por email. Se o envio não estiver configurado, o link
                  é copiado para si enviar.
                </span>
              </div>
            </form>
          )}

          {/* --------------------------------------------------- pending invites */}
          {canManage && invites.length > 0 && (
            <div className="border border-amber-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 font-bold text-amber-900 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Convites por aceitar
              </div>
              <div className="divide-y divide-amber-100">
                {invites.map((inv) => (
                  <div key={inv.id} className="px-4 py-2.5 flex flex-wrap items-center gap-2 justify-between">
                    <div className="min-w-0">
                      <span className="font-semibold text-neutral-800">{inv.email}</span>
                      <Badge tone={roleTone(inv.role)} className="ml-2 uppercase">{inv.role_label}</Badge>
                      <p className="text-2xs text-neutral-500 mt-0.5">
                        Expira a {formatDate(inv.expires_at)}{inv.invited_by_name ? ` · convidado por ${inv.invited_by_name}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => resend(inv)}
                        loading={busyInvite === inv.id}
                        icon={<Send />}
                        title="Enviar o convite outra vez por email"
                      >
                        Reenviar
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => copy(inv)}
                        icon={copied === inv.token ? <Check className="text-emerald-600" /> : <Copy />}
                      >
                        {copied === inv.token ? 'Copiado' : 'Copiar link'}
                      </Button>
                      <IconButton variant="danger" label="Cancelar convite" onClick={() => revoke(inv.id)}>
                        <Trash2 />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ members */}
          {loading ? (
            <LoadingState label="A carregar a equipa…" />
          ) : (
            <div className="border border-neutral-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 font-bold text-neutral-700">Membros</div>
              {members.length === 0 ? (
                <EmptyState title="Ainda não há membros nesta equipa." />
              ) : (
              <div className="divide-y divide-neutral-100">
                {members.map((m) => (
                  <div key={m.user_id}>
                    <div className="px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-neutral-800">{m.name}</span>
                          {m.is_you && <Badge className="uppercase">Você</Badge>}
                          {m.account_type === 'invited' && (
                            <Badge tone="warning" className="uppercase">Convidado</Badge>
                          )}
                        </div>
                        <p className="text-2xs text-neutral-500 mt-0.5">
                          {m.email} · entrou a {formatDate(m.joined_at)} · {m.movimentos} movimento(s)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openActivity(m.user_id)}
                          icon={<Activity />}
                          aria-expanded={activityFor === m.user_id}
                        >
                          {activityFor === m.user_id ? 'Fechar' : 'Atividade'}
                        </Button>

                        {canManage ? (
                          <Select
                            aria-label={`Papel de ${m.name}`}
                            value={m.role}
                            onChange={(e) => changeRole(m.user_id, e.target.value as UserRole)}
                            className="h-8 w-auto text-xs font-semibold"
                          >
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </Select>
                        ) : (
                          <Badge tone={roleTone(m.role)}>{m.role_label}</Badge>
                        )}

                        {(canManage || m.is_you) && (
                          <IconButton
                            variant="danger"
                            label={m.is_you ? 'Sair da empresa' : 'Remover da equipa'}
                            onClick={() => drop(m)}
                          >
                            <Trash2 />
                          </IconButton>
                        )}
                      </div>
                    </div>

                    {/* --------------------------------------------- activity */}
                    {activityFor === m.user_id && (
                      <div className="px-4 pb-4 bg-neutral-50/60 border-t border-neutral-100">
                        {!activity ? (
                          <LoadingState className="py-4" />
                        ) : (
                          <div className="pt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                              <div className="p-2.5 rounded-xl bg-white border border-neutral-200">
                                <p className="text-2xs uppercase font-bold text-neutral-500">Lançamentos</p>
                                <p className="font-bold text-neutral-900 text-sm tabular-nums">{activity.lancamentos}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white border border-neutral-200">
                                <p className="text-2xs uppercase font-bold text-neutral-500 flex items-center gap-1">
                                  <ArrowUpRight className="w-3 h-3 text-emerald-600" aria-hidden="true" /> Entradas
                                </p>
                                <p className="font-bold text-emerald-700 text-sm tabular-nums">{formatMoney(activity.total_entradas)}</p>
                              </div>
                              <div className="p-2.5 rounded-xl bg-white border border-neutral-200">
                                <p className="text-2xs uppercase font-bold text-neutral-500 flex items-center gap-1">
                                  <ArrowDownRight className="w-3 h-3 text-rose-600" aria-hidden="true" /> Saídas
                                </p>
                                <p className="font-bold text-rose-700 text-sm tabular-nums">{formatMoney(activity.total_saidas)}</p>
                              </div>
                            </div>

                            {activity.movimentos.length === 0 ? (
                              <p className="text-neutral-500 text-xs">Ainda não lançou nada nesta empresa.</p>
                            ) : (
                              <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                                {activity.movimentos.map((t) => (
                                  <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-3 border-b border-neutral-100 last:border-0">
                                    <span className="truncate text-neutral-700">{formatDate(t.date)} · {t.description}</span>
                                    <span className={`font-bold tabular-nums whitespace-nowrap ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {activity.acoes.length > 0 && (
                              <div>
                                <p className="text-2xs uppercase font-bold text-neutral-500 mb-1">Últimas ações</p>
                                <ul className="space-y-1">
                                  {activity.acoes.slice(0, 6).map((a, idx) => (
                                    <li key={idx} className="text-2xs text-neutral-600">
                                      <span className="font-mono text-neutral-500">
                                        {formatDate(a.timestamp)} {a.timestamp.slice(11, 16)}
                                      </span>
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
              )}
            </div>
          )}

          {!canManage && (
            <p className="text-xs text-neutral-500 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" aria-hidden="true" /> Só o proprietário ou um administrador pode convidar pessoas e alterar papéis.
            </p>
          )}
        </CardBody>
      </Card>

      <p className="text-2xs text-neutral-500 text-center">
        Convites e papéis são verificados no servidor ({API_BASE}) — o que se altera aqui não contorna essa validação.
      </p>
    </div>
  );
};
