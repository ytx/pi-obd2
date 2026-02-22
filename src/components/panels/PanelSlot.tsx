import { useBoardStore } from '@/stores/useBoardStore';
import { useOBDStore } from '@/stores/useOBDStore';
import { MeterConfig, GraphConfig, NumericConfig } from '@/types';
import NumericPanel from './NumericPanel';
import MeterPanel from './MeterPanel';
import GraphPanel from './GraphPanel';

interface PanelSlotProps {
  panelDefId: string | null;
}

function PanelSlot({ panelDefId }: PanelSlotProps) {
  const getPanelDef = useBoardStore((s) => s.getPanelDef);
  const availablePids = useOBDStore((s) => s.availablePids);

  if (!panelDefId) {
    return <div className="bg-obd-surface/30 rounded-lg" />;
  }

  const panel = getPanelDef(panelDefId);
  if (!panel) {
    return <div className="bg-obd-surface/30 rounded-lg" />;
  }

  const pidInfo = availablePids.find((p) => p.id === panel.pid);
  const label = panel.label ?? pidInfo?.name ?? panel.pid;
  const unit = pidInfo?.unit ?? '';
  const min = pidInfo?.min ?? 0;
  const max = pidInfo?.max ?? 100;

  switch (panel.kind) {
    case 'numeric':
      return <NumericPanel pid={panel.pid} label={label} unit={unit} config={panel.config as NumericConfig} />;
    case 'meter':
      return <MeterPanel pid={panel.pid} label={label} min={min} max={max} unit={unit} config={panel.config as MeterConfig} />;
    case 'graph':
      return <GraphPanel pid={panel.pid} label={label} min={min} max={max} unit={unit} config={panel.config as GraphConfig} />;
    default:
      return <div className="bg-obd-surface/30 rounded-lg" />;
  }
}

export default PanelSlot;
