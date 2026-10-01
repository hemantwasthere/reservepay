import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, CircleAlert, Info, LoaderCircle, X } from "lucide-react";

type ToastInput = {
  id?: string;
  title: string;
  description?: string;
  tone?: "success" | "error" | "info" | "loading";
  href?: string;
};
type Notice = ToastInput & { id: string };
const ToastContext = createContext<{
  notify: (notice: ToastInput) => string;
  dismiss: (id: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const dismiss = useCallback(
    (id: string) =>
      setNotices((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const notify = useCallback((notice: ToastInput) => {
    const id = notice.id ?? crypto.randomUUID();
    setNotices((items) =>
      [...items.filter((item) => item.id !== id), { ...notice, id }].slice(-4),
    );
    return id;
  }, []);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        className="toast-viewport"
        aria-label="Notifications"
        tabIndex={-1}
      >
        {notices.map((notice) => (
          <Toast key={notice.id} notice={notice} dismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function Toast({
  notice,
  dismiss,
}: {
  notice: Notice;
  dismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tone = notice.tone ?? "info";
  useEffect(() => {
    if (hovered || focused || tone === "loading" || tone === "error") return;
    const timer = window.setTimeout(() => dismiss(notice.id), 8000);
    return () => clearTimeout(timer);
  }, [notice, dismiss, hovered, focused, tone]);
  const Icon =
    tone === "loading"
      ? LoaderCircle
      : tone === "success"
        ? CheckCircle2
        : tone === "error"
          ? CircleAlert
          : Info;
  return (
    <div
      className={`toast toast-${tone}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <Icon
        size={19}
        aria-hidden="true"
        className={tone === "loading" ? "pending-spinner" : undefined}
      />
      <div>
        <div role={tone === "error" ? "alert" : "status"} aria-atomic="true">
          <strong>{notice.title}</strong>
          {notice.description && <p>{notice.description}</p>}
        </div>
        {notice.href && (
          <a href={notice.href} target="_blank" rel="noreferrer">
            View transaction ↗
          </a>
        )}
      </div>
      <button
        className="toast-dismiss"
        aria-label={`Dismiss ${notice.title}`}
        onClick={(event) => {
          const region =
            event.currentTarget.closest<HTMLElement>(".toast-viewport");
          if (document.activeElement === event.currentTarget) region?.focus();
          dismiss(notice.id);
        }}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("ToastProvider is required.");
  return context;
}
