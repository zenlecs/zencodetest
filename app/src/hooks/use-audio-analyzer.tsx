import { useRef, useCallback, useState, useEffect } from "react";

interface AudioAnalyzerData {
  frequencyData: Uint8Array;
  averageLevel: number;
}

export function useAudioAnalyzer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [frequencyData, setFrequencyData] = useState<number[]>([]);

  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 64;
      analyserRef.current.smoothingTimeConstant = 0.8;
    }
    return { audioContext: audioContextRef.current, analyser: analyserRef.current };
  }, []);

  const connectMediaStream = useCallback((stream: MediaStream) => {
    const { audioContext, analyser } = initAudioContext();
    if (!audioContext || !analyser) return;

    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }

    sourceRef.current = audioContext.createMediaStreamSource(stream);
    sourceRef.current.connect(analyser);
    setIsActive(true);
    startVisualization();
  }, [initAudioContext]);

  const connectAudioElement = useCallback((audioElement: HTMLAudioElement) => {
    const { audioContext, analyser } = initAudioContext();
    if (!audioContext || !analyser) return;

    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }

    sourceRef.current = audioContext.createMediaElementSource(audioElement);
    sourceRef.current.connect(analyser);
    sourceRef.current.connect(audioContext.destination);
    setIsActive(true);
    startVisualization();
  }, [initAudioContext]);

  const startVisualization = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const updateData = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const normalizedData = Array.from(dataArray).map(v => v / 255);
      setFrequencyData(normalizedData);

      animationFrameRef.current = requestAnimationFrame(updateData);
    };

    updateData();
  }, []);

  const disconnect = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setIsActive(false);
    setFrequencyData([]);
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [disconnect]);

  return {
    isActive,
    frequencyData,
    connectMediaStream,
    connectAudioElement,
    disconnect
  };
}
