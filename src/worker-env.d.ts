// Auth secrets are set as Worker secrets (`wrangler secret put` in prod,
// `.dev.vars` locally). They're not declared in wrangler.toml, so
// `wrangler types` doesn't emit them — declare them here so `env` imported from
// 'cloudflare:workers' is typed wherever the auth code reads them. This merges
// with the generated `Cloudflare.Env` (which carries the `DB` D1 binding).
declare namespace Cloudflare {
  interface Env {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    BREVO_API_KEY: string;
    // Inbox the footer feedback form delivers to. Required for /api/feedback to
    // send — set as a Worker secret (and in .dev.vars for local dev).
    FEEDBACK_RECIPIENT_EMAIL: string;
  }
}
