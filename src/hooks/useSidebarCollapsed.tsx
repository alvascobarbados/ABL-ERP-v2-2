import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

const KEY = "sidebar_collapsed";

interface Ctx {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const SidebarCollapsedContext = createContext<Ctx | null>(null);

export const SidebarCollapsedProvider = ({ children }: { children: ReactNode }) => {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "true"; } catch { return false; }
  });

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try { localStorage.setItem(KEY, v ? "true" : "false"); } catch {}
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <SidebarCollapsedContext.Provider value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </SidebarCollapsedContext.Provider>
  );
};

export const useSidebarCollapsed = (): Ctx => {
  const ctx = useContext(SidebarCollapsedContext);
  if (!ctx) return { collapsed: false, toggle: () => {}, setCollapsed: () => {} };
  return ctx;
};
