import { useEffect, useRef, useState } from 'react';

interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function useCanvasSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      setSize({ width: rect.width, height: rect.height, dpr });
    };

    update();

    observerRef.current = new ResizeObserver(update);
    observerRef.current.observe(el);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef]);

  return size;
}
