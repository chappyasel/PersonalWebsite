"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type FontOption = "georgia" | "system" | "literata";

interface FontContextType {
  font: FontOption;
  setFont: (font: FontOption) => void;
  mounted: boolean;
}

const FontContext = createContext<FontContextType | undefined>(undefined);

const FONT_STORAGE_KEY = "font-preference";
const DEFAULT_FONT: FontOption = "georgia";
const VALID_FONTS: FontOption[] = ["georgia", "system", "literata"];

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = useState<FontOption>(() => {
    if (typeof document === "undefined") return DEFAULT_FONT;
    const prepaintFont = document.documentElement.dataset.font as
      | FontOption
      | undefined;
    return prepaintFont && VALID_FONTS.includes(prepaintFont)
      ? prepaintFont
      : DEFAULT_FONT;
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(FONT_STORAGE_KEY) as FontOption | null;
    if (stored && VALID_FONTS.includes(stored)) {
      setFontState(stored);
      document.documentElement.dataset.font = stored;
    }
    setMounted(true);
  }, []);

  const setFont = useCallback((newFont: FontOption) => {
    setFontState(newFont);
    document.documentElement.dataset.font = newFont;
    localStorage.setItem(FONT_STORAGE_KEY, newFont);
  }, []);

  return (
    <FontContext.Provider value={{ font, setFont, mounted }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFont() {
  const context = useContext(FontContext);
  if (context === undefined) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
