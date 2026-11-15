import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// How many modals are open — the page behind stays unscrollable until the last closes.
let openModals = 0;

/**
 * Accessible dialog (WAI-ARIA dialog pattern): announced as a modal dialog
 * with its title, focus moves inside when it opens, Tab / Shift+Tab stay
 * inside, Escape closes, and focus returns to the control that opened it.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.hasAttribute('data-focus-skip'));

    // The first field of the BODY, else the dialog itself — never a footer
    // button, so Enter on a fresh "Delete?" dialog cannot confirm by accident.
    const firstField = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (firstField ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || !panel.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (active === lastItem || !panel.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    openModals += 1;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.body.style.overflow = '';
      // Back to where the admin was (if that control is still on the page).
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Modal panel */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          tabIndex={-1}
          className={`
            inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all
            sm:my-8 sm:align-middle sm:w-full ${sizes[size]} focus:outline-none
          `}
        >
          {title && (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 id={titleId} className="text-lg font-medium text-gray-900">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-500 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
          )}
          <div ref={bodyRef} className="px-6 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
          {footer && <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">{footer}</div>}
        </div>
      </div>
    </div>
  );
};
