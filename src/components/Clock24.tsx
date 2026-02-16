import { minuteToAngle, MINUTES_PER_DAY } from '../lib/time';
import type { TimeSlot } from '../lib/types';

type Clock24Props = {
  planSlots: TimeSlot[];
  retrospectSlots: TimeSlot[];
  activeSlots: TimeSlot[];
  activeMode: 'plan' | 'retrospect';
  currentMinute: number;
  startMinute: number;
  endMinute: number;
  onStartPointerDown: () => void;
  onEndPointerDown: () => void;
  onMovePointerDown: (x: number, y: number) => void;
  onPointerMove: (x: number, y: number) => void;
  onPointerUp: () => void;
  onSegmentTap: (payload: { slotId: string; text: string; x: number; y: number }) => void;
  onRecord: () => void;
  onSegmentHover: (payload: { text: string; x: number; y: number } | null) => void;
};

const SIZE = 360;
const CENTER = SIZE / 2;
const VIEWBOX_PAD = 10;
const OUTER_RADIUS = 152;
const INNER_RADIUS = 86;
const DRAFT_RADIUS = (OUTER_RADIUS + INNER_RADIUS) / 2;
const OUTER_RING_EDGE_RADIUS = OUTER_RADIUS + 18;
const PLAN_VARIANTS = 5;
const RETRO_VARIANTS = 5;

function segmentStroke(radius: number, startMinute: number, endMinute: number): { dasharray: string; dashoffset: number } {
  const circumference = 2 * Math.PI * radius;
  const length = ((endMinute - startMinute) / MINUTES_PER_DAY) * circumference;
  return {
    dasharray: `${length} ${circumference - length}`,
    dashoffset: -(startMinute / MINUTES_PER_DAY) * circumference
  };
}

function segmentPath(radius: number, startMinute: number, endMinute: number): string {
  const start = handlePoint(startMinute, radius);
  const end = handlePoint(endMinute, radius);
  const span = endMinute - startMinute;
  const largeArc = span > MINUTES_PER_DAY / 2 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function handlePoint(minute: number, radius: number): { x: number; y: number } {
  const angle = minuteToAngle(minute);
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius
  };
}

function draftIntervals(startMinute: number, endMinute: number): Array<{ startMinute: number; endMinute: number }> {
  if (endMinute > startMinute) {
    return [{ startMinute, endMinute }];
  }
  return [
    { startMinute, endMinute: MINUTES_PER_DAY },
    { startMinute: 0, endMinute }
  ];
}

function hourLabel(hour: number): string {
  return hour === 0 ? '24' : String(hour);
}

