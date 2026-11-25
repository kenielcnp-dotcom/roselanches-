// Equipe (vendedores): convite de uso único, ativar/desativar e o relatório
// por vendedor. Só a dona usa; o servidor confere o papel em cada chamada.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import { throwIfError } from './shared';
import type { CreatedInvite } from './invites';

/** Link do convite de vendedor. O token vai depois do "#" (não é enviado a servidor nenhum). */
export function teamInviteLink(origin: string, token: string): string {
  return `${origin}/convite-equipe#t=${token}`;
}

export interface TeamMember {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: 'OWNER' | 'OPERATOR';
  isActive: boolean;
  joinedAt: string;
  lastSaleAt: string | null;
}

export interface TeamInvite {
  inviteId: string;
  name: string;
  expiresAt: string;
  createdAt: string;
}

export interface TeamOverview {
  members: TeamMember[];
  invites: TeamInvite[];
}

const overviewSchema = z.object({
  members: z.array(
    z.object({
      member_id: z.uuid(),
      user_id: z.uuid(),
      name: z.string(),
      email: z.string(),
      role: z.enum(['OWNER', 'OPERATOR']),
      is_active: z.boolean(),
      joined_at: z.string(),
      last_sale_at: z.string().nullable(),
    }),
  ),
  invites: z.array(z.object({ invite_id: z.uuid(), name: z.string(), expires_at: z.string(), created_at: z.string() })),
});

export async function fetchTeam(client: Client): Promise<TeamOverview> {
  const { data, error } = await client.rpc('team_overview');
  throwIfError(error);
  const r = overviewSchema.parse(data);
  return {
    members: r.members.map((m) => ({
      memberId: m.member_id,
      userId: m.user_id,
      name: m.name,
      email: m.email,
      role: m.role,
      isActive: m.is_active,
      joinedAt: m.joined_at,
      lastSaleAt: m.last_sale_at,
    })),
    invites: r.invites.map((i) => ({ inviteId: i.invite_id, name: i.name, expiresAt: i.expires_at, createdAt: i.created_at })),
  };
}

export async function createStaffInvite(client: Client, name: string): Promise<CreatedInvite> {
  const { data, error } = await client.rpc('create_staff_invite', { p_name: name.trim() });
  throwIfError(error);
  const r = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32}$/), expires_at: z.string() }).parse(data);
  return { token: r.token, expiresAt: r.expires_at };
}

export async function cancelStaffInvite(client: Client, inviteId: string): Promise<void> {
  const { error } = await client.rpc('cancel_staff_invite', { p_invite: inviteId });
  throwIfError(error);
}

export async function setMemberActive(client: Client, memberId: string, active: boolean): Promise<void> {
  const { error } = await client.rpc('set_member_active', { p_member: memberId, p_active: active });
  throwIfError(error);
}

export type StaffRedeemStatus =
  | 'JOINED'
  | 'ALREADY_MEMBER'
  | 'INVALID'
  | 'EXPIRED'
  | 'USED'
  | 'CANCELLED'
  | 'OTHER_BUSINESS'
  | 'CUSTOMER_ACCOUNT'
  | 'TOO_MANY_ATTEMPTS';

const redeemSchema = z.object({
  status: z.enum(['JOINED', 'ALREADY_MEMBER', 'INVALID', 'EXPIRED', 'USED', 'CANCELLED', 'OTHER_BUSINESS', 'CUSTOMER_ACCOUNT', 'TOO_MANY_ATTEMPTS']),
  business_name: z.string().optional(),
});

export async function redeemStaffInvite(client: Client, token: string): Promise<{ status: StaffRedeemStatus; businessName: string | null }> {
  const { data, error } = await client.rpc('redeem_staff_invite', { p_token: token });
  throwIfError(error);
  const r = redeemSchema.parse(data);
  return { status: r.status, businessName: r.business_name ?? null };
}

// -----------------------------------------------------------------------------
// Relatório por vendedor
// -----------------------------------------------------------------------------
export interface TeamReportRow {
  userId: string;
  name: string;
  role: 'OWNER' | 'OPERATOR';
  isActive: boolean;
  salesCount: number;
  salesCents: number;
  creditCents: number;
  cancelledCount: number;
  cashCents: number;
  pixCents: number;
}

const teamReportSchema = z.object({
  members: z.array(
    z.object({
      user_id: z.uuid(),
      name: z.string().nullable(),
      role: z.enum(['OWNER', 'OPERATOR']),
      is_active: z.boolean(),
      sales_count: z.number().int(),
      sales_cents: z.number().int(),
      credit_cents: z.number().int(),
      cancelled_count: z.number().int(),
      cash_cents: z.number().int(),
      pix_cents: z.number().int(),
    }),
  ),
});

export async function fetchTeamReport(client: Client, from: string, to: string): Promise<TeamReportRow[]> {
  const { data, error } = await client.rpc('report_team', { p_from: from, p_to: to });
  throwIfError(error);
  return teamReportSchema.parse(data).members.map((m) => ({
    userId: m.user_id,
    name: m.name ?? 'Sem nome',
    role: m.role,
    isActive: m.is_active,
    salesCount: m.sales_count,
    salesCents: m.sales_cents,
    creditCents: m.credit_cents,
    cancelledCount: m.cancelled_count,
    cashCents: m.cash_cents,
    pixCents: m.pix_cents,
  }));
}
