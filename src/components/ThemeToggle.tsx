'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    queueMicrotask(() => {
      setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    });
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('radyframes-theme', next);
    setTheme(next);
  }

  return (
    <button className="themeToggle" type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'Editorial' : 'Midnight'} theme`} aria-pressed={theme === 'light'}>
      <span className="themeToggleTrack" aria-hidden="true">
        <span className="themeToggleIcon">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24"><path d="M19.2 15.1A8.1 8.1 0 0 1 8.9 4.8 8.3 8.3 0 1 0 19.2 15.1Z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
          )}
        </span>
      </span>
      <span className="themeToggleLabel">{theme === 'dark' ? 'MIDNIGHT' : 'EDITORIAL'}</span>
    </button>
  );
}
