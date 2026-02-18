import { sortSlots, toIsoDate } from './time';
import type { DayRef, DayTimeline, Mode, TimeSlot } from './types';

const SCHEMA_VERSION = 1;

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function timelineKey(mode: Mode, isoDate: string): string {
  return `timeline:${mode}:${isoDate}`;
}

function dayRef(isoDate: string): DayRef {
  return {
    isoDate,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

function emptyTimeline(mode: Mode, isoDate: string): DayTimeline {
  return {
    mode,
    day: dayRef(isoDate),
    slots: [],
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  };
}

export function loadTimeline(mode: Mode, isoDate: string): DayTimeline {
  const raw = localStorage.getItem(timelineKey(mode, isoDate));
  if (!raw) return emptyTimeline(mode, isoDate);

  try {
    const parsed = JSON.parse(raw) as DayTimeline;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return emptyTimeline(mode, isoDate);
    return {
      ...parsed,
      mode,
      day: dayRef(isoDate),
      slots: sortSlots(parsed.slots)
    };
  } catch {
    return emptyTimeline(mode, isoDate);
  }
}

export function saveTimeline(timeline: DayTimeline): void {
  const normalized: DayTimeline = {
    ...timeline,
    slots: sortSlots(timeline.slots),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION
  };
  localStorage.setItem(timelineKey(timeline.mode, timeline.day.isoDate), JSON.stringify(normalized));
}

export function newSlot(partial: Pick<TimeSlot, 'startMinute' | 'endMinute' | 'label' | 'notes' | 'groupId'>): TimeSlot {
  const now = new Date().toISOString();
  return {
    id: createId(),
    startMinute: partial.startMinute,
    endMinute: partial.endMinute,
    label: partial.label,
    notes: partial.notes,
    groupId: partial.groupId,
    createdAt: now,
    updatedAt: now
  };
}

export function loadInitialDates(): { planDate: string; retrospectDate: string } {
  const today = toIsoDate(new Date());
  const yesterday = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return {
    planDate: today,
    retrospectDate: yesterday
  };
}
