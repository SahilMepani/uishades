/**
 * Buttons mock — primary / secondary / ghost / disabled button variants plus a
 * form field, the canonical "is this palette usable in a UI?" check.
 *
 * Pure markup styled only by the stage's scoped `--mock-*` vars.
 */
import type { MockTemplate } from './types';

function Buttons() {
  return (
    <div
      style={{
        background: 'var(--mock-bg)',
        color: 'var(--mock-text)',
        height: '100%',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        justifyContent: 'center',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: '14px' }}>Components</span>

      {/* Button row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
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
          Primary
        </span>
        <span
          style={{
            background: 'var(--mock-surface)',
            color: 'var(--mock-text)',
            border: '1px solid var(--mock-border)',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: '6px',
          }}
        >
          Secondary
        </span>
        <span
          style={{
            background: 'transparent',
            color: 'var(--mock-accent)',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: '6px',
          }}
        >
          Ghost
        </span>
        <span
          style={{
            background: 'var(--mock-surface)',
            color: 'var(--mock-muted)',
            border: '1px solid var(--mock-border)',
            fontSize: '12px',
            fontWeight: 600,
            padding: '8px 16px',
            borderRadius: '6px',
            opacity: 0.55,
          }}
        >
          Disabled
        </span>
      </div>

      {/* Form field */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '260px' }}>
        <span style={{ fontSize: '10px', color: 'var(--mock-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Email address
        </span>
        <div
          style={{
            background: 'var(--mock-surface)',
            border: '1px solid var(--mock-accent)',
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '12px',
            color: 'var(--mock-text)',
          }}
        >
          you@studio.com
          <span style={{ color: 'var(--mock-accent)' }}>|</span>
        </div>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {['Design', 'Brand', 'UI'].map((c) => (
          <span
            key={c}
            style={{
              background: 'var(--mock-chip)',
              color: 'var(--mock-text)',
              fontSize: '10px',
              padding: '4px 10px',
              borderRadius: '999px',
            }}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export const buttonsMock: MockTemplate = {
  id: 'buttons',
  label: 'Buttons',
  Component: Buttons,
};
