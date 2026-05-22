/**
 * Lightweight inline SVG chart primitives used by the mobile member app.
 * Designed to look consistent with the admin Recharts theme:
 *   - Yellow (var(--color-secondary)) primary
 *   - Violet (var(--color-primary)) secondary
 *   - 12px-radius cards, dark background
 *
 * These avoid pulling Recharts into the mobile bundle while keeping a
 * single visual language across both apps.
 */

import { useMemo } from 'react';

export interface ChartPoint { label: string; value: number; }

interface BaseProps {
  data: ChartPoint[];
  height?: number;
  color?: string;
  className?: string;
}

const PADDING = 24;

const useScale = (data: ChartPoint[], height: number) => {
  return useMemo(() => {
    const max = Math.max(...data.map(d => d.value), 1);
    const stepX = (w: number) => (data.length > 1 ? (w - PADDING * 2) / (data.length - 1) : 0);
    const y = (v: number) => height - PADDING - (v / max) * (height - PADDING * 2);
    return { max, stepX, y };
  }, [data, height]);
};

// ── Line Chart ───────────────────────────────────────────────────────────────
export function LineMini({ data, height = 160, color = 'var(--color-secondary)', className }: BaseProps) {
  const { stepX, y } = useScale(data, height);
  if (data.length === 0) return null;

  const Inner = ({ width }: { width: number }) => {
    const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${PADDING + i * stepX(width)} ${y(d.value)}`).join(' ');
    const area = `${path} L ${PADDING + (data.length - 1) * stepX(width)} ${height - PADDING} L ${PADDING} ${height - PADDING} Z`;
    return (
      <svg width={width} height={height} className={className}>
        <defs>
          <linearGradient id="lineFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid */}
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1={PADDING} x2={width - PADDING}
            y1={PADDING + p * (height - PADDING * 2)} y2={PADDING + p * (height - PADDING * 2)}
            stroke="var(--color-border)" strokeDasharray="2 4" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#lineFade)" />
        <path d={path} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={i} cx={PADDING + i * stepX(width)} cy={y(d.value)} r="3" fill={color} />
        ))}
        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={PADDING + i * stepX(width)} y={height - 4}
            textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">
            {d.label}
          </text>
        ))}
      </svg>
    );
  };

  return <ResponsiveWrap>{w => <Inner width={w} />}</ResponsiveWrap>;
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
export function BarMini({ data, height = 160, color = 'var(--color-primary)', className }: BaseProps) {
  const { y } = useScale(data, height);
  if (data.length === 0) return null;

  const Inner = ({ width }: { width: number }) => {
    const innerWidth = width - PADDING * 2;
    const barWidth = (innerWidth / data.length) * 0.6;
    const gap = (innerWidth / data.length) * 0.4;

    return (
      <svg width={width} height={height} className={className}>
        {[0.5].map(p => (
          <line key={p} x1={PADDING} x2={width - PADDING}
            y1={PADDING + p * (height - PADDING * 2)} y2={PADDING + p * (height - PADDING * 2)}
            stroke="var(--color-border)" strokeDasharray="2 4" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = PADDING + (innerWidth / data.length) * i + gap / 2;
          const yy = y(d.value);
          return (
            <g key={i}>
              <rect x={x} y={yy} width={barWidth} height={height - PADDING - yy}
                fill={color} rx="4" />
              <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };
  return <ResponsiveWrap>{w => <Inner width={w} />}</ResponsiveWrap>;
}

// ── Area Chart ───────────────────────────────────────────────────────────────
export function AreaMini({ data, height = 140, color = 'var(--color-primary)', className }: BaseProps) {
  const { stepX, y } = useScale(data, height);
  if (data.length === 0) return null;

  const Inner = ({ width }: { width: number }) => {
    const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${PADDING + i * stepX(width)} ${y(d.value)}`).join(' ');
    const area = `${path} L ${PADDING + (data.length - 1) * stepX(width)} ${height - PADDING} L ${PADDING} ${height - PADDING} Z`;
    return (
      <svg width={width} height={height} className={className}>
        <defs>
          <linearGradient id="areaFade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"  stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaFade)" />
        <path d={path} stroke={color} strokeWidth="2" fill="none" />
      </svg>
    );
  };
  return <ResponsiveWrap>{w => <Inner width={w} />}</ResponsiveWrap>;
}

// ── Helper: responsive width wrapper ─────────────────────────────────────────
function ResponsiveWrap({ children }: { children: (w: number) => React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: 'auto', position: 'relative', overflow: 'hidden' }}>
      <ResponsiveInner>{children}</ResponsiveInner>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
function ResponsiveInner({ children }: { children: (w: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const cw = entries[0].contentRect.width;
      if (cw > 0) setW(cw);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: '100%' }}>{children(w)}</div>;
}
