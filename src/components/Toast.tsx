import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Minimal toast queue.
 *
 * - State-based stack rendered at the bottom-right of the viewport.
 * - Each toast auto-dismisses after 1.2s.
 * - Exposes `pushToast(message)` via context so any descendant of
 *   `<ToastProvider>` can fire a toast without prop drilling.
 *
 * Animations honor `prefers-reduced-motion` via Tailwind's `motion-safe:`
 * variant — the entrance animation is skipped for users with reduced motion.
 */

interface ToastEntry {
  id: number;
  message: string;
}

interface ToastContextValue {
  pushToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback so leaf components don't crash if rendered outside a
    // provider (e.g., in isolation in a test harness).
    return { pushToast: () => {} };
  }
  return ctx;
}

const TOAST_LIFETIME_MS = 1200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const pushToast = useCallback((message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message }]);
    // Auto-dismiss
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastStack({ toasts }: { toasts: ToastEntry[] }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
    >
      {toasts.map(t => (
        <ToastBubble key={t.id} message={t.message} />
      ))}
    </div>
  );
}

function ToastBubble({ message }: { message: string }) {
  // Brief mount animation hook so the bubble fades in cleanly.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      role="status"
      className={
        'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white shadow-lg ' +
        'motion-safe:transition motion-safe:duration-150 ' +
        (shown ? 'opacity-100 translate-y-0' : 'opacity-0 motion-safe:translate-y-2')
      }
    >
      {message}
    </div>
  );
}
