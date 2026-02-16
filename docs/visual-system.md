# 24-Hour Clock Planner/Retrospect Visual System

## 1. Core Visual Principle
Mode clarity must be obvious without reading text.  
Use dual cues:
- Background/card tint by active mode context.
- Clock accents and segment styling by state/mode.
- Non-color badges/labels for accessibility and redundancy.

## 2. Fixed Ring Semantics
- Outer ring: Plan coverage (always).
- Inner ring: Retrospect coverage (always).
- Semantics do not swap by active mode.

## 3. Dial Color Semantics
- Start dial: sunrise orange/yellow range.
- End dial: twilight blue/slate range.
- Active draft arc between dials uses blended accent with high contrast edge.

## 4. Mode Surfaces
- Plan-active context:
  - Light cool tint background.
  - Plan badge emphasized.
- Retrospect-active context:
  - Light warm-neutral tint background.
  - Retrospect badge emphasized.

## 5. Segment State Palette (Tokenized)
Define token names; exact hex values chosen during UI implementation with contrast checks.

- `--plan-covered`
- `--plan-uncovered`
- `--retro-covered`
- `--retro-uncovered`
- `--segment-active`
- `--segment-editing`
- `--dial-start`
- `--dial-end`
- `--text-primary`
- `--text-secondary`
- `--surface-plan`
- `--surface-retro`

## 6. Accessibility Requirements
- Minimum contrast for text/icons:
  - 4.5:1 normal text.
  - 3:1 large text and non-text essential indicators.
- Color is never the only status signal:
  - Use labels, badges, and ring legends.
- Minimum touch target: 44x44 px.

## 7. Clock Legibility Rules
- Keep hour labels clear at small mobile widths.
- Keep ring thickness and spacing sufficient to distinguish inner/outer states.
- Selected/active segment must remain visually dominant over saved background segments.

