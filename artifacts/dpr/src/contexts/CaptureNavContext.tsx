import { createContext, useContext, useState, ReactNode } from "react";
import { format } from "date-fns";

interface CaptureNavContextValue {
  activeDate: string | null;
  setActiveDate: (date: string | null) => void;
  activeTeamId: number | null;
  setActiveTeamId: (id: number | null) => void;
}

const CaptureNavContext = createContext<CaptureNavContextValue | null>(null);

export function CaptureNavProvider({ children }: { children: ReactNode }) {
  const [activeDate, setActiveDate] = useState<string | null>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);

  return (
    <CaptureNavContext.Provider
      value={{ activeDate, setActiveDate, activeTeamId, setActiveTeamId }}
    >
      {children}
    </CaptureNavContext.Provider>
  );
}

export function useCaptureNav() {
  const ctx = useContext(CaptureNavContext);
  if (!ctx) throw new Error("useCaptureNav must be used within CaptureNavProvider");
  return ctx;
}
