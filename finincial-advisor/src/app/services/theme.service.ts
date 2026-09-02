import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'finmate_theme_preference';

  // Initialize theme signal
  readonly currentTheme = signal<ThemeMode>(this.getInitialTheme());

  // Computed helper
  readonly isDark = computed(() => this.currentTheme() === 'dark');

  constructor() {
    // Apply theme whenever it changes
    effect(() => {
      const theme = this.currentTheme();
      this.applyTheme(theme);
    });

    // Listen to system preference changes if user hasn't explicitly set preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) {
          this.setTheme(e.matches ? 'dark' : 'light', false);
        }
      });
    }
  }

  toggleTheme(): void {
    const nextTheme: ThemeMode = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme, true);
  }

  setTheme(theme: ThemeMode, persist = true): void {
    this.currentTheme.set(theme);
    if (persist && typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, theme);
    }
  }

  private getInitialTheme(): ThemeMode {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY) as ThemeMode | null;
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }

      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }
    // Default to enterprise dark mode for cutting-edge fintech feel
    return 'dark';
  }

  private applyTheme(theme: ThemeMode): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', theme);
    root.classList.remove('light-theme', 'dark-theme');
    root.classList.add(`${theme}-theme`);

    body.classList.remove('light-theme', 'dark-theme');
    body.classList.add(`${theme}-theme`);

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#0B0F19' : '#F8FAFC');
    }
  }
}
