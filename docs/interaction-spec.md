# 24-Hour Clock Planner/Retrospect Interaction Spec

## 1. Input Model
- Time resolution: 5-minute snap points.
- Two independent radial dials:
  - `Start dial`: sunrise color family.
  - `End dial`: twilight color family.
- Dials can be adjusted independently at any time before save.

## 2. Primary Record Flow
1. User positions `Start dial`.
2. User positions `End dial`.
3. User taps `Record`.
4. Bottom sheet opens with mode-specific prompt:
   - Plan mode prompt: "What do you intend to do in this slot?"
   - Retrospect mode prompt: "What did you do in this slot?"
5. User enters text and confirms.
6. System saves segment and updates timeline/rings.

## 3. Auto-Advance Behavior After Save
- Given saved segment `[start, end]` with `duration = end - start`:
  - New default start = previous end.
  - New default end = previous end + duration if valid.
- Validity conditions for auto-end:
  - No overlap with existing segments in active day/mode.
  - Does not exceed day boundary for unsplit operation.
- If invalid:
  - Start still moves to previous end.
  - End does not auto-shift; user must manually set end.

## 4. Segment Editing
- Tap any existing segment arc to open quick edit sheet.
- Quick edit supports:
  - Update text.
  - Adjust start/end via same dials.
  - Delete segment.
- Save from edit must re-validate overlap and boundary rules.

## 5. Boundary Handling
- Midnight crossing behavior:
  - If user sets a range crossing 24:00, system auto-splits into:
    - Segment A: current day `[start, 24:00]`
    - Segment B: next day `[00:00, end]`
  - Segments are linked by shared `groupId`.

## 6. Validation Rules
- End must be after start in local timeline context.
- Strict non-overlap for same mode/day timeline.
- Duplicate adjacent labels are allowed.
- Empty text is not allowed.
- Max text length: implementation-defined constant (recommended 120 chars for label, 500 for notes).

## 7. Interaction States
- Idle: no active edit.
- Draft range: dials positioned, unsaved range shown.
- Record sheet open.
- Saved state with auto-advanced defaults.
- Edit state on existing segment.

