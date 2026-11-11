import { apiRequest } from './api-request';
import type { DataResult } from './result';

/** Report, block and moderate. Served by our API (apps/api/src/routes/moderation.ts). */

export type ReportTarget = 'event' | 'crew' | 'profile';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'fake' | 'other';
export type Resolution = 'dismiss' | 'remove' | 'ban';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'fake', label: 'Fake or misleading' },
  { value: 'other', label: 'Something else' },
];

export interface PersonSummary {
  id: string;
  displayName: string | null;
  handle: string | null;
}

export interface OpenReport {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetLabel: string | null;
  ownerId: string | null;
  reason: ReportReason;
  details: string | null;
  reporter: PersonSummary | null;
  createdAt: string;
  openOnTarget: number;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export function reportContent(
  targetType: ReportTarget,
  targetId: string,
  reason: ReportReason,
  details: string | null,
): Promise<DataResult<{ reported: true }>> {
  return apiRequest('/reports', { method: 'POST', ...json({ targetType, targetId, reason, details }) });
}

export function blockPerson(profileId: string): Promise<DataResult<{ blocked: true }>> {
  return apiRequest(`/blocks/${profileId}`, { method: 'PUT' });
}

export function unblockPerson(profileId: string): Promise<DataResult<{ blocked: false }>> {
  return apiRequest(`/blocks/${profileId}`, { method: 'DELETE' });
}

export async function listBlocked(): Promise<DataResult<PersonSummary[]>> {
  const res = await apiRequest<{ blocked: PersonSummary[] }>('/me/blocks');
  return res.error ? res : { data: res.data.blocked, error: null };
}

// ---- Admins ----

export async function listOpenReports(): Promise<DataResult<OpenReport[]>> {
  const res = await apiRequest<{ reports: OpenReport[] }>('/admin/reports');
  return res.error ? res : { data: res.data.reports, error: null };
}

export function resolveReport(
  id: string,
  action: Resolution,
  note?: string,
): Promise<DataResult<{ resolved: true; action: string; reportsClosed: number }>> {
  return apiRequest(`/admin/reports/${id}/resolve`, { method: 'POST', ...json({ action, note }) });
}
