# 24-Hour Clock Planner/Retrospect Product Spec

## 1. Product Goal
Build a mobile-first web app where the first visible element is a 24-hour clock.  
The app supports two daily workflows:
- Plan upcoming activities in contiguous time slots.
- Retrospect completed activities in contiguous time slots.

The user should be able to rapidly fill an entire day (or most of it) with minimal friction.

## 2. Primary User Jobs
- At the start of a day:
  - Retrospect yesterday.
  - Plan today.
- At the end of a day:
  - Retrospect today.
  - Plan tomorrow.

## 3. First-Load Experience
- First screen shows:
  - 24-hour analog clock (always visible).
  - Dual mode context cues (Plan and Retrospect visibility).
  - Active mode panel and day selector.
- User lands into a dual-context home:
  - Retrospect target day (default: yesterday).
  - Plan target day (default: today).

## 4. Core Features (v1)
- 24-hour radial time selection with 5-minute granularity.
- Dual independent dials:
  - Start dial.
  - End dial.
- Record flow:
  - Set start and end.
  - Tap `Record`.
  - Fill bottom sheet text.
  - Save as segment.
- Segment edit flow:
  - Tap segment.
  - Quick edit sheet with text/time update/delete.
- Coverage visibility:
  - Planned and retrospected coverage shown simultaneously via concentric rings.

## 5. Constraints and Rules
- Mobile-first interaction and layout.
- No overlap in saved segments within the same day/mode timeline.
- Contiguous workflow default after save:
  - New start defaults to previous segment end.
  - New end defaults using previous duration only if valid.
  - If invalid, end must be manually selected.
- Midnight crossing is allowed but auto-split into adjacent days.

## 6. Non-Goals (v1)
- Multi-user collaboration.
- Cloud sync or account auth.
- Push notifications.
- AI recommendations for tasks.

## 7. Success Criteria
- User can create a full-day plan quickly through chained entries.
- User can retrospect an entire day with the same interaction model.
- At all times user can visually identify:
  - Planned vs unplanned time.
  - Retrospected vs not-retrospected time.

