import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from './components/BottomSheet';
import { Clock24 } from './components/Clock24';
import { createId, loadInitialDates, loadTimeline, newSlot, saveTimeline } from './lib/storage';
import { angleToMinute, formatRange, isOverlapping, minuteToTimeLabel, plusDays, pointToAngle, rangeDuration } from './lib/time';
import type { DayTimeline, Mode, TimeSlot } from './lib/types';

type ActiveDrag = 'start' | 'end' | 'move' | null;
type SheetState = { open: boolean; editingSlotId: string | null; label: string; notes: string };
type ThemeMode = 'light' | 'dark';

const INITIAL_DRAFT = { startMinute: 9 * 60, endMinute: 10 * 60 };

function timelineKey(mode: Mode, isoDate: string): string {
  return `${mode}:${isoDate}`;
}

function defaultDraft(slots: TimeSlot[]): { startMinute: number; endMinute: number } {
  if (slots.length === 0) return INITIAL_DRAFT;
  const last = slots[slots.length - 1];
  const duration = Math.max(5, last.endMinute - last.startMinute);
  const endMinute = Math.min(1440, last.endMinute + duration);
  return { startMinute: last.endMinute, endMinute };
}

function nextValidAutoEnd(slots: TimeSlot[], startMinute: number, duration: number): number | null {
  const candidate = startMinute + duration;
  if (candidate > 1440) return null;
  if (isOverlapping(slots, startMinute, candidate)) return null;
  return candidate;
}

function upsertSlots(slots: TimeSlot[], additions: TimeSlot[], replaceId?: string): TimeSlot[] {
  const kept = replaceId ? slots.filter((slot) => slot.id !== replaceId) : [...slots];
  return [...kept, ...additions].sort((a, b) => a.startMinute - b.startMinute);
}

