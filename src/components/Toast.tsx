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

interface PushToastOptions {
  /** Override the default auto-dismiss duration. */
  durationMs?: number;
}

interface ToastContextValue {
  pushToast: (message: string, opts?: PushToastOptions) => void;
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

  const pushToast = useCallback((message: string, opts?: PushToastOptions) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, opts?.durationMs ?? TOAST_LIFETIME_MS);
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
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      role="status"
      className={
        'pointer-events-auto bg-ink px-4 py-2.5 font-mono text-[12px] tracking-tight text-paper ' +
        'shadow-[0_8px_24px_rgba(17,17,16,0.18)] ' +
        'motion-safe:transition motion-safe:duration-200 ' +
        (shown ? 'opacity-100 translate-y-0' : 'opacity-0 motion-safe:translate-y-2')
      }
    >
      {message}
    </div>
  );
}
