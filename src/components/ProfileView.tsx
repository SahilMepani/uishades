import PaletteCard from './PaletteCard';
import type { PublicProfile } from '../lib/auth/types';

/**
 * ProfileView - the public `/u/[handle]` profile, hosted by `u/[handle].astro`.
 *
 * Presentational, fed entirely by a `PublicProfile` (avatar + display name +
 * handle + that user's PUBLIC, non-flagged palettes). It NEVER receives or
 * renders an email - `PublicProfile` carries no email field by construction.
 *
 * Each palette renders through the shared `PaletteCard`, linking to `/p/[slug]`.
 * The creator line is suppressed here (`showCreator={false}`) - every card on
 * this page is by the same person whose profile you're already viewing - while
 * the upvote control stays on so visitors can vote (signed-out clicks open the
 * sign-in modal, a signup nudge).
 */

interface ProfileViewProps {
  profile: PublicProfile;
}

export default function ProfileView({ profile }: ProfileViewProps) {
  const label = profile.displayName || profile.handle;
  const initial = (label || '?').trim().charAt(0).toUpperCase();
  const palettes = profile.palettes;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center gap-4">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-full ring-1 ring-ink/10"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xl text-paper"
          >
            {initial}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="kicker">Public profile</span>
          <h1 className="display truncate text-3xl">{label}</h1>
          <span className="font-mono text-[11px] tracking-tight text-mute">
            /u/{profile.handle}
          </span>
        </div>
      </header>

      {palettes.length === 0 ? (
        <p className="font-mono text-[12px] text-mute">No public palettes yet.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {palettes.map((p) => (
            <li key={p.id}>
              <PaletteCard palette={p} href={`/p/${p.slug}`} showCreator={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
