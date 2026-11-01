import { useEffect, useState, useMemo, useRef } from "react";

interface AudioSpectrumProps {
  frequencyData: number[];
  isActive: boolean;
  side: "left" | "right";
  mode: "recording" | "playback";
}

export function AudioSpectrum({ frequencyData, isActive, side, mode }: AudioSpectrumProps) {
  const [scale, setScale] = useState(0);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  
  // Smooth scale animation for open/close
  useEffect(() => {
    const animate = () => {
      timeRef.current += 0.016;
      
      setScale(prev => {
        const target = isActive ? 1 : 0;
        const speed = isActive ? 0.08 : 0.05;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) return target;
        return prev + diff * speed;
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive]);

  // Calculate average intensity from frequency data
  const intensity = useMemo(() => {
    if (!frequencyData.length) return 0.1;
    const sum = frequencyData.reduce((a, b) => a + b, 0);
    return Math.max(0.1, Math.min(1, (sum / frequencyData.length) * 3));
  }, [frequencyData]);

  // Generate wave path - grows from edges (top/bottom) toward center
  const wavePath = useMemo(() => {
    const height = 100; // Percentage
    const segments = 40;
    const time = Date.now() / 500;
    
    const points: { y: number; x: number }[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const y = (i / segments) * height;
      const normalizedY = i / segments;
      
      // Distance from edges (0 at edges, 1 at center)
      const distFromEdge = 1 - Math.abs(normalizedY - 0.5) * 2;
      
      // Amplitude is LARGER at edges, smaller toward center (inverted)
      const edgeAmplitude = Math.pow(1 - distFromEdge, 0.5);
      
      // Get frequency data
      const freqIndex = Math.floor(normalizedY * (frequencyData.length || 1) * 0.8);
      const freq = frequencyData[freqIndex] || 0;
      
      // Wave motion
      const wave1 = Math.sin(time * 1.5 + i * 0.2) * 8;
      const wave2 = Math.sin(time * 2.3 + i * 0.15) * 5;
      const wave3 = Math.sin(time + i * 0.3) * 3;
      
      // Audio-reactive amplitude (stronger at edges)
      const audioAmp = freq * 60 * (0.3 + edgeAmplitude * 0.7);
      
      // Base width + waves + audio
      const baseWidth = 15 + edgeAmplitude * 25;
      const totalWidth = (baseWidth + wave1 + wave2 + wave3 + audioAmp) * scale;
      
      points.push({ y, x: Math.max(0, totalWidth) });
    }
    
    // Build SVG path
    let path = "";
    if (side === "left") {
      path = `M 0 0 `;
      points.forEach((p, i) => {
        if (i === 0) path += `L ${p.x} ${p.y} `;
        else path += `Q ${p.x} ${(points[i-1].y + p.y) / 2}, ${p.x} ${p.y} `;
      });
      path += `L 0 100 Z`;
    } else {
      path = `M 100 0 `;
      points.forEach((p, i) => {
        const x = 100 - p.x;
        if (i === 0) path += `L ${x} ${p.y} `;
        else path += `Q ${x} ${(points[i-1].y + p.y) / 2}, ${x} ${p.y} `;
      });
      path += `L 100 100 Z`;
    }
    
    return path;
  }, [frequencyData, side, scale]);

  const primaryColor = mode === "recording" ? "239, 68, 68" : "59, 130, 246";
  const gradientId = `edge-wave-${side}-${mode}`;

  if (scale < 0.01) return null;

  return (
    <div 
      className={`fixed ${side === "left" ? "left-0" : "right-0"} top-0 h-full z-40 pointer-events-none`}
      style={{ width: "120px" }}
    >
      <svg 
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
        style={{ opacity: 0.25 + intensity * 0.15 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2={side === "left" ? "100%" : "0%"} y2="0%">
            <stop offset="0%" stopColor={`rgba(${primaryColor}, ${side === "left" ? 0 : 0.8})`} />
            <stop offset="30%" stopColor={`rgba(${primaryColor}, 0.5)`} />
            <stop offset="70%" stopColor={`rgba(${primaryColor}, 0.5)`} />
            <stop offset="100%" stopColor={`rgba(${primaryColor}, ${side === "left" ? 0.8 : 0})`} />
          </linearGradient>
          <filter id={`blur-edge-${side}`}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>
        
        {/* Blurred background layer */}
        <path
          d={wavePath}
          fill={`url(#${gradientId})`}
          filter={`url(#blur-edge-${side})`}
          style={{ opacity: 0.6 }}
        />
        
        {/* Sharp foreground layer */}
        <path
          d={wavePath}
          fill={`url(#${gradientId})`}
          style={{ opacity: 0.4 }}
        />
      </svg>
    </div>
  );
}

// Background spectrum for message area
interface BackgroundSpectrumProps {
  frequencyData: number[];
  isActive: boolean;
  mode: "recording" | "playback";
}

export function BackgroundSpectrum({ frequencyData, isActive, mode }: BackgroundSpectrumProps) {
  const [scale, setScale] = useState(0);
  const animationRef = useRef<number>();
  
  useEffect(() => {
    const animate = () => {
      setScale(prev => {
        const target = isActive ? 1 : 0;
        const speed = isActive ? 0.06 : 0.04;
        const diff = target - prev;
        if (Math.abs(diff) < 0.01) return target;
        return prev + diff * speed;
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive]);

  const intensity = useMemo(() => {
    if (!frequencyData.length) return 0.15;
    const sum = frequencyData.reduce((a, b) => a + b, 0);
    return Math.max(0.15, Math.min(1, (sum / frequencyData.length) * 2.5));
  }, [frequencyData]);

  // Generate organic blob
  const blobPath = useMemo(() => {
    const cx = 50, cy = 50;
    const baseR = 25;
    const segments = 32;
    const time = Date.now() / 600;
    
    const points: string[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const freqIdx = Math.floor((i / segments) * (frequencyData.length || 1));
      const freq = frequencyData[freqIdx] || 0;
      
      const wave1 = Math.sin(time + angle * 3) * 4;
      const wave2 = Math.sin(time * 1.5 + angle * 5) * 2;
      const audioWave = freq * 15;
      
      const r = (baseR + wave1 + wave2 + audioWave) * scale;
      const x = cx + Math.cos(angle) * r * 1.3;
      const y = cy + Math.sin(angle) * r;
      
      points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
    }
    
    return points.join(' ') + ' Z';
  }, [frequencyData, scale]);

  const primaryColor = mode === "recording" ? "239, 68, 68" : "59, 130, 246";

  if (scale < 0.01) return null;

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{ opacity: (0.08 + intensity * 0.12) * scale }}
    >
      <svg viewBox="0 0 100 100" className="w-[80%] h-[80%]">
        <defs>
          <radialGradient id={`bg-grad-${mode}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`rgba(${primaryColor}, 0.8)`} />
            <stop offset="60%" stopColor={`rgba(${primaryColor}, 0.3)`} />
            <stop offset="100%" stopColor={`rgba(${primaryColor}, 0)`} />
          </radialGradient>
          <filter id="bg-blur-center">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
        </defs>
        
        <path
          d={blobPath}
          fill={`url(#bg-grad-${mode})`}
          filter="url(#bg-blur-center)"
        />
      </svg>
    </div>
  );
}
