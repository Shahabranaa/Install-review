import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type DurationFormat = "compact" | "verbose";

interface SettingsContextValue {
  durationFormat: DurationFormat;
  setDurationFormat: (f: DurationFormat) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const STORAGE_KEY = "wf_duration_format";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [durationFormat, setDurationFormatState] = useState<DurationFormat>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "verbose" ? "verbose" : "compact";
  });

  function setDurationFormat(f: DurationFormat) {
    localStorage.setItem(STORAGE_KEY, f);
    setDurationFormatState(f);
  }

  return (
    <SettingsContext.Provider value={{ durationFormat, setDurationFormat }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
