-- CREW production schema (Postgres on Render)

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kols (
  id TEXT PRIMARY KEY,
  rank INT NOT NULL,
  pump TEXT NOT NULL,
  x TEXT,
  followers BIGINT NOT NULL DEFAULT 0,
  wallet TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  narratives TEXT[] NOT NULL DEFAULT '{}',
  correlated TEXT[] NOT NULL DEFAULT '{}',
  roles TEXT[] NOT NULL DEFAULT '{}',
  harvested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kols_wallet_idx ON kols (wallet);
CREATE INDEX IF NOT EXISTS kols_pump_idx ON kols (lower(pump));
CREATE INDEX IF NOT EXISTS kols_x_idx ON kols (lower(x));
CREATE INDEX IF NOT EXISTS kols_followers_idx ON kols (followers DESC);
CREATE INDEX IF NOT EXISTS kols_rank_idx ON kols (rank);

CREATE TABLE IF NOT EXISTS coins (
  mint TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  vibe TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('split', 'buyback', 'raid', 'agent')),
  signature TEXT NOT NULL DEFAULT '',
  fee_share_signature TEXT,
  launched_at TIMESTAMPTZ NOT NULL,
  launcher TEXT NOT NULL,
  pump_url TEXT NOT NULL,
  buyback_rule JSONB,
  raid_quests JSONB,
  agent JSONB,
  holder_kol BOOLEAN NOT NULL DEFAULT false,
  unlocked_expired BOOLEAN NOT NULL DEFAULT false,
  admin_revoked BOOLEAN,
  agent_key_id TEXT,
  featured_x_url TEXT,
  featured_x_at TIMESTAMPTZ,
  featured_x_set_by TEXT,
  graduated_at TIMESTAMPTZ,
  graduated_via TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coins_launcher_idx ON coins (launcher);
CREATE INDEX IF NOT EXISTS coins_launched_at_idx ON coins (launched_at DESC);
CREATE INDEX IF NOT EXISTS coins_ticker_idx ON coins (ticker);
CREATE INDEX IF NOT EXISTS coins_agent_key_id_idx ON coins (agent_key_id) WHERE agent_key_id IS NOT NULL;
-- coins_graduated_unfeatured_idx is created in db.ts migration 019 after
-- ALTER TABLE adds graduated_at / featured_x_url on existing DBs. Do not
-- CREATE INDEX it here — CREATE TABLE IF NOT EXISTS is a no-op on live coins.

CREATE TABLE IF NOT EXISTS coin_crew (
  mint TEXT NOT NULL REFERENCES coins (mint) ON DELETE CASCADE,
  position INT NOT NULL,
  handle TEXT NOT NULL,
  wallet TEXT NOT NULL,
  share INT NOT NULL CHECK (share >= 0 AND share <= 100),
  hire_role TEXT,
  PRIMARY KEY (mint, position)
);

CREATE INDEX IF NOT EXISTS coin_crew_wallet_idx ON coin_crew (wallet);

CREATE TABLE IF NOT EXISTS remits (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL REFERENCES coins (mint) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  handle TEXT NOT NULL,
  wallet TEXT NOT NULL DEFAULT '',
  amount_sol NUMERIC(20, 9) NOT NULL CHECK (amount_sol > 0),
  mode TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  signature TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'chain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signature, wallet, handle)
);

CREATE INDEX IF NOT EXISTS remits_mint_idx ON remits (mint);
CREATE INDEX IF NOT EXISTS remits_at_idx ON remits (at DESC);
CREATE INDEX IF NOT EXISTS remits_signature_idx ON remits (signature);

CREATE TABLE IF NOT EXISTS buyback_runs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  sol_spent NUMERIC(20, 9),
  crew_mint TEXT,
  signature TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buyback_runs_created_idx ON buyback_runs (created_at DESC);

-- Public proof / agent platform extensions
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  label TEXT,
  agent_key_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGSERIAL PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks (id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT false,
  status_code INT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_wh_idx ON webhook_deliveries (webhook_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  launches_per_hour INT NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT true,
  /** Human owner wallet (operator-managed; not trusted for approvals from agent keys). */
  owner_wallet TEXT,
  /** When true, launch/wire-fees require an approved dryRunId. Default false. */
  require_approval BOOLEAN NOT NULL DEFAULT false,
  /** KOL referral code bound at claim — immutable; drives 60/15/5/20 fee split. */
  referral_code TEXT,
  /** Featured-ops role: GET graduated-unfeatured + POST featured URL. Default false. */
  ops BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_keys_active_idx ON agent_keys (active);
CREATE INDEX IF NOT EXISTS agent_keys_referral_code_idx
  ON agent_keys (lower(referral_code)) WHERE referral_code IS NOT NULL;

-- Fee-share recipients per mint (for referral vs crew earnings attribution).
CREATE TABLE IF NOT EXISTS coin_shareholders (
  mint TEXT NOT NULL REFERENCES coins (mint) ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  role TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  bps INT NOT NULL,
  PRIMARY KEY (mint, wallet, role)
);

CREATE INDEX IF NOT EXISTS coin_shareholders_wallet_role_idx
  ON coin_shareholders (wallet, role);

-- Audit log of referred agent-key claims (rate-limit review).
CREATE TABLE IF NOT EXISTS agent_referral_claims (
  id TEXT PRIMARY KEY,
  agent_key_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL DEFAULT '',
  referral_code TEXT NOT NULL,
  referrer_wallet TEXT NOT NULL DEFAULT '',
  referrer_handle TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_referral_claims_code_day_idx
  ON agent_referral_claims (lower(referral_code), created_at DESC);

CREATE TABLE IF NOT EXISTS mode_actions (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  mode TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_sol NUMERIC(20, 9) NOT NULL,
  wallet TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mode_actions_mint_idx ON mode_actions (mint, created_at DESC);

-- Opt-in KOL registrations (X OAuth; Solana payout wallet optional). Separate from the seeded directory.
CREATE TABLE IF NOT EXISTS kol_registrations (
  x_user_id TEXT PRIMARY KEY,
  x_username TEXT NOT NULL,
  x_name TEXT NOT NULL DEFAULT '',
  x_verified BOOLEAN NOT NULL DEFAULT false,
  followers INT NOT NULL DEFAULT 0,
  following INT NOT NULL DEFAULT 0,
  tweet_count INT NOT NULL DEFAULT 0,
  listed_count INT NOT NULL DEFAULT 0,
  profile_image_url TEXT,
  description TEXT NOT NULL DEFAULT '',
  wallet TEXT NOT NULL DEFAULT '',
  pending_wallet TEXT,
  pending_until TIMESTAMPTZ,
  -- Scraped Pump wallets + previous linked wallets; desk earnings sum across these.
  prior_wallets TEXT[] NOT NULL DEFAULT '{}',
  -- Direct referral program: every KOL has a code; referred_by_code is set once at first register.
  referral_code TEXT,
  referred_by_code TEXT,
  -- Cached sum of kol_referral_events.points — for future CREW airdrop eligibility.
  referral_points INT NOT NULL DEFAULT 0,
  -- Client IP at first registration (self-referral claim checks).
  register_ip TEXT,
  evm_wallet TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stats_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kol_registrations_wallet_idx
  ON kol_registrations (wallet)
  WHERE wallet IS NOT NULL AND length(trim(wallet)) >= 32;
CREATE UNIQUE INDEX IF NOT EXISTS kol_registrations_username_idx ON kol_registrations (lower(x_username));
CREATE UNIQUE INDEX IF NOT EXISTS kol_registrations_referral_code_idx
  ON kol_registrations (lower(referral_code)) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS kol_registrations_referred_by_idx ON kol_registrations (lower(referred_by_code));
CREATE INDEX IF NOT EXISTS kol_registrations_followers_idx ON kol_registrations (followers DESC, registered_at ASC);
CREATE INDEX IF NOT EXISTS kol_registrations_registered_idx ON kol_registrations (registered_at DESC);

-- Draft @CrewPayHQ mention posts after remits — operator approves before posting.
CREATE TABLE IF NOT EXISTS kol_mention_drafts (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'posted', 'rejected')),
  mint TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL DEFAULT '',
  handle TEXT NOT NULL DEFAULT '',
  wallet TEXT NOT NULL DEFAULT '',
  amount_sol NUMERIC(20, 9) NOT NULL DEFAULT 0,
  draft_text TEXT NOT NULL,
  x_post_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_mention_drafts_status_idx ON kol_mention_drafts (status, created_at DESC);

-- Single-use nonces for wallet-signed board writes (10-minute TTL; deleted on use).
CREATE TABLE IF NOT EXISTS board_nonces (
  nonce TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_oauth_nonces (
  nonce TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kol_oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  wallet TEXT NOT NULL,
  referral_code TEXT,
  cookie_sha256 TEXT,
  ip TEXT,
  evm_wallet TEXT,
  -- SHA-256 of the wallet signature that started this attempt (bound into signed OAuth state).
  signature_sha256 TEXT,
  -- One-time use; callback sets this instead of deleting so a second hit can say "already used".
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kol_oauth_states_cookie_idx
  ON kol_oauth_states (cookie_sha256)
  WHERE cookie_sha256 IS NOT NULL AND consumed_at IS NULL;

-- Ledger for referral points (airdrop-ready). register = join with code; hire = referred KOL fee-locked.
CREATE TABLE IF NOT EXISTS kol_referral_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('register', 'hire')),
  referrer_code TEXT NOT NULL,
  referred_handle TEXT NOT NULL,
  referred_x_user_id TEXT,
  points INT NOT NULL CHECK (points > 0),
  mint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kol_referral_events_register_uidx
  ON kol_referral_events (referred_x_user_id)
  WHERE event_type = 'register' AND referred_x_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kol_referral_events_hire_uidx
  ON kol_referral_events (mint, lower(referred_handle))
  WHERE event_type = 'hire' AND mint IS NOT NULL;
CREATE INDEX IF NOT EXISTS kol_referral_events_referrer_idx
  ON kol_referral_events (lower(referrer_code), created_at DESC);

-- Jobs + escrow (test/devnet; future persistence)
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('campaign')),
  created_by TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  budget NUMERIC(32, 0) NOT NULL DEFAULT 0, -- base units (lamports-like)
  per_proof_amount NUMERIC(32, 0) NOT NULL DEFAULT 0,
  max_proofs INT NOT NULL DEFAULT 0,
  per_kol_cap INT NOT NULL DEFAULT 0,
  deadline TIMESTAMPTZ NOT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'created',
  escrow_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_claims (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  kol_handle TEXT,
  kol_wallet TEXT NOT NULL,
  kol_chain_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_submissions (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES job_claims (id) ON DELETE CASCADE,
  urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verification JSONB
);

CREATE INDEX IF NOT EXISTS jobs_deadline_status_idx ON jobs (deadline, status);
CREATE INDEX IF NOT EXISTS job_claims_job_idx ON job_claims (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_submissions_claim_idx ON job_submissions (claim_id, created_at DESC);
