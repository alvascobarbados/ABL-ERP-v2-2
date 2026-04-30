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
    const prevTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = prev;
      document.body.style.touchAction = prevTouchAction;
    };
  }, [activeId]);

  return (
    <Ctx.Provider value={{ activeId, enter, exit }}>
      {children}
      {activeId && (
        <div
          className="pointer-events-none fixed inset-0 z-[40] bg-black/60 backdrop-blur-[2px] animate-fade-in"
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
