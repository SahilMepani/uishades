/**
 * Website mock — a landing hero with nav, headline, and a CTA.
 *
 * Pure markup styled only by the stage's scoped `--mock-*` vars.
 */
import type { MockTemplate } from './types';

function Website() {
  return (
    <div
      style={{
        background: 'var(--mock-bg)',
        color: 'var(--mock-text)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      {/* Nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--mock-border)',
          background: 'var(--mock-surface)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '14px' }}>
          <span style={{ color: 'var(--mock-accent)' }}>◆</span> Northwind
        </span>
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--mock-muted)' }}>
          <span>Product</span>
          <span>Pricing</span>
          <span>About</span>
        </div>
      </div>
      {/* Hero */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px',
          padding: '20px',
        }}
      >
        <span
          style={{
            color: 'var(--mock-accent)',
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Now in beta
        </span>
        <span style={{ fontWeight: 700, fontSize: '26px', lineHeight: 1.1, maxWidth: '18ch' }}>
          Ship your palette into production
        </span>
        <span style={{ color: 'var(--mock-muted)', fontSize: '12px', maxWidth: '32ch' }}>
          A calm, considered design system built around the colors you actually chose.
        </span>
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <span
            style={{
              background: 'var(--mock-accent)',
              color: 'var(--mock-on-accent)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '9px 18px',
              borderRadius: '6px',
            }}
          >
            Get started
          </span>
          <span
            style={{
              background: 'transparent',
              color: 'var(--mock-text)',
              border: '1px solid var(--mock-border)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '9px 18px',
              borderRadius: '6px',
            }}
          >
            Learn more
          </span>
        </div>
      </div>
    </div>
  );
}

export const websiteMock: MockTemplate = {
  id: 'website',
  label: 'Website',
  Component: Website,
};
