# 24-Hour Clock Planner/Retrospect Test Plan

## 1. Unit Tests
- Angle/minute conversion:
  - Convert dial angle to minute index on 24-hour circle.
  - Round/snap to nearest 5-minute increment.
- Range utilities:
  - Validate `start < end`.
  - Detect overlap with existing slots.
  - Sort and normalize slots.
- Auto-advance:
  - Apply `newStart = prevEnd`.
  - Apply duration-based `newEnd` only when valid.
  - Fallback to manual end when invalid.
- Midnight split:
  - Input cross-midnight range emits two slots with shared `groupId`.

## 2. Integration Tests
- Dial placement + Record flow:
  - Start/end set.
  - Record opens bottom sheet.
  - Submit saves slot and updates rings.
- Edit flow:
  - Tap segment opens quick edit.
  - Update time/text persists and re-renders correctly.
  - Delete removes segment and coverage updates.
- Validation flow:
  - Overlap attempts blocked with clear error.
  - Empty label blocked.

## 3. Mobile E2E Scenarios
- Scenario A: Morning ritual
  - Retrospect yesterday continuously.
  - Plan today continuously.
  - Verify both coverage rings visible throughout.
- Scenario B: Evening ritual
  - Retrospect today.
  - Plan tomorrow.
  - Verify default day selectors.
- Scenario C: Boundary
  - Create 23:00-01:00 segment.
  - Verify two-day split and linked group behavior.

## 4. Acceptance Criteria
- User can chain entries quickly without re-entering start each time.
- User can always see planned and retrospected coverage simultaneously.
- Coverage and timeline remain correct after reload (local persistence).
- All major interactions are fully usable on mobile viewport widths.

