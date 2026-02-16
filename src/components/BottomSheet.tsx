import { useEffect, useState } from 'react';

type BottomSheetProps = {
  open: boolean;
  title: string;
  prompt: string;
  initialLabel: string;
  initialNotes: string;
  submitLabel: string;
  error?: string;
  isEditing?: boolean;
  onSubmit: (payload: { label: string; notes: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
};

export function BottomSheet({
  open,
  title,
  prompt,
  initialLabel,
  initialNotes,
  submitLabel,
  error,
  isEditing,
  onSubmit,
  onDelete,
  onClose
}: BottomSheetProps): JSX.Element | null {
  const [label, setLabel] = useState(initialLabel);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    if (open) {
      setLabel(initialLabel);
      setNotes(initialNotes);
    }
  }, [open, initialLabel, initialNotes]);

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
          onSubmit({ label: label.trim(), notes: notes.trim() });
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
          {isEditing && onDelete && (
            <button type="button" className="ghost" onClick={onDelete}>
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
