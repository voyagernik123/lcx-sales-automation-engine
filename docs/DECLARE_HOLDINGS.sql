-- LCX — HOLDINGS DECLARATION for member 'nik', asset LCX.
-- RUN EXACTLY ONE of the two statements below, in the Supabase SQL editor.
-- Expires 2027-08-07; after that the engine refuses again until re-declared.

-- ── (1) I HOLD NO LCX ────────────────────────────────────────────────────────
-- An affirmative declaration of no position. Different fact from never answering.
INSERT INTO marketing_holdings_declaration (member_id, asset_symbol, holds, renew_by)
VALUES ('nik', 'LCX', false, '2027-08-07T00:00:00Z');

-- ── (2) I DO HOLD LCX ────────────────────────────────────────────────────────
-- Does NOT forbid posting. It requires a conflict disclosure IN the post itself
-- (Art 91(3)(c), "simultaneously ... to the public").
-- INSERT INTO marketing_holdings_declaration (member_id, asset_symbol, holds, renew_by)
-- VALUES ('nik', 'LCX', true, '2027-08-07T00:00:00Z');

-- ── VERIFY ───────────────────────────────────────────────────────────────────
SELECT member_id, asset_symbol, holds, declared_at, renew_by
  FROM marketing_holdings_declaration WHERE member_id = 'nik';
