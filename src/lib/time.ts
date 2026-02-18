import type { DraftRange, TimeSlot } from './types';

export const MINUTES_PER_DAY = 24 * 60;
export const SNAP_MINUTES = 5;

export function clampMinute(minute: number): number {
  if (minute < 0) return 0;
  if (minute > MINUTES_PER_DAY) return MINUTES_PER_DAY;
  return minute;
}

export function snapMinute(minute: number): number {
  const snapped = Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
  return clampMinute(snapped);
}

export function minuteToAngle(minute: number): number {
  return (minute / MINUTES_PER_DAY) * Math.PI * 2 - Math.PI / 2;
}

export function angleToMinute(angle: number): number {
  const normalized = ((angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  return snapMinute((normalized / (Math.PI * 2)) * MINUTES_PER_DAY);
}

export function pointToAngle(x: number, y: number, cx: number, cy: number): number {
  return Math.atan2(y - cy, x - cx);
}

export function normalizeRange(range: DraftRange): DraftRange {
  return {
    startMinute: clampMinute(range.startMinute),
    endMinute: clampMinute(range.endMinute)
  };
}

export function rangeDuration(range: DraftRange): number {
  const diff = range.endMinute - range.startMinute;
  return diff > 0 ? diff : MINUTES_PER_DAY + diff;
}

export function isOverlapping(slots: TimeSlot[], startMinute: number, endMinute: number, ignoreId?: string): boolean {
  return slots.some((slot) => {
    if (ignoreId && slot.id === ignoreId) return false;
    return startMinute < slot.endMinute && endMinute > slot.startMinute;
  });
}

export function minuteToTimeLabel(minute: number): string {
  const safe = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatRange(startMinute: number, endMinute: number): string {
  return `${minuteToTimeLabel(startMinute)} - ${minuteToTimeLabel(endMinute % MINUTES_PER_DAY)}`;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function plusDays(isoDate: string, offset: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

export function sortSlots(slots: TimeSlot[]): TimeSlot[] {
  return [...slots].sort((a, b) => a.startMinute - b.startMinute);
}
