import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from './components/BottomSheet';
import { Clock24 } from './components/Clock24';
import { createId, loadInitialDates, loadTimeline, newSlot, saveTimeline } from './lib/storage';
import { angleToMinute, formatRange, isOverlapping, plusDays, pointToAngle, rangeDuration, toIsoDate } from './lib/time';
import type { DayTimeline, Mode, TimeSlot } from './lib/types';
import { registerClockCrudTools } from './lib/webmcp';

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
  const [currentMinute, setCurrentMinute] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  const [vaultSyncTick, setVaultSyncTick] = useState(0);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number; slotId?: string } | null>(null);
  const draftMemoryRef = useRef<Record<string, { startMinute: number; endMinute: number }>>({});
  const moveOriginRef = useRef<{ pointerMinute: number; startMinute: number; endMinute: number } | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const isTouchRef = useRef(window.matchMedia('(hover: none), (pointer: coarse)').matches);

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
    const update = () => setCurrentMinute(new Date().getHours() * 60 + new Date().getMinutes());
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme-mode', theme);
  }, [theme]);

  useEffect(() => {
    registerClockCrudTools();
  }, []);

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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        syncingRef.current = true;
        const res = await fetch(`/api/vault/day?date=${focusDate}`);
        if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
        const payload = (await res.json()) as { planSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>; retrospectSlots: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>; filePath: string };
        if (!alive) return;
        const sameSlots = (
          current: TimeSlot[],
          incoming: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>
        ): boolean =>
          current.length === incoming.length &&
          current.every(
            (slot, i) =>
              slot.startMinute === incoming[i]?.startMinute &&
              slot.endMinute === incoming[i]?.endMinute &&
              slot.label === incoming[i]?.label &&
              (slot.notes ?? '') === (incoming[i]?.notes ?? '')
          );
        const maybePersist = (
          mode: Mode,
          incoming: Array<{ startMinute: number; endMinute: number; label: string; notes?: string }>
        ): void => {
          const current = timelines[timelineKey(mode, focusDate)] ?? loadTimeline(mode, focusDate);
          if (sameSlots(current.slots, incoming)) return;
          persistTimeline({
            ...current,
            slots: incoming.map((slot) => newSlot({ startMinute: slot.startMinute, endMinute: slot.endMinute, label: slot.label, notes: slot.notes }))
          });
        };
        maybePersist('plan', payload.planSlots);
        maybePersist('retrospect', payload.retrospectSlots);
        setError('');
      } catch (e) {
        setError(String(e));
      } finally {
        syncingRef.current = false;
      }
    })();
    return () => {
      alive = false;
    };
  }, [focusDate, vaultSyncTick]);

  useEffect(() => {
    const id = window.setInterval(() => setVaultSyncTick((tick) => tick + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (syncingRef.current) return;
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(async () => {
      try {
        await pushDayToVault(focusDate);
      } catch (e) {
        setError(String(e));
      }
    }, 700);
  }, [timelines, focusDate]);

  function persistTimeline(next: DayTimeline): void {
    saveTimeline(next);
    setTimelines((prev) => ({ ...prev, [timelineKey(next.mode, next.day.isoDate)]: next }));
  }

  async function pushDayToVault(isoDate: string): Promise<void> {
    const plan = loadTimeline('plan', isoDate);
    const retrospect = loadTimeline('retrospect', isoDate);
    const res = await fetch('/api/vault/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: isoDate,
        planSlots: plan.slots.map((s) => ({ startMinute: s.startMinute, endMinute: s.endMinute, label: s.label, notes: s.notes ?? '' })),
        retrospectSlots: retrospect.slots.map((s) => ({ startMinute: s.startMinute, endMinute: s.endMinute, label: s.label, notes: s.notes ?? '' }))
      })
    });
    if (!res.ok) throw new Error(`Push failed: ${res.status}`);
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

  function saveCurrentSlot(payload: { label: string; notes: string; startMinute: number; endMinute: number }): void {
    if (!payload.label) {
      setError('Please add an activity label.');
      return;
    }
    setDraftStartMinute(payload.startMinute);
    setDraftEndMinute(payload.endMinute);
    const duration = rangeDuration({ startMinute: payload.startMinute, endMinute: payload.endMinute });
    if (duration <= 0 || duration > 1440) {
      setError('Invalid time range.');
      return;
    }
    const isSplit = payload.endMinute <= payload.startMinute;
    const replaceId = sheet.editingSlotId ?? undefined;
    const groupId = isSplit ? createId() : undefined;

    const currentAdditions: TimeSlot[] = [];
    if (isSplit) {
      if (isOverlapping(activeTimeline.slots, payload.startMinute, 1440, replaceId)) {
        setError('Selected range overlaps an existing segment.');
        return;
      }
      currentAdditions.push(
        newSlot({ startMinute: payload.startMinute, endMinute: 1440, label: payload.label, notes: payload.notes, groupId })
      );
    } else {
      if (isOverlapping(activeTimeline.slots, payload.startMinute, payload.endMinute, replaceId)) {
        setError('Selected range overlaps an existing segment.');
        return;
      }
      currentAdditions.push(
        newSlot({
          startMinute: payload.startMinute,
          endMinute: payload.endMinute,
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
      if (isOverlapping(nextTimeline.slots, 0, payload.endMinute)) {
        setError('Next-day portion overlaps an existing segment.');
        return;
      }
      const nextSlot = newSlot({
        startMinute: 0,
        endMinute: payload.endMinute,
        label: payload.label,
        notes: payload.notes,
        groupId
      });
      const updatedNext: DayTimeline = { ...nextTimeline, slots: upsertSlots(nextTimeline.slots, [nextSlot]) };
      persistTimeline(updatedNext);
      void pushDayToVault(nextDate).catch((e) => setError(String(e)));
    }

    const newStart = payload.endMinute;
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

  async function supersedeEditingSlot(): Promise<void> {
    if (!sheet.editingSlotId || activeMode !== 'plan') return;
    const target = activeTimeline.slots.find((slot) => slot.id === sheet.editingSlotId);
    if (!target) return;
    try {
      const res = await fetch('/api/vault/supersede', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: focusDate,
          slot: {
            startMinute: target.startMinute,
            endMinute: target.endMinute,
            label: target.label,
            notes: target.notes ?? ''
          }
        })
      });
      if (!res.ok) throw new Error(`Supersede failed: ${res.status}`);
      const updated: DayTimeline = {
        ...activeTimeline,
        slots: activeTimeline.slots.filter((slot) => slot.id !== target.id)
      };
      persistTimeline(updated);
      closeSheet();
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }

  const modePrompt =
    activeMode === 'plan'
      ? 'What do you intend to do in this time slot?'
      : 'What did you do in this time slot?';
  const panelClass = activeMode === 'plan' ? 'mode-plan' : 'mode-retro';

  return (
    <main className={`app ${panelClass}`}>
      <section className="pill-row">
        <div className="pill-group">
          <button type="button" className="pill-btn pill-subtle" onClick={() => shiftFocusDate(-1)}>
            Prev
          </button>
          <button type="button" className="pill-btn pill-subtle" onClick={() => setFocusDate(toIsoDate(new Date()))}>
            Today
          </button>
          <button type="button" className="pill-btn pill-subtle" onClick={() => shiftFocusDate(1)}>
            Next
          </button>
        </div>
        <div className="pill-group">
          <button type="button" className="pill-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="pill-btn" onClick={() => switchMode(activeMode === 'plan' ? 'retrospect' : 'plan')}>
            {activeMode === 'plan' ? 'Plan' : 'Retrospect'}
          </button>
        </div>
      </section>
      <section className="range-panel">
        <h2 className="date-header">{focusDate}</h2>
        <p className="draft-header">{formatRange(draftStartMinute, draftEndMinute)}</p>
        <p className="vault-hint">Vault: /Users/yeshwanth/Vault/00-09 Me/03 Daily/YYYY/MM/YYYYMMDD-plan.md</p>
      </section>
      <div className="clock-wrap">
        <Clock24
          planSlots={planTimeline.slots}
          retrospectSlots={retrospectTimeline.slots}
          activeSlots={activeTimeline.slots}
          activeMode={activeMode}
          currentMinute={currentMinute}
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
          onSegmentTap={(payload) => {
            if (isTouchRef.current) setTooltip(payload);
            else openEditSheet(payload.slotId);
          }}
          onRecord={openCreateSheet}
          onSegmentHover={setTooltip}
        />
        {tooltip && (
          <button
            type="button"
            className={`segment-tooltip${tooltip.slotId ? ' clickable' : ''}`}
            style={{ left: tooltip.x + 10, top: tooltip.y - 28 }}
            onClick={() => {
              if (tooltip.slotId) openEditSheet(tooltip.slotId);
              setTooltip(null);
            }}
          >
            {tooltip.text}
          </button>
        )}
      </div>
      <section className="range-panel saved-panel">
        <div className="saved-header">
          <strong>Saved Segments ({activeMode})</strong>
          <span>{activeTimeline.slots.length}</span>
        </div>
        {activeTimeline.slots.length === 0 ? (
          <p>No segments yet. Tap center Record to add one.</p>
        ) : (
          <ul className="saved-list">
            {activeTimeline.slots.map((slot) => (
              <li key={slot.id}>
                <button type="button" className="saved-item" onClick={() => openEditSheet(slot.id)}>
                  <span className="saved-line">{formatRange(slot.startMinute, slot.endMinute)} - {slot.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {!!error && <p className="error">{error}</p>}
      <BottomSheet
        open={sheet.open}
        title={sheet.editingSlotId ? 'Edit Segment' : 'Record Segment'}
        prompt={modePrompt}
        initialLabel={sheet.label}
        initialNotes={sheet.notes}
        initialStartMinute={draftStartMinute}
        initialEndMinute={draftEndMinute}
        submitLabel="Save"
        error={error}
        isEditing={!!sheet.editingSlotId}
        onSubmit={saveCurrentSlot}
        onSupersede={activeMode === 'plan' ? () => void supersedeEditingSlot() : undefined}
        onDelete={deleteEditingSlot}
        onClose={closeSheet}
      />
    </main>
  );
}
