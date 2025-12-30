import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export type Tint = string;

export interface PreferencesState {
  theme: Theme;
  tint: Tint;
  crtMode: boolean;
  matrixBg: boolean;
  fontSize: string;
}

export interface PreferencesActions {
  setTheme: (theme: Theme) => void;
  setTint: (tint: Tint) => void;
  setCrtMode: (enabled: boolean) => void;
  setMatrixBg: (enabled: boolean) => void;
  setFontSize: (size: string) => void;
  toggleTheme: () => void;
  toggleCrtMode: () => void;
  toggleMatrixBg: () => void;
}

export function usePreferences(): PreferencesState & PreferencesActions {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('chat-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  const [tint, setTint] = useState<Tint>(() => {
    return localStorage.getItem('chat-tint') || 'green';
  });

  const [crtMode, setCrtMode] = useState<boolean>(() => {
    return localStorage.getItem('chat-crt') === 'true';
  });

  const [matrixBg, setMatrixBg] = useState<boolean>(() => {
    return localStorage.getItem('chat-matrix') === 'true';
  });

  const [fontSize, setFontSize] = useState<string>(() => {
    return localStorage.getItem('chat-font-size') || '14px';
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('chat-theme', theme);
    localStorage.setItem('chat-tint', tint);
    localStorage.setItem('chat-crt', String(crtMode));
    localStorage.setItem('chat-matrix', String(matrixBg));
    localStorage.setItem('chat-font-size', fontSize);
  }, [theme, tint, crtMode, matrixBg, fontSize]);

  // Apply theme to body
  useEffect(() => {
    document.body.className = `theme-${theme} tint-${tint}${crtMode ? ' crt-mode' : ''}`;
  }, [theme, tint, crtMode]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleCrtMode = () => setCrtMode(!crtMode);
  const toggleMatrixBg = () => setMatrixBg(!matrixBg);

  return {
    theme,
    tint,
    crtMode,
    matrixBg,
    fontSize,
    setTheme,
    setTint,
    setCrtMode,
    setMatrixBg,
    setFontSize,
    toggleTheme,
    toggleCrtMode,
    toggleMatrixBg
  };
}
