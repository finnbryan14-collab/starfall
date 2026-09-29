'use client';

import { useEffect, useId, useRef } from 'react';

import { prefersReducedMotion } from '@/motion';

import styles from './BottomSheet.module.css';

/**
 * Bottom sheet for editing income assumptions, importing and settings.
 * Rounded top corners, drag handle, focus trapped (DESIGN.md).
 *
 * Built on <dialog>, which gives the top layer, the backdrop, Escape-to-close
 * and focus containment from the platform rather than from hand-written
 * keyboard code.
 */
export type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Escape and the backdrop both route through the dialog's own close event,
    // so the parent's state stays in step however it was dismissed.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby={titleId}
      data-reduced={prefersReducedMotion() || undefined}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className={styles.inner}>
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.head}>
          <h2 className={styles.title} id={titleId}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Done
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
