import { useMemo } from 'react';
import { useBoardStore } from '@/stores/useBoardStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { BoardSlot, MeterConfig, GraphConfig, NumericConfig } from '@/types';
import NumericPanel from './NumericPanel';
import MeterPanel from './MeterPanel';
import GraphPanel from './GraphPanel';

interface PanelSlotProps {
  slot: BoardSlot | null;
}

function PanelSlot({ slot }: PanelSlotProps) {
  const getPanelDef = useBoardStore((s) => s.getPanelDef);
  const availablePids = useOBDStore((s) => s.availablePids);

  const resolved = useMemo(() => {
    if (!slot) return null;
    const panel = getPanelDef(slot.panelDefId);
    if (!panel) return null;

    const pidInfo = availablePids.find((p) => p.id === slot.pid);
    const title = slot.title ?? pidInfo?.name ?? slot.pid;
    const unit = slot.unit ?? pidInfo?.unit ?? '';
    const min = slot.min ?? pidInfo?.min ?? 0;
    const max = slot.max ?? pidInfo?.max ?? 100;

    return { panel, title, unit, min, max };
  }, [slot, getPanelDef, availablePids]);

  if (!slot || !resolved) {
    return <div className="bg-obd-surface/30 rounded-lg" />;
  }

  const { panel, title, unit, min, max } = resolved;

  switch (panel.kind) {
    case 'numeric': {
      const cfg = panel.config as NumericConfig;
      const config = slot.decimals !== undefined ? { ...cfg, decimals: slot.decimals } : cfg;
      return <NumericPanel pid={slot.pid} label={title} unit={unit} config={config} />;
    }
    case 'meter': {
      const cfg = panel.config as MeterConfig;
      const tickCount = slot.step ?? cfg.tickCount;
      const config = tickCount !== cfg.tickCount ? { ...cfg, tickCount } : cfg;
      return <MeterPanel pid={slot.pid} label={title} min={min} max={max} unit={unit} config={config} decimals={slot.decimals} />;
    }
    case 'graph': {
      const cfg = panel.config as GraphConfig;
      const timeWindowMs = slot.timeWindowMs ?? cfg.timeWindowMs;
      const config = timeWindowMs !== cfg.timeWindowMs ? { ...cfg, timeWindowMs } : cfg;
      return <GraphPanel pid={slot.pid} label={title} min={min} max={max} unit={unit} config={config} />;
    }
    default:
      return <div className="bg-obd-surface/30 rounded-lg" />;
  }
}

export default PanelSlot;
