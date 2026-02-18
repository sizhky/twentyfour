import type { DayTimeline, Mode } from './types';

type ParsedSlot = { startMinute: number; endMinute: number; label: string };

export function obsidianFileName(isoDate: string, mode: Mode): string {
  return `${isoDate}-${mode}.md`;
}

export function obsidianPathHint(isoDate: string, mode: Mode): string {
  const [year, month] = isoDate.split('-');
  return `RIL/00-09 Me/03 Daily/${year}/${month}/${obsidianFileName(isoDate, mode)}`;
}

export function timelineToMarkdown(timeline: DayTimeline): string {
  const title = `${timeline.day.isoDate} ${timeline.mode}`;
  const lines = timeline.slots.map((slot) => {
    const start = minuteToText(slot.startMinute);
    const end = minuteToText(slot.endMinute % 1440);
    return `- ${start}-${end} | ${slot.label}`;
  });
  return [`# ${title}`, '', ...lines].join('\n');
}

export function markdownToSlots(markdown: string): ParsedSlot[] {
  const parsed: ParsedSlot[] = [];
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    const match = line.match(/^- (\d{2}):(\d{2})-(\d{2}):(\d{2}) \| (.+)$/);
    if (!match) continue;
    const [, sh, sm, eh, em, label] = match;
    const startMinute = Number(sh) * 60 + Number(sm);
    const endMinute = Number(eh) * 60 + Number(em);
    if (!label.trim()) continue;
    if (startMinute === endMinute) continue;
    parsed.push({ startMinute, endMinute, label: label.trim() });
  }
  return parsed;
}

function minuteToText(minute: number): string {
  const safe = ((minute % 1440) + 1440) % 1440;
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}
