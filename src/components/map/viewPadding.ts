import type { PaddingOptions } from 'maplibre-gl';
import { useAppStore } from '../../store/useAppStore';

export type Layout = 'desktop' | 'mobile' | 'car-landscape' | 'car-portrait';

export function currentLayout(): Layout {
  const { carMode } = useAppStore.getState();
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  if (carMode) return portrait ? 'car-portrait' : 'car-landscape';
  return window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop';
}

/** Width of the car-mode side panel; kept in sync with the CarMode layout. */
export const carPanelWidth = () => Math.min(Math.round(window.innerWidth * 0.42), 440);

type Purpose = 'station' | 'route' | 'follow';

/**
 * Map padding so the subject (a station, a whole route, the moving car) lands in the part
 * of the screen not covered by panels — which differs per layout.
 */
export function viewPadding(purpose: Purpose): PaddingOptions {
  const layout = currentLayout();
  const h = window.innerHeight;
  const { sidebarOpen } = useAppStore.getState();

  switch (layout) {
    case 'mobile':
      return purpose === 'follow'
        ? { top: 190, bottom: 210, left: 0, right: 0 }
        : { top: 70, bottom: Math.round(h * 0.62), left: 24, right: 24 };
    case 'car-landscape': {
      const left = carPanelWidth() + 24;
      return purpose === 'follow'
        ? { top: 80, bottom: 40, left, right: 0 }
        : { top: 50, bottom: 50, left: left + 16, right: 50 };
    }
    case 'car-portrait':
      return purpose === 'follow'
        ? { top: 40, bottom: Math.round(h * 0.55), left: 0, right: 0 }
        : { top: 40, bottom: Math.round(h * 0.58), left: 30, right: 30 };
    default:
      if (purpose === 'follow') return { top: 160, bottom: 140, left: 0, right: 0 };
      if (purpose === 'route') return { top: 100, bottom: 100, left: sidebarOpen ? 380 : 60, right: 460 };
      return { top: 40, bottom: 40, left: sidebarOpen ? 340 : 0, right: 420 };
  }
}
