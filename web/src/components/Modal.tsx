import React, { useEffect } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  onClose: () => void;
  disableBackdropClose?: boolean;
  maxWidthPx?: number;
};

export default function Modal({
  open,
  title = "Notice",
  children,
  onClose,
  disableBackdropClose = false,
  maxWidthPx = 520
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modalOverlay"
      onMouseDown={() => {
        if (!disableBackdropClose) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modalCard"
        style={{ maxWidth: maxWidthPx }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button className="modalClose" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