export default function App(): JSX.Element {
  const [dates] = useState(loadInitialDates);
  const [planDate, setPlanDate] = useState(dates.planDate);
  const [retrospectDate, setRetrospectDate] = useState(dates.retrospectDate);
  const [activeMode, setActiveMode] = useState<Mode>('plan');
  const [timelines, setTimelines] = useState<Record<string, DayTimeline>>({});
  const [dragging, setDragging] = useState<ActiveDrag>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<SheetState>({ open: false, editingSlotId: null, label: '', notes: '' });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [draftStartMinute, setDraftStartMinute] = useState(INITIAL_DRAFT.startMinute);
  const [draftEndMinute, setDraftEndMinute] = useState(INITIAL_DRAFT.endMinute);
  const draftMemoryRef = useRef<Record<string, { startMinute: number; endMinute: number }>>({});
  const moveOriginRef = useRef<{ pointerMinute: number; startMinute: number; endMinute: number } | null>(null);

  const focusDate = activeMode === 'plan' ? planDate : retrospectDate;
  const activeDraftKey = timelineKey(activeMode, focusDate);
  const setFocusDate = (isoDate: string): void => {
    if (activeMode === 'plan') setPlanDate(isoDate);
    else setRetrospectDate(isoDate);
  };
  const shiftFocusDate = (offset: number): void => setFocusDate(plusDays(focusDate, offset));
  const switchMode = (mode: Mode): void => {
    if (mode === 'plan') setPlanDate(focusDate);
    else setRetrospectDate(focusDate);
    setActiveMode(mode);
  };

  const planTimeline = useMemo(
    () => timelines[timelineKey('plan', focusDate)] ?? loadTimeline('plan', focusDate),
    [timelines, focusDate]
  );
  const retrospectTimeline = useMemo(
    () => timelines[timelineKey('retrospect', focusDate)] ?? loadTimeline('retrospect', focusDate),
    [timelines, focusDate]
  );
  const activeTimeline = activeMode === 'plan' ? planTimeline : retrospectTimeline;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme-mode', theme);
  }, [theme]);

  useEffect(() => {
    draftMemoryRef.current[activeDraftKey] = {
      startMinute: draftStartMinute,
      endMinute: draftEndMinute
    };
  }, [activeDraftKey, draftStartMinute, draftEndMinute]);

  useEffect(() => {
    const remembered = draftMemoryRef.current[activeDraftKey];
    if (remembered) {
      setDraftStartMinute(remembered.startMinute);
      setDraftEndMinute(remembered.endMinute);
      return;
    }
    const draft = defaultDraft(activeTimeline.slots);
    setDraftStartMinute(draft.startMinute);
    setDraftEndMinute(draft.endMinute);
  }, [activeDraftKey, activeTimeline.slots]);

  function persistTimeline(next: DayTimeline): void {
    saveTimeline(next);
    setTimelines((prev) => ({ ...prev, [timelineKey(next.mode, next.day.isoDate)]: next }));
  }

  function pointerMinute(clientX: number, clientY: number): number | null {
    const svg = document.querySelector('.clock');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = pointToAngle(clientX, clientY, cx, cy);
    return angleToMinute(angle);
  }

  function setMinuteFromPointer(clientX: number, clientY: number): void {
    const minute = pointerMinute(clientX, clientY);
    if (minute === null) return;

    if (dragging === 'start') setDraftStartMinute(minute);
    if (dragging === 'end') setDraftEndMinute(minute);
    if (dragging === 'move' && moveOriginRef.current) {
      const origin = moveOriginRef.current;
      let delta = minute - origin.pointerMinute;
      if (delta > 720) delta -= 1440;
      if (delta < -720) delta += 1440;
      setDraftStartMinute((origin.startMinute + delta + 1440) % 1440);
      setDraftEndMinute((origin.endMinute + delta + 1440) % 1440);
    }
  }

  function startMoveDrag(clientX: number, clientY: number): void {
    const minute = pointerMinute(clientX, clientY);
    if (minute === null) return;
    moveOriginRef.current = {
      pointerMinute: minute,
      startMinute: draftStartMinute,
      endMinute: draftEndMinute
    };
    setDragging('move');
  }

  function openCreateSheet(): void {
    setSheet({ open: true, editingSlotId: null, label: '', notes: '' });
    setError('');
  }

  function openEditSheet(slotId: string): void {
    const target = activeTimeline.slots.find((slot) => slot.id === slotId);
    if (!target) return;
    setDraftStartMinute(target.startMinute);
    setDraftEndMinute(target.endMinute % 1440);
    setSheet({ open: true, editingSlotId: target.id, label: target.label, notes: target.notes ?? '' });
    setError('');
  }

  function closeSheet(): void {
    setSheet({ open: false, editingSlotId: null, label: '', notes: '' });
  }

  function saveCurrentSlot(payload: { label: string; notes: string }): void {
    if (!payload.label) {
      setError('Please add an activity label.');
      return;
    }
    const duration = rangeDuration({ startMinute: draftStartMinute, endMinute: draftEndMinute });
    if (duration <= 0 || duration > 1440) {
      setError('Invalid time range.');
      return;
    }
    const isSplit = draftEndMinute <= draftStartMinute;
    const replaceId = sheet.editingSlotId ?? undefined;
    const groupId = isSplit ? createId() : undefined;

    const currentAdditions: TimeSlot[] = [];
    if (isSplit) {
      if (isOverlapping(activeTimeline.slots, draftStartMinute, 1440, replaceId)) {
        setError('Selected range overlaps an existing segment.');
        return;
      }
      currentAdditions.push(
        newSlot({ startMinute: draftStartMinute, endMinute: 1440, label: payload.label, notes: payload.notes, groupId })
      );
    } else {
      if (isOverlapping(activeTimeline.slots, draftStartMinute, draftEndMinute, replaceId)) {
        setError('Selected range overlaps an existing segment.');
        return;
      }
      currentAdditions.push(
        newSlot({
          startMinute: draftStartMinute,
          endMinute: draftEndMinute,
          label: payload.label,
          notes: payload.notes
        })
      );
    }

    const updatedCurrent: DayTimeline = {
      ...activeTimeline,
      slots: upsertSlots(activeTimeline.slots, currentAdditions, replaceId)
    };
    persistTimeline(updatedCurrent);

    if (isSplit) {
      const nextDate = plusDays(focusDate, 1);
      const nextTimeline = timelines[timelineKey(activeMode, nextDate)] ?? loadTimeline(activeMode, nextDate);
      if (isOverlapping(nextTimeline.slots, 0, draftEndMinute)) {
        setError('Next-day portion overlaps an existing segment.');
        return;
      }
      const nextSlot = newSlot({
        startMinute: 0,
        endMinute: draftEndMinute,
        label: payload.label,
        notes: payload.notes,
        groupId
      });
      const updatedNext: DayTimeline = { ...nextTimeline, slots: upsertSlots(nextTimeline.slots, [nextSlot]) };
      persistTimeline(updatedNext);
    }

    const newStart = draftEndMinute;
    const suggestedEnd = nextValidAutoEnd(updatedCurrent.slots, newStart, duration);
    setDraftStartMinute(newStart);
    if (suggestedEnd !== null) setDraftEndMinute(suggestedEnd);
    setError('');
    closeSheet();
  }

  function deleteEditingSlot(): void {
    if (!sheet.editingSlotId) return;
    const updated: DayTimeline = {
      ...activeTimeline,
      slots: activeTimeline.slots.filter((slot) => slot.id !== sheet.editingSlotId)
    };
    persistTimeline(updated);
    closeSheet();
  }

  const modePrompt =
    activeMode === 'plan'
      ? 'What do you intend to do in this time slot?'
      : 'What did you do in this time slot?';
  const draftLabel = `${minuteToTimeLabel(draftStartMinute)} -> ${minuteToTimeLabel(draftEndMinute)}`;
  const panelClass = activeMode === 'plan' ? 'mode-plan' : 'mode-retro';

  return (
    <main className={`app ${panelClass}`}>
      <header className="top">
        <h1>24-Hour Planner</h1>
        <p>Outer ring: Plan | Inner ring: Retrospect</p>
        <button type="button" className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </header>
      <section className="range-panel">
        <div>
          <strong>Mode</strong>
          <span>{activeMode}</span>
        </div>
        <div>
          <strong>Date</strong>
          <span>{focusDate}</span>
        </div>
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={() => shiftFocusDate(-1)}>
            Prev Day
          </button>
          <button type="button" className="ghost" onClick={() => shiftFocusDate(1)}>
            Next Day
          </button>
          <button
            type="button"
            className={activeMode === 'plan' ? 'primary' : 'ghost'}
            onClick={() => switchMode('plan')}
          >
            Plan
          </button>
          <button
            type="button"
            className={activeMode === 'retrospect' ? 'primary' : 'ghost'}
            onClick={() => switchMode('retrospect')}
          >
            Retrospect
          </button>
        </div>
        <div>
          <strong>Draft</strong>
          <span>{formatRange(draftStartMinute, draftEndMinute)}</span>
        </div>
      </section>
      <Clock24
        planSlots={planTimeline.slots}
        retrospectSlots={retrospectTimeline.slots}
        activeSlots={activeTimeline.slots}
        activeMode={activeMode}
        startMinute={draftStartMinute}
        endMinute={draftEndMinute}
        onStartPointerDown={() => setDragging('start')}
        onEndPointerDown={() => setDragging('end')}
        onPointerMove={setMinuteFromPointer}
        onPointerUp={() => {
          setDragging(null);
          moveOriginRef.current = null;
        }}
        onMovePointerDown={startMoveDrag}
        onSelectSegment={openEditSheet}
        onRecord={openCreateSheet}
      />
      <section className="range-panel">
        <strong>Saved Segments ({activeMode})</strong>
        {activeTimeline.slots.length === 0 ? (
          <p>No segments yet. Tap center Record to add one.</p>
        ) : (
          <ul>
            {activeTimeline.slots.map((slot) => (
              <li key={slot.id}>
                <button type="button" className="ghost" onClick={() => openEditSheet(slot.id)}>
                  {formatRange(slot.startMinute, slot.endMinute)} - {slot.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>{modePrompt}</p>
      {!!error && <p className="error">{error}</p>}
      <BottomSheet
        open={sheet.open}
        title={sheet.editingSlotId ? 'Edit Segment' : 'Record Segment'}
        prompt={modePrompt}
        initialLabel={sheet.label}
        initialNotes={sheet.notes}
        submitLabel="Save"
        error={error}
        isEditing={!!sheet.editingSlotId}
        onSubmit={saveCurrentSlot}
        onDelete={deleteEditingSlot}
        onClose={closeSheet}
      />
    </main>
  );
}
