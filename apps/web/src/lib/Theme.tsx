import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type Theme = "system" | "light" | "dark";
const key = "reservepay.theme";
export const validTheme = (value: string | null): Theme =>
  value === "light" || value === "dark" ? value : "system";
const ThemeContext = createContext({
  resolvedTheme: "light" as "light" | "dark",
  theme: "system" as Theme,
  setTheme: (_: Theme) => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);
  // Match the prerender; the head script already applies the palette before paint.
  const [theme, updateTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      updateTheme(validTheme(localStorage.getItem(key)));
    } catch {}
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === key || event.key === null)
        updateTheme(validTheme(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      setResolvedTheme(dark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#181c18" : "#f6f7f2");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, ready]);
  const setTheme = useCallback((next: Theme) => {
    updateTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {}
  }, []);
  useEffect(() => {
    // One listener at the provider keeps hidden, mounted pages from cycling twice.
    const cycleTheme = (event: KeyboardEvent) => {
      if (
        !ready ||
        event.code !== "KeyT" ||
        !event.altKey ||
        !event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.repeat ||
        event.isComposing ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"][data-state="open"]') ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]',
          ))
      )
        return;
      try {
        if (localStorage.getItem("reservepay.shortcuts") === "off") return;
      } catch {}
      event.preventDefault();
      setTheme(
        theme === "system" ? "light" : theme === "light" ? "dark" : "system",
      );
    };
    window.addEventListener("keydown", cycleTheme);
    return () => window.removeEventListener("keydown", cycleTheme);
  }, [ready, theme, setTheme]);
  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeControl() {
  const { theme, setTheme } = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          aria-label={`Appearance: ${theme}`}
          title="Appearance (Alt + Shift + T)"
          aria-keyshortcuts="Alt+Shift+T"
        >
          <Icon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-40 rounded-lg p-1.5 shadow-sm"
        aria-label="Appearance"
      >
        <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
          Appearance
        </p>
        <div role="group" aria-label="Color theme">
          {(
            [
              { value: "system", label: "System", icon: Monitor },
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
            ] as const
          ).map(({ value, label, icon: OptionIcon }) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className="w-full justify-start gap-2.5 rounded-md px-2 text-xs font-normal"
            >
              <OptionIcon className="size-3.5 text-muted-foreground" />
              {label}
              {theme === value && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </Button>
          ))}
        </div>
        <p className="mt-1 border-t border-border px-2 pt-2 pb-1 text-[9px] text-muted-foreground">
          Alt + Shift + T to cycle
        </p>
      </PopoverContent>
    </Popover>
  );
}
