import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, Navigation, RotateCw, Undo2 } from 'lucide-react';
import type { RouteStep } from '../../lib/navigation';
import { cn } from '../../lib/utils';

/** Arrow glyph for an OSRM maneuver. */
export function ManeuverIcon({ step, className }: { step: Pick<RouteStep, 'type' | 'modifier'>; className?: string }) {
  const cls = cn('shrink-0', className);
  if (step.type === 'arrive') return <Flag className={cls} />;
  if (step.type === 'depart') return <Navigation className={cls} />;
  if (step.type === 'roundabout' || step.type === 'rotary' || step.type === 'roundabout turn') return <RotateCw className={cls} />;
  switch (step.modifier) {
    case 'uturn':
      return <Undo2 className={cls} />;
    case 'right':
    case 'sharp right':
      return <CornerUpRight className={cls} />;
    case 'left':
    case 'sharp left':
      return <CornerUpLeft className={cls} />;
    case 'slight right':
      return <ArrowUpRight className={cls} />;
    case 'slight left':
      return <ArrowUpLeft className={cls} />;
    default:
      return <ArrowUp className={cls} />;
  }
}
