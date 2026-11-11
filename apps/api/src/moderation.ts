import type { SupabaseClient } from '@supabase/supabase-js';

/** Report, block and ban (supabase/migrations/0008_moderation.sql). */

export const TARGET_TYPES = ['event', 'crew', 'profile'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'fake', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** What an admin can do with a report. */
export const RESOLUTIONS = ['dismiss', 'remove', 'ban'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

export interface PersonSummary {
  id: string;
  displayName: string | null;
  handle: string | null;
}

export interface OpenReport {
  id: string;
  targetType: TargetType;
  targetId: string;
  /** Event title, crew name or person's name; null if it no longer exists. */
  targetLabel: string | null;
  /** Who posted it: the organizer, crew owner, or the person themselves. */
  ownerId: string | null;
  reason: ReportReason;
  details: string | null;
  reporter: PersonSummary | null;
  createdAt: string;
  /** Open reports on the same thing, this one included. */
  openOnTarget: number;
}

export interface ModerationStore {
  isBanned(profileId: string): Promise<boolean>;
  isAdmin(profileId: string): Promise<boolean>;
  /** The profile behind an event, crew or profile; null if it doesn't exist. */
  ownerOf(type: TargetType, id: string): Promise<string | null>;
  createReport(input: {
    reporterId: string;
    targetType: TargetType;
    targetId: string;
    reason: ReportReason;
    details: string | null;
  }): Promise<'created' | 'duplicate'>;
  /** Blocks, and removes follows between the two people in both directions. */
  block(blockerId: string, blockedId: string): Promise<void>;
  unblock(blockerId: string, blockedId: string): Promise<void>;
  listBlocked(blockerId: string): Promise<PersonSummary[]>;
  listOpenReports(limit: number): Promise<OpenReport[]>;
  getOpenReport(id: string): Promise<{ targetType: TargetType; targetId: string } | null>;
  /** Hides an event or crew from everyone but its owner. */
  removeContent(type: 'event' | 'crew', id: string): Promise<void>;
  /** Hides everything the person posted, stops sign-in, blocks their email. */
  ban(profileId: string): Promise<void>;
  /** Closes every open report on the target and logs the admin's action. */
  closeReports(input: {
    reportId: string;
    targetType: TargetType;
    targetId: string;
    status: 'dismissed' | 'actioned';
    actorId: string;
    action: string;
    note: string | null;
  }): Promise<number>;
}

const OWNER_COLUMN: Record<TargetType, { table: string; column: string; label: string }> = {
  event: { table: 'events', column: 'organizer_id', label: 'title' },
  crew: { table: 'crews', column: 'owner_id', label: 'name' },
  profile: { table: 'profiles', column: 'id', label: 'display_name' },
};

/** A ban that outlasts the app: Supabase takes a duration, not "forever". */
const BAN_DURATION = '876000h'; // 100 years

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const toPerson = (p: { id: string; display_name: string | null; handle: string | null }): PersonSummary => ({
  id: p.id,
  displayName: p.display_name,
  handle: p.handle,
});

/** Runs with the service role, so it sees past row-level security; routes check who may do what. */
export function supabaseModerationStore(db: SupabaseClient): ModerationStore {
  return {
    async isBanned(profileId) {
      const { data, error } = await db.from('profiles').select('banned_at').eq('id', profileId).maybeSingle();
      check(error, 'isBanned');
      return Boolean(data?.banned_at);
    },

    async isAdmin(profileId) {
      const { data, error } = await db.from('profiles').select('is_admin').eq('id', profileId).maybeSingle();
      check(error, 'isAdmin');
      return Boolean(data?.is_admin);
    },

    async ownerOf(type, id) {
      const { table, column } = OWNER_COLUMN[type];
      const { data, error } = await db.from(table).select(column).eq('id', id).maybeSingle();
      check(error, 'ownerOf');
      return (data as Record<string, string> | null)?.[column] ?? null;
    },

    async createReport({ reporterId, targetType, targetId, reason, details }) {
      const { error } = await db.from('reports').insert({
        reporter_id: reporterId,
        target_type: targetType,
        target_id: targetId,
        reason,
        details,
      });
      if (error?.code === '23505') return 'duplicate';
      check(error, 'createReport');
      return 'created';
    },

    async block(blockerId, blockedId) {
      const ins = await db.from('blocks').upsert({ blocker_id: blockerId, blocked_id: blockedId }, { ignoreDuplicates: true });
      check(ins.error, 'block');
      const del = await db
        .from('follows')
        .delete()
        .or(
          `and(follower_id.eq.${blockerId},followed_id.eq.${blockedId}),and(follower_id.eq.${blockedId},followed_id.eq.${blockerId})`,
        );
      check(del.error, 'block: remove follows');
    },

    async unblock(blockerId, blockedId) {
      const { error } = await db.from('blocks').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
      check(error, 'unblock');
    },

    async listBlocked(blockerId) {
      const { data, error } = await db
        .from('blocks')
        .select('created_at, profile:profiles!blocks_blocked_id_fkey(id, display_name, handle)')
        .eq('blocker_id', blockerId)
        .order('created_at', { ascending: false });
      check(error, 'listBlocked');
      return (data ?? [])
        .map((row) => row.profile as unknown as { id: string; display_name: string | null; handle: string | null } | null)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map(toPerson);
    },

    async listOpenReports(limit) {
      const { data, error } = await db
        .from('reports')
        .select('id, target_type, target_id, reason, details, created_at, reporter:profiles!reports_reporter_id_fkey(id, display_name, handle)')
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(limit);
      check(error, 'listOpenReports');
      const rows = data ?? [];

      // Labels and owners, one query per target type.
      const meta = new Map<string, { label: string | null; owner: string | null }>();
      for (const type of TARGET_TYPES) {
        const ids = [...new Set(rows.filter((r) => r.target_type === type).map((r) => r.target_id as string))];
        if (!ids.length) continue;
        const { table, column, label } = OWNER_COLUMN[type];
        const res = await db.from(table).select(`id, ${column}, ${label}`).in('id', ids);
        check(res.error, 'listOpenReports: targets');
        for (const t of (res.data ?? []) as unknown as Record<string, string | null>[]) {
          meta.set(`${type}:${t.id}`, { label: t[label] ?? null, owner: t[column] ?? null });
        }
      }

      const counts = new Map<string, number>();
      for (const r of rows) counts.set(`${r.target_type}:${r.target_id}`, (counts.get(`${r.target_type}:${r.target_id}`) ?? 0) + 1);

      return rows.map((r) => {
        const key = `${r.target_type}:${r.target_id}`;
        const reporter = r.reporter as unknown as { id: string; display_name: string | null; handle: string | null } | null;
        return {
          id: r.id as string,
          targetType: r.target_type as TargetType,
          targetId: r.target_id as string,
          targetLabel: meta.get(key)?.label ?? null,
          ownerId: meta.get(key)?.owner ?? null,
          reason: r.reason as ReportReason,
          details: (r.details as string | null) ?? null,
          reporter: reporter ? toPerson(reporter) : null,
          createdAt: r.created_at as string,
          openOnTarget: counts.get(key) ?? 1,
        };
      });
    },

    async getOpenReport(id) {
      const { data, error } = await db.from('reports').select('target_type, target_id').eq('id', id).eq('status', 'open').maybeSingle();
      check(error, 'getOpenReport');
      return data ? { targetType: data.target_type as TargetType, targetId: data.target_id as string } : null;
    },

    async removeContent(type, id) {
      const { error } = await db
        .from(OWNER_COLUMN[type].table)
        .update({ removed_at: new Date().toISOString() })
        .eq('id', id);
      check(error, 'removeContent');
    },

    async ban(profileId) {
      const user = await db.auth.admin.getUserById(profileId);
      check(user.error, 'ban: look up user');
      const email = user.data.user?.email;

      const upd = await db.from('profiles').update({ banned_at: new Date().toISOString() }).eq('id', profileId);
      check(upd.error, 'ban: profile');
      if (email) {
        const hash = await db.rpc('email_hash', { p_email: email });
        check(hash.error, 'ban: hash email');
        const ins = await db.from('banned_emails').upsert({ email_hash: hash.data as string }, { ignoreDuplicates: true });
        check(ins.error, 'ban: remember email');
      }
      const auth = await db.auth.admin.updateUserById(profileId, { ban_duration: BAN_DURATION });
      check(auth.error, 'ban: stop sign-in');
    },

    async closeReports({ reportId, targetType, targetId, status, actorId, action, note }) {
      const { data, error } = await db
        .from('reports')
        .update({ status, resolved_at: new Date().toISOString(), resolved_by: actorId })
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('status', 'open')
        .select('id');
      check(error, 'closeReports');
      const log = await db.from('moderation_actions').insert({
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: targetId,
        report_id: reportId,
        note,
      });
      check(log.error, 'closeReports: log');
      return data?.length ?? 0;
    },
  };
}

/** Used when the API has no service-role key: moderation can't be done. */
export class ModerationUnavailableError extends Error {
  statusCode = 503;
  constructor() {
    super('Moderation needs SUPABASE_SERVICE_ROLE_KEY on the API.');
  }
}

export const noModerationStore: ModerationStore = new Proxy({} as ModerationStore, {
  get: () => async () => {
    throw new ModerationUnavailableError();
  },
});
