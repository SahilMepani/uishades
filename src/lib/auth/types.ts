import type { CopyFormat, ExportFormat, Hex } from '../color/types';

export type OAuthProvider = 'google' | 'github';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: number;
}

/**
 * A saved preset. Mirrors the design-relevant island prefs; transient UI state
 * (channelFormat, dismissedHintBanner) is intentionally excluded.
 */
export interface Preset {
  id: string;
  name: string;
  hex: Hex;
  view: 'scale' | 'ramp';
  copyFormat: CopyFormat;
  exportFormat?: ExportFormat;
}

/** Shape returned by GET /api/me. */
export interface MeResponse {
  user: Pick<User, 'email' | 'name' | 'avatarUrl'> | null;
  presets: Preset[];
}
