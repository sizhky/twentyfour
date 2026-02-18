import { useEffect, useState } from 'react';

type BottomSheetProps = {
  open: boolean;
  title: string;
  prompt: string;
  initialLabel: string;
  initialNotes: string;
  initialStartMinute: number;
  initialEndMinute: number;
  submitLabel: string;
  error?: string;
  isEditing?: boolean;
  onSubmit: (payload: { label: string; notes: string; startMinute: number; endMinute: number }) => void;
  onSupersede?: () => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function BottomSheet({
  open,
  title,
  prompt,
  initialLabel,
  initialNotes,
  initialStartMinute,
  initialEndMinute,
  submitLabel,
  error,
  isEditing,
  onSubmit,
  onSupersede,
  onDelete,
  onClose
}: BottomSheetProps): JSX.Element | null {
  const [label, setLabel] = useState(initialLabel);
  const [notes, setNotes] = useState(initialNotes);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setNotes(initialNotes);
      setStartTime(minuteToTime(initialStartMinute));
      setEndTime(minuteToTime(initialEndMinute));
    }
  }, [open, initialLabel, initialNotes, initialStartMinute, initialEndMinute]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation">
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            label: label.trim(),
            notes: notes.trim(),
            startMinute: timeToMinute(startTime),
            endMinute: timeToMinute(endTime)
          });
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{prompt}</p>
        {!!error && <p className="sheet-error">{error}</p>}
        <label>
          Activity
          <input
            autoFocus
            type="text"
            maxLength={120}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Task A"
          />
        </label>
        <label>
          Start / End
          <div className="time-row">
            <input type="time" step={300} value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <input type="time" step={300} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </div>
        </label>
        <label>
          Notes (optional)
          <textarea
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Any detail to remember"
          />
        </label>
        <div className="sheet-actions">
          {isEditing && onSupersede && (
            <button type="button" className="warn" onClick={onSupersede}>
              Supersede
            </button>
          )}
          {isEditing && onDelete && (
            <button type="button" className="danger" onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function minuteToTime(minute: number): string {
  const safe = ((minute % 1440) + 1440) % 1440;
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToMinute(value: string): number {
  const [h, m] = value.split(':').map((v) => Number(v));
  return (h || 0) * 60 + (m || 0);
}
