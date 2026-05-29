import { useCallback, useState } from 'react';
import type { Hex } from '../lib/color/types';
import type { MeResponse, Preset } from '../lib/auth/types';

/**
 * Saved-presets panel for the left rail. Renders only when signed in (AuthMenu
 * carries the sign-in prompt otherwise). A preset captures the current color +
 * view/format choices; loading one calls back into ShadeTool's setters so the
 * URL and localStorage stay in sync.
 */

interface PresetsPanelProps {
  user: MeResponse['user'];
  presets: Preset[];
  currentHex: Hex;
  onSave: (name: string) => Promise<void> | void;
  onLoad: (preset: Preset) => void;
  onDelete: (id: string) => void;
}

const VIEW_LABEL: Record<Preset['view'], string> = {
  scale: 'Tailwind',
  ramp: 'OKLCH',
};

export default function PresetsPanel({
  user,
  presets,
  currentHex,
  onSave,
  onLoad,
  onDelete,
}: PresetsPanelProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (saving) return;
      const finalName = name.trim() || currentHex;
      setSaving(true);
      try {
        await onSave(finalName);
        setName('');
      } finally {
        setSaving(false);
      }
    },
    [name, currentHex, saving, onSave],
  );

  // Signed out: AuthMenu already prompts sign-in; don't duplicate it here.
  if (!user) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-5">
      <span className="eyebrow">Presets</span>

      <form onSubmit={handleSave} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          spellCheck={false}
          placeholder={`Name (default ${currentHex})`}
          aria-label="Preset name"
          className="min-w-0 flex-1 border border-ink/20 bg-paper-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-mute focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        <button
          type="submit"
          disabled={saving}
          className="shrink-0 border border-ink/20 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink transition-colors duration-200 ease-out hover:border-ink/40 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:opacity-60"
        >
          {saving ? '…' : 'Save'}
        </button>
      </form>

      {presets.length === 0 ? (
        <p className="text-xs leading-relaxed text-mute">No presets yet. Save the current palette.</p>
      ) : (
        <ul className="flex flex-col">
          {presets.map((preset) => (
            <li key={preset.id} className="flex items-center gap-2 border-b border-hairline/60 py-1.5 last:border-b-0">
              <button
                type="button"
                onClick={() => onLoad(preset)}
                aria-label={`Load preset ${preset.name}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm px-1 py-1 text-left transition-colors duration-150 ease-out hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 rounded-sm ring-1 ring-ink/10"
                  style={{ backgroundColor: preset.hex }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{preset.name}</span>
                  <span className="block truncate font-mono text-[11px] text-mute">
                    {preset.hex} · {VIEW_LABEL[preset.view]}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(preset.id)}
                aria-label={`Delete preset ${preset.name}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-mute transition-colors duration-150 ease-out hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
                  <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