function minuteToText(minute: number): string {
  const safe = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function Clock24({
  planSlots,
  retrospectSlots,
  activeSlots,
  activeMode,
  currentMinute,
  startMinute,
  endMinute,
  onStartPointerDown,
  onEndPointerDown,
  onMovePointerDown,
  onPointerMove,
  onPointerUp,
  onSegmentTap,
  onRecord,
  onSegmentHover
}: Clock24Props): JSX.Element {
  const start = handlePoint(startMinute, DRAFT_RADIUS);
  const end = handlePoint(endMinute, DRAFT_RADIUS);
  const nowOuter = handlePoint(currentMinute, OUTER_RING_EDGE_RADIUS);
  const span = ((endMinute - startMinute) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const mid = handlePoint((startMinute + span / 2) % MINUTES_PER_DAY, DRAFT_RADIUS);
  const planRadius = activeMode === 'plan' ? OUTER_RADIUS : INNER_RADIUS;
  const retroRadius = activeMode === 'retrospect' ? OUTER_RADIUS : INNER_RADIUS;
  const activeRadius = activeMode === 'plan' ? planRadius : retroRadius;

  return (
    <svg
      className="clock"
      viewBox={`${-VIEWBOX_PAD} ${-VIEWBOX_PAD} ${SIZE + VIEWBOX_PAD * 2} ${SIZE + VIEWBOX_PAD * 2}`}
      onPointerMove={(event) => onPointerMove(event.clientX, event.clientY)}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <circle cx={CENTER} cy={CENTER} r={170} className="clock-face" />

      <circle cx={CENTER} cy={CENTER} r={planRadius} className="ring-base plan-base" />
      {planSlots.map((slot, index) => {
        const path = segmentPath(planRadius, slot.startMinute, slot.endMinute);
        const variant = index % PLAN_VARIANTS;
        return (
          <path
            key={`plan-${slot.id}`}
            d={path}
            className={`ring-segment plan-covered plan-variant-${variant}`}
            onPointerEnter={(e) =>
              onSegmentHover({ text: `${slot.label} (${minuteToText(slot.startMinute)}-${minuteToText(slot.endMinute)})`, x: e.clientX, y: e.clientY })
            }
            onPointerMove={(e) =>
              onSegmentHover({ text: `${slot.label} (${minuteToText(slot.startMinute)}-${minuteToText(slot.endMinute)})`, x: e.clientX, y: e.clientY })
            }
            onPointerLeave={() => onSegmentHover(null)}
          />
        );
      })}

      <circle cx={CENTER} cy={CENTER} r={retroRadius} className="ring-base retro-base" />
      {retrospectSlots.map((slot, index) => {
        const path = segmentPath(retroRadius, slot.startMinute, slot.endMinute);
        const variant = index % RETRO_VARIANTS;
        return (
          <path
            key={`retro-${slot.id}`}
            d={path}
            className={`ring-segment retro-covered retro-variant-${variant}`}
            onPointerEnter={(e) =>
              onSegmentHover({ text: `${slot.label} (${minuteToText(slot.startMinute)}-${minuteToText(slot.endMinute)})`, x: e.clientX, y: e.clientY })
            }
            onPointerMove={(e) =>
              onSegmentHover({ text: `${slot.label} (${minuteToText(slot.startMinute)}-${minuteToText(slot.endMinute)})`, x: e.clientX, y: e.clientY })
            }
            onPointerLeave={() => onSegmentHover(null)}
          />
        );
      })}

      {activeSlots.map((slot) => {
        const path = segmentPath(activeRadius, slot.startMinute, slot.endMinute);
        const text = `${slot.label} (${minuteToText(slot.startMinute)}-${minuteToText(slot.endMinute)})`;
        return (
          <path
            key={`active-${slot.id}`}
            d={path}
            className="ring-hit"
            onPointerEnter={(e) => onSegmentHover({ text, x: e.clientX, y: e.clientY })}
            onPointerMove={(e) => onSegmentHover({ text, x: e.clientX, y: e.clientY })}
            onPointerLeave={() => onSegmentHover(null)}
            onClick={(e) => onSegmentTap({ slotId: slot.id, text, x: e.clientX, y: e.clientY })}
          />
        );
      })}

      {draftIntervals(startMinute, endMinute).map((draft, index) => {
        const stroke = segmentStroke(DRAFT_RADIUS, draft.startMinute, draft.endMinute);
        return (
          <circle
            key={`draft-${index}`}
            cx={CENTER}
            cy={CENTER}
            r={DRAFT_RADIUS}
            className="draft-segment"
            strokeDasharray={stroke.dasharray}
            strokeDashoffset={stroke.dashoffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        );
      })}

      {Array.from({ length: 24 }).map((_, hour) => {
        const point = handlePoint(hour * 60, 182);
        return (
          <text key={`hour-${hour}`} x={point.x} y={point.y} className="hour-label" textAnchor="middle" dominantBaseline="middle">
            {hourLabel(hour)}
          </text>
        );
      })}

      <circle
        cx={start.x}
        cy={start.y}
        r={11}
        className="dial dial-start"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onStartPointerDown();
        }}
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={11}
        className="dial dial-end"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onEndPointerDown();
        }}
      />
      <circle
        cx={mid.x}
        cy={mid.y}
        r={8}
        className="dial dial-move"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onMovePointerDown(event.clientX, event.clientY);
        }}
      />
      <line x1={CENTER} y1={CENTER} x2={nowOuter.x} y2={nowOuter.y} className="now-ray-under" />
      <line x1={CENTER} y1={CENTER} x2={nowOuter.x} y2={nowOuter.y} className="now-ray" />
      <g role="button" aria-label="Record segment" onClick={onRecord}>
        <circle cx={CENTER} cy={CENTER} r={18} className="record-ring" />
        <circle cx={CENTER} cy={CENTER} r={10} className="record-core" />
      </g>
    </svg>
  );
}
