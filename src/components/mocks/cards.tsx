/**
 * Cards mock - three content cards on a surface.
 *
 * The default/hero template: reused server-side as the `/p/[slug]` hero and as
 * the OG image base. Pure markup - every colour is a `var(--mock-*)` read from
 * the stage element, so it recolours live and renders identically on the server.
 */
import type { MockTemplate } from './types';

function Cards() {
  const cards = [
    { kicker: 'Featured', title: 'Sunrise over the bay', meta: '6 min read' },
    { kicker: 'Guide', title: 'Designing with restraint', meta: '4 min read' },
    { kicker: 'Notes', title: 'A palette, in context', meta: '2 min read' },
  ];
  return (
    <div
      style={{
        background: 'var(--mock-bg)',
        color: 'var(--mock-text)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: '100%',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>Library</span>
        <span
          style={{
            background: 'var(--mock-chip)',
            color: 'var(--mock-text)',
            fontSize: '10px',
            padding: '3px 8px',
            borderRadius: '999px',
          }}
        >
          New
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          flex: 1,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.title}
            style={{
              background: 'var(--mock-surface)',
              border: '1px solid var(--mock-border)',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ height: '52px', borderRadius: '6px', background: 'var(--mock-accent)' }} />
            <span
              style={{
                color: 'var(--mock-accent)',
                fontSize: '9px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              {c.kicker}
            </span>
            <span style={{ fontWeight: 600, fontSize: '13px', lineHeight: 1.25 }}>{c.title}</span>
            <span style={{ color: 'var(--mock-muted)', fontSize: '11px', marginTop: 'auto' }}>
              {c.meta}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span
          style={{
            background: 'var(--mock-accent)',
            color: 'var(--mock-on-accent)',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: '6px',
          }}
        >
          Browse all
        </span>
      </div>
    </div>
  );
}

export const cardsMock: MockTemplate = {
  id: 'cards',
  label: 'Cards',
  Component: Cards,
};
