import { useEffect, useCallback } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useSwipe } from './useSwipe';
import BoardView from './BoardView';

function BoardContainer() {
  const boards = useBoardStore((s) => s.boards);
  const currentBoardId = useBoardStore((s) => s.currentBoardId);
  const nextBoard = useBoardStore((s) => s.nextBoard);
  const prevBoard = useBoardStore((s) => s.prevBoard);

  const currentIndex = boards.findIndex((b) => b.id === currentBoardId);

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
      {/* Board indicator dots */}
      {boards.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 pointer-events-none">
          {boards.map((b, i) => (
            <div
              key={b.id}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? 'bg-obd-primary' : 'bg-obd-dim/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default BoardContainer;
