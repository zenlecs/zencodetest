import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("zenos-theme-v2") as Theme;
      if (stored === "light" || stored === "dark") return stored;
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("zenos-theme-v2", theme);

    // Broadcast theme change via IPC for multi-window sync
    if (typeof window !== "undefined" && (window as any).electron) {
      try {
        (window as any).electron.send("theme-sync", theme);
      } catch (e) {
        console.error("IPC theme sync failed:", e);
      }
    }
  }, [theme]);

  useEffect(() => {
    // Listen for theme updates from other windows via IPC
    if (typeof window !== "undefined" && (window as any).electron) {
      const handleThemeUpdate = (newTheme: Theme) => {
        setThemeState(newTheme);
      };
      
      try {
        (window as any).electron.receive("theme-updated", handleThemeUpdate);
        return () => {
          (window as any).electron.removeListener("theme-updated", handleThemeUpdate);
        };
      } catch (e) {
        console.error("IPC theme sync listener failed:", e);
      }
    }
  }, []);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
