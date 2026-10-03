import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
type ToastInput = {
  id?: string;
  title: string;
  description?: string;
  tone?: "success" | "error" | "info" | "loading";
  href?: string;
};
const ToastContext = createContext<{
  notify: (notice: ToastInput) => string;
  dismiss: (id: string) => void;
} | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const dismiss = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);
  const notify = useCallback((notice: ToastInput) => {
    const id = notice.id ?? crypto.randomUUID();
    toast[notice.tone ?? "info"](notice.title, {
      id,
      description: notice.description,
      duration:
        notice.tone === "error" || notice.tone === "loading" ? Infinity : 8000,
      action: notice.href
        ? {
            label: "View transaction ↗",
            onClick: () =>
              window.open(notice.href, "_blank", "noopener,noreferrer"),
          }
        : undefined,
    });
    return id;
  }, []);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        visibleToasts={4}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "pointer-events-auto flex w-full items-start gap-3 rounded border border-border bg-card p-4 font-sans text-foreground shadow-lg",
            title: "text-[13px] font-medium",
            description: "mt-1 text-xs leading-relaxed text-muted-foreground",
            closeButton:
              "absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground",
            actionButton: "rounded bg-secondary px-2 py-1 text-xs text-primary",
            success: "border-[light-dark(#b9cdb0,var(--border))] [&_[data-icon]]:text-primary",
            error: "border-[light-dark(#e0b7a9,var(--border))] [&_[data-icon]]:text-destructive",
            info: "border-[light-dark(#c5d9e5,var(--border))] [&_[data-icon]]:text-[light-dark(#406984,var(--info))]",
            loading: "[&_[data-icon]]:text-primary",
          },
        }}
      />
    </ToastContext.Provider>
  );
}
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("ToastProvider is required.");
  return context;
}
