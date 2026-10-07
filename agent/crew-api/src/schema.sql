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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coins_launcher_idx ON coins (launcher);
CREATE INDEX IF NOT EXISTS coins_launched_at_idx ON coins (launched_at DESC);
CREATE INDEX IF NOT EXISTS coins_ticker_idx ON coins (ticker);

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
