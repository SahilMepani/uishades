/**
 * Dashboard mock - sidebar + KPI tiles + a bar chart whose series use the
 * palette as chart colours (`--mock-chart-0..4`).
 *
 * Pure markup styled only by the stage's scoped `--mock-*` vars.
 */
import type { MockTemplate } from './types';

const BARS = [62, 88, 47, 73, 95, 58, 80] as const;

function Dashboard() {
  return (
    <div
      style={{
        background: 'var(--mock-bg)',
        color: 'var(--mock-text)',
        height: '100%',
        display: 'flex',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          width: '78px',
          background: 'var(--mock-surface)',
          borderRight: '1px solid var(--mock-border)',
          padding: '16px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            background: 'var(--mock-accent)',
            marginBottom: '6px',
          }}
        />
        {['Home', 'Stats', 'Plans', 'Team'].map((label, i) => (
          <span
            key={label}
            style={{
              fontSize: '10px',
              color: i === 1 ? 'var(--mock-accent)' : 'var(--mock-muted)',
              fontWeight: i === 1 ? 700 : 500,
            }}
          >
            {label}
          </span>
        ))}
      </div>
      {/* Main */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '14px' }}>Overview</span>
        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {[
            { k: 'Revenue', v: '$24.8k', c: 'var(--mock-chart-0)' },
            { k: 'Signups', v: '1,204', c: 'var(--mock-chart-1)' },
            { k: 'Churn', v: '2.1%', c: 'var(--mock-chart-2)' },
          ].map((t) => (
            <div
              key={t.k}
              style={{
                background: 'var(--mock-surface)',
                border: '1px solid var(--mock-border)',
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '9px', color: 'var(--mock-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t.k}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>{t.v}</span>
              <div style={{ height: '4px', borderRadius: '999px', background: t.c }} />
            </div>
          ))}
        </div>
        {/* Bar chart */}
        <div
          style={{
            flex: 1,
            background: 'var(--mock-surface)',
            border: '1px solid var(--mock-border)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
          }}
        >
          {BARS.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: '3px 3px 0 0',
                background: `var(--mock-chart-${i % 5})`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const dashboardMock: MockTemplate = {
  id: 'dashboard',
  label: 'Dashboard',
  Component: Dashboard,
};
