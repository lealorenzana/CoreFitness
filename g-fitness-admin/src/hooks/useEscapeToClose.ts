import { useEffect, useRef } from 'react';

/**
 * Escape closes the topmost open dialog — and only that one.
 *
 * Dialogs stack (a confirm over a form), and window listeners fire in the order
 * they were added, so without this one key press closed the form underneath as
 * well as the confirm. Each open dialog takes a place on a stack; only the top
 * of it answers.
 */
const stack: number[] = [];
let nextId = 1;

export function useEscapeToClose(isOpen: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const id = nextId++;
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const at = stack.indexOf(id);
      if (at !== -1) stack.splice(at, 1);
    };
  }, [isOpen]);
}
