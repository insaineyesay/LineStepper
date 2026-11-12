import type { EventType, SkillLevel } from './types';

/** Event types and skill levels (migration 0010), with the labels people see. */

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'class', label: 'Class' },
  { value: 'social', label: 'Social' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'competition', label: 'Competition' },
  { value: 'festival', label: 'Festival' },
];

export const SKILL_LEVELS: { value: SkillLevel; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const eventTypeLabel = (t: EventType | null | undefined) => EVENT_TYPES.find((x) => x.value === t)?.label ?? null;
export const skillLevelLabel = (l: SkillLevel | null | undefined) => SKILL_LEVELS.find((x) => x.value === l)?.label ?? null;

/** "Social · All levels", or whichever part is set. */
export function kindLine(e: { event_type?: EventType | null; skill_level?: SkillLevel | null }): string | null {
  const parts = [eventTypeLabel(e.event_type), skillLevelLabel(e.skill_level)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** An "all levels" event suits every level filter. */
export function matchesLevel(eventLevel: SkillLevel | null | undefined, wanted: SkillLevel | null): boolean {
  if (!wanted) return true;
  return eventLevel === wanted || eventLevel === 'all';
}
