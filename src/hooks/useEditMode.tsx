import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";

interface EditModeCtx {
  /** Card id currently in edit mode, or null. */
  activeId: string | null;
  enter: (cardId: string) => void;
  exit: () => void;
}

const Ctx = createContext<EditModeCtx | null>(null);

export const EditModeProvider = ({ children }: { children: ReactNode }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const enter = useCallback((cardId: string) => setActiveId(cardId), []);
  const exit = useCallback(() => setActiveId(null), []);

  // Lock body scroll while in edit mode.
  useEffect(() => {
    if (!activeId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [activeId]);

  return (
    <Ctx.Provider value={{ activeId, enter, exit }}>
      {children}
      {activeId && (
        <div
          className="fixed inset-0 z-[40] bg-black/10 animate-fade-in"
          onClick={exit}
          aria-hidden
        />
      )}
    </Ctx.Provider>
  );
};

export const useEditMode = (): EditModeCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) return { activeId: null, enter: () => {}, exit: () => {} };
  return ctx;
};
