import { useRef } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipe(options: UseSwipeOptions): SwipeHandlers {
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = options;
  const startX = useRef(0);
  const startY = useRef(0);
  const lastX = useRef(0);
  const tracking = useRef(false);

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      lastX.current = touch.clientX;
      tracking.current = true;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!tracking.current) return;
      const touch = e.touches[0];
      lastX.current = touch.clientX;
      const dy = Math.abs(touch.clientY - startY.current);
      const dx = Math.abs(touch.clientX - startX.current);
      if (dy > dx && dy > 10) {
        tracking.current = false;
      }
    },
    onTouchEnd: () => {
      if (!tracking.current) return;
      tracking.current = false;
      const dx = lastX.current - startX.current;
      if (Math.abs(dx) >= threshold) {
        if (dx < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      }
    },
  };
}
