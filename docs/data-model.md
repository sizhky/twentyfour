# 24-Hour Clock Planner/Retrospect Data Model

## 1. Type Definitions (TypeScript)
```ts
export type Mode = "plan" | "retrospect";

export type DayRef = {
  isoDate: string; // local calendar date: YYYY-MM-DD
  timezone: string; // IANA zone
};

export type TimeSlot = {
  id: string;
  groupId?: string; // links auto-split midnight segments
  startMinute: number; // 0..1439
  endMinute: number;   // 1..1440, exclusive end
  label: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type DayTimeline = {
  mode: Mode;
  day: DayRef;
  slots: TimeSlot[]; // sorted by startMinute
  updatedAt: string;
  schemaVersion: number;
};
```

## 2. Storage Strategy (Local-First)
- Primary persistence: IndexedDB.
- Fallback persistence: localStorage.
- Key strategy:
  - `timeline:{mode}:{isoDate}`
- Metadata key:
  - `timeline:schemaVersion`

## 3. Schema Versioning
- `schemaVersion` is stored on each timeline payload.
- On load:
  - If payload version < current version, run migration chain.
  - If migration fails, preserve raw payload under backup key and start empty timeline.

## 4. Validation Rules
- Slot bounds:
  - `0 <= startMinute < endMinute <= 1440`
- Non-overlap:
  - For any adjacent sorted pair `A, B`: `A.endMinute <= B.startMinute`
- Label:
  - Non-empty trimmed string.
- Timeline sorting:
  - Always normalize to ascending `startMinute` before save.

## 5. Operations
- `createSlot(mode, isoDate, draftRange, text)`
- `updateSlot(mode, isoDate, slotId, patch)`
- `deleteSlot(mode, isoDate, slotId)`
- `listSlots(mode, isoDate)`
- `getCoverage(mode, isoDate)` -> merged covered minute ranges.

## 6. Midnight Auto-Split
- If input logical range crosses midnight:
  - Create slot A on day D with `[start, 1440]`
  - Create slot B on day D+1 with `[0, end]`
  - Assign shared `groupId` for traceability/edit coherence.

## 7. Edit-on-Segment Behavior
- Tapping segment loads the slot into quick edit context.
- Save path reuses same overlap/bound validation.
- Delete removes only selected slot; if slot has `groupId`, UI may optionally offer “delete both split parts” in future versions.

