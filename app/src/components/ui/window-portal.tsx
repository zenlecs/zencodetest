import { useEffect, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/theme-provider";

interface WindowPortalProps {
  children: ReactNode;
  onClose: () => void;
  title?: string;
}

export function WindowPortal({ children, onClose, title = "ZenOS Window" }: WindowPortalProps) {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Open a new window using the browser's native window.open
    // Set minWidth to 60% (720px) and minHeight to 50% (400px) of the initial size (1200x800)
    const features = "width=1200,height=800,minWidth=720,minHeight=400,frame=no,transparent=yes";
    const externalWindow = window.open("", "", features);
    
    if (externalWindow) {
      externalWindow.document.title = title;
      externalWindow.document.body.style.backgroundColor = "transparent";
      externalWindow.document.documentElement.style.backgroundColor = "transparent";
      
      // Copy all styles from the main window
      const stylesheets = Array.from(document.styleSheets);
      stylesheets.forEach((styleSheet) => {
        try {
          if (styleSheet.href) {
            const newStyle = externalWindow.document.createElement("link");
            newStyle.rel = "stylesheet";
            newStyle.href = styleSheet.href;
            externalWindow.document.head.appendChild(newStyle);
          } else if (styleSheet.cssRules) {
            const newStyle = externalWindow.document.createElement("style");
            Array.from(styleSheet.cssRules).forEach((rule) => {
              newStyle.appendChild(externalWindow.document.createTextNode(rule.cssText));
            });
            externalWindow.document.head.appendChild(newStyle);
          }
        } catch (e) {
          console.error("Could not copy stylesheet rules", e);
        }
      });

      // Synchronize dark mode
      if (document.documentElement.classList.contains("dark")) {
        externalWindow.document.documentElement.classList.add("dark");
      }

      // Create a root container div that mimics the main app's styling context
      const container = externalWindow.document.createElement("div");
      container.className = "w-full h-full text-foreground"; 
      externalWindow.document.body.appendChild(container);
      
      setContainerEl(container);

      // Listen for window close
      externalWindow.addEventListener("beforeunload", () => {
        onClose();
      });
    } else {
      console.error("Failed to open external window. Popup blocker might be active.");
      onClose();
    }

    return () => {
      externalWindow?.close();
    };
  }, [onClose, title]);

  // Sync theme changes dynamically
  const { theme } = useTheme();
  useEffect(() => {
    if (containerEl) {
      const extWin = containerEl.ownerDocument.defaultView;
      if (extWin) {
        if (theme === "dark") {
          extWin.document.documentElement.classList.add("dark");
        } else {
          extWin.document.documentElement.classList.remove("dark");
        }
      }
    }
  }, [theme, containerEl]);

  if (!containerEl) return null;
  return createPortal(children, containerEl);
}
