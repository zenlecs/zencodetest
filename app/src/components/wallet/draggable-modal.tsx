import { useState, useRef, useEffect, ReactNode } from "react";
import { X, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DraggableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  initialPosition?: { x: number; y: number };
  variant?: "send" | "receive";
}

export function DraggableModal({
  isOpen,
  onClose,
  title,
  children,
  initialPosition = { x: 100, y: 100 },
  variant = "send",
}: DraggableModalProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const initialPositionRef = useRef(initialPosition);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setPosition(initialPositionRef.current);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - (modalRef.current?.offsetWidth || 320);
      const maxY = window.innerHeight - (modalRef.current?.offsetHeight || 400);
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!modalRef.current) return;
    
    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setIsDragging(true);
  };

  if (!isOpen) return null;

  const gradientStyle = variant === "send" 
    ? 'linear-gradient(150deg, #0a0a0c 0%, #0d1117 50%, #0a0a0c 100%)'
    : 'linear-gradient(150deg, #0a0a0c 0%, #0d1117 50%, #0a0a0c 100%)';
  
  const headerGradient = variant === "send"
    ? 'linear-gradient(90deg, #1a365d 0%, #1e40af 100%)'
    : 'linear-gradient(90deg, #064e3b 0%, #047857 100%)';

  return (
    <div
      ref={modalRef}
      className="fixed z-50 w-80 rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        userSelect: isDragging ? "none" : "auto",
        background: gradientStyle,
      }}
      data-testid={`modal-${variant}`}
    >
      <div
        className="flex items-center justify-between p-4 text-white cursor-move border-b border-white/10"
        style={{ background: headerGradient }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="w-5 h-5 opacity-60" />
          <h3 className="text-base font-medium" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>
            {title}
          </h3>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-full text-white hover:bg-white/20"
          onClick={onClose}
          data-testid={`button-close-${variant}-modal`}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  );
}
