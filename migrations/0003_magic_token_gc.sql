-- 0003_magic_token_gc - support garbage-collecting expired magic-link tokens.
-- Only the consumed token's row is deleted on sign-in, so requested-but-never-
-- clicked links would otherwise accumulate forever. The magic-link endpoint now
-- prunes `WHERE expires_at < now`; this index keeps that sweep off a full scan.

CREATE INDEX idx_magic_tokens_expires ON magic_link_tokens(expires_at);
