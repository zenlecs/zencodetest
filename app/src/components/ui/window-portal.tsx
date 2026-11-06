import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/theme-provider";

interface WindowPortalProps {
  children: ReactNode;
  target: Window;
  onClose: () => void;
}

const WINDOW_FEATURES = "width=1200,height=800,minWidth=720,minHeight=400";

export function openDetachedWindow(title: string): Window | null {
  const externalWindow = window.open("", "", WINDOW_FEATURES);
  if (!externalWindow) return null;

  externalWindow.document.title = title;
  externalWindow.document.body.style.margin = "0";
  externalWindow.document.body.style.backgroundColor = "transparent";
  externalWindow.document.documentElement.style.backgroundColor = "transparent";
  externalWindow.document.documentElement.style.height = "100%";
  externalWindow.document.body.style.height = "100%";

  Array.from(document.styleSheets).forEach((styleSheet) => {
    try {
      if (styleSheet.href) {
        const link = externalWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = styleSheet.href;
        externalWindow.document.head.appendChild(link);
        return;
      }
      const style = externalWindow.document.createElement("style");
      Array.from(styleSheet.cssRules).forEach((rule) => {
        style.appendChild(externalWindow.document.createTextNode(rule.cssText));
      });
      externalWindow.document.head.appendChild(style);
    } catch {
      // Vite'ın bazı stil sayfaları kuralları okumaya izin vermez.
    }
  });

  if (document.documentElement.classList.contains("dark")) {
    externalWindow.document.documentElement.classList.add("dark");
  }

  return externalWindow;
}

export function WindowPortal({ children, target, onClose }: WindowPortalProps) {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const { theme } = useTheme();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = target.document.createElement("div");
    container.className = "h-full w-full text-foreground";
    target.document.body.appendChild(container);
    setContainerEl(container);

    let closedByUs = false;
    const handleClose = () => {
      if (!closedByUs) onCloseRef.current();
    };
    target.addEventListener("beforeunload", handleClose);

    return () => {
      closedByUs = true;
      target.removeEventListener("beforeunload", handleClose);
      container.remove();
      if (!target.closed) target.close();
    };
  }, [target]);

  useEffect(() => {
    if (theme === "dark") {
      target.document.documentElement.classList.add("dark");
    } else {
      target.document.documentElement.classList.remove("dark");
    }
  }, [target, theme]);

  if (!containerEl) return null;
  return createPortal(children, containerEl);
}
