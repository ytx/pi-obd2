import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

function TerminalScreen() {
  const { setScreen } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#ffffff',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // PTY output → xterm (register before spawn so no data is lost)
    const removeOutput = window.obd2API.onTerminalOutput((data: string) => {
      term.write(data);
    });

    // PTY exit
    const removeExit = window.obd2API.onTerminalExit(() => {
      term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n');
    });

    // xterm input → PTY
    const onDataDisposable = term.onData((data) => {
      window.obd2API.terminalWrite(data);
    });

    // xterm resize → PTY
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      window.obd2API.terminalResize(cols, rows);
    });

    // Wait for layout to settle before fit + spawn
    // requestAnimationFrame ensures container has actual dimensions
    requestAnimationFrame(() => {
      if (cancelled) return;
      fitAddon.fit();
      const { cols, rows } = term;
      window.obd2API.terminalSpawn(cols, rows);
    });

    // Container resize → fit
    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore if not attached
      }
    });
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      removeOutput();
      removeExit();
      window.obd2API.terminalKill();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-obd-dark">
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          onClick={() => setScreen('menu')}
          className="px-4 py-2 text-obd-primary border border-obd-dim rounded-lg hover:bg-obd-dim/30 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-white">Terminal</h1>
        <div className="w-20" />
      </div>
      {/* Padding wrapper separate from xterm container — FitAddon measures
          the container's inner dimensions, so padding on the container itself
          causes rows/cols to be overcounted */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <div ref={containerRef} className="h-full w-full overflow-hidden" />
      </div>
    </div>
  );
}

export default TerminalScreen;
