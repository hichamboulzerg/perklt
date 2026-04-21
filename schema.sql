CREATE TABLE IF NOT EXISTS clicks (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  ua TEXT,
  referrer TEXT,
  source TEXT,
  campaign TEXT,
  smartlink_to TEXT,
  blocked TEXT,          -- NULL if passed through; else reason: geo_XX, bot_ua, empty_ua, bot_score
  bot_score INTEGER      -- CF bot-management score (0..99), NULL if unavailable
);

CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks(ts);
CREATE INDEX IF NOT EXISTS idx_clicks_source ON clicks(source);
CREATE INDEX IF NOT EXISTS idx_clicks_country ON clicks(country);
CREATE INDEX IF NOT EXISTS idx_clicks_blocked ON clicks(blocked);

CREATE TABLE IF NOT EXISTS conversions (
  subid TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  payout REAL DEFAULT 0,
  offer TEXT,
  offer_id TEXT,
  affiliate_id TEXT,
  source TEXT,
  campaign TEXT,
  session_ip TEXT,
  session_ts TEXT,
  raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_conv_ts ON conversions(ts);
CREATE INDEX IF NOT EXISTS idx_conv_source ON conversions(source);
CREATE INDEX IF NOT EXISTS idx_conv_offer ON conversions(offer_id);
