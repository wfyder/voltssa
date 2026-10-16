import { useMemo, useState } from 'react';
import type { ProfilePoint } from '../../lib/energy';

const W = 360;
const H = 150;
const PAD = { top: 12, right: 10, bottom: 22, left: 34 };

/** Elevation profile (area chart) — pure SVG, no chart library. */
export function ElevationChart({ profile }: { profile: ProfilePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { path, area, xTicks, yTicks, sx, sy, grades } = useMemo(() => {
    const maxX = profile[profile.length - 1]?.distanceKm || 1;
    const elev = profile.map((p) => p.elevationM);
    const minY = Math.max(0, Math.floor(Math.min(...elev) / 10) * 10 - 5);
    const maxY = Math.ceil((Math.max(...elev) + 5) / 10) * 10;
    const sx = (x: number) => PAD.left + (x / maxX) * (W - PAD.left - PAD.right);
    const sy = (y: number) => H - PAD.bottom - ((y - minY) / Math.max(1, maxY - minY)) * (H - PAD.top - PAD.bottom);
    const path = profile.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.distanceKm).toFixed(1)},${sy(p.elevationM).toFixed(1)}`).join(' ');
    const area = `${path} L${sx(maxX)},${H - PAD.bottom} L${sx(0)},${H - PAD.bottom} Z`;
    const xTicks = Array.from({ length: 5 }, (_, i) => (maxX * i) / 4);
    const yTicks = Array.from({ length: 4 }, (_, i) => minY + ((maxY - minY) * i) / 3);
    // Segment grades: steep climbs (> 8%, Salvador's ladeiras) are drawn in red.
    const grades = profile.slice(1).map((p, i) => {
      const prev = profile[i];
      const dx = (p.distanceKm - prev.distanceKm) * 1000;
      return dx > 0 ? ((p.elevationM - prev.elevationM) / dx) * 100 : 0;
    });
    return { path, area, xTicks, yTicks, sx, sy, grades };
  }, [profile]);

  if (profile.length < 2) return null;
  const hp = hover !== null ? profile[hover] : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      data-testid="elevation-chart"
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        let best = 0;
        profile.forEach((p, i) => {
          if (Math.abs(sx(p.distanceKm) - x) < Math.abs(sx(profile[best].distanceKm) - x)) best = i;
        });
        setHover(best);
      }}
    >
      <defs>
        <linearGradient id="elev-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#facc15" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#facc15" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)} stroke="#262626" />
          <text x={PAD.left - 4} y={sy(t) + 3} textAnchor="end" className="fill-faint text-[9px]">
            {Math.round(t)}m
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <text key={t} x={sx(t)} y={H - 6} textAnchor="middle" className="fill-faint text-[9px]">
          {t.toFixed(1)}km
        </text>
      ))}
      <path d={area} fill="url(#elev-fill)" />
      {profile.slice(1).map((p, i) => {
        const g = grades[i];
        const color = g > 8 ? '#ef4444' : '#facc15';
        return (
          <line
            key={i}
            x1={sx(profile[i].distanceKm)}
            y1={sy(profile[i].elevationM)}
            x2={sx(p.distanceKm)}
            y2={sy(p.elevationM)}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        );
      })}
      <path d={path} fill="none" stroke="transparent" />
      {hp && (
        <g>
          <line x1={sx(hp.distanceKm)} x2={sx(hp.distanceKm)} y1={PAD.top} y2={H - PAD.bottom} stroke="#6b6b6b" />
          <circle cx={sx(hp.distanceKm)} cy={sy(hp.elevationM)} r={3} fill="#facc15" stroke="#0e0e0e" />
          <rect x={Math.min(sx(hp.distanceKm) + 6, W - 92)} y={PAD.top} width={86} height={26} rx={3} fill="#1b1b1b" stroke="#383838" />
          <text x={Math.min(sx(hp.distanceKm) + 12, W - 86)} y={PAD.top + 11} className="fill-fg text-[9px]">
            {hp.elevationM.toFixed(0)} m de altitude
          </text>
          <text x={Math.min(sx(hp.distanceKm) + 12, W - 86)} y={PAD.top + 21} className="fill-muted text-[9px]">
            km {hp.distanceKm.toFixed(2)}
          </text>
        </g>
      )}
    </svg>
  );
}
