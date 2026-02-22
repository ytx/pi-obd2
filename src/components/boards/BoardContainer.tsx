import { useEffect, useCallback } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useSwipe } from './useSwipe';
import BoardView from './BoardView';

function BoardContainer() {
  const nextBoard = useBoardStore((s) => s.nextBoard);
  const prevBoard = useBoardStore((s) => s.prevBoard);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextBoard();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prevBoard();
      }
    },
    [nextBoard, prevBoard],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Swipe navigation
  const swipeHandlers = useSwipe({
    onSwipeLeft: nextBoard,
    onSwipeRight: prevBoard,
    threshold: 60,
  });

  return (
    <div
      className="h-full w-full relative"
      {...swipeHandlers}
    >
      <BoardView />
    </div>
  );
}

export default BoardContainer;
