import type { ReactNode } from 'react';

// Eigenes Modal statt confirm()/alert()/prompt().
// Native Dialoge werden in eingebetteten Ansichten teils
// unterdrückt (Projektanweisung) – daher immer dieses hier.

interface Props {
  open: boolean;
  title?: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel: () => void;
}

export function Modal({
  open,
  title,
  children,
  confirmLabel = 'OK',
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="modal-title">{title}</h3>}
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          {cancelLabel && (
            <button className="btn ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            className="btn primary"
            onClick={() => {
              onConfirm?.();
              if (!onConfirm) onCancel();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
