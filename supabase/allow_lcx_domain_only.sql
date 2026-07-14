-- Defense-in-depth: reject any Supabase auth signup whose email isn't
-- @lcx.com, at the database level. This backs up (doesn't replace) the two
-- other layers already in place:
--   1. Google's own OAuth consent screen — "Testing" mode with an exact
--      allowlist of test-user emails (Google refuses anyone not listed).
--   2. The app's own check in apps/api/src/middleware/auth.ts and
--      apps/web/src/lib/auth.ts (isAllowedEmailDomain from @lcx/shared).
--
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New
-- query → paste → Run). Safe to re-run — CREATE OR REPLACE / DROP IF EXISTS.

create or replace function public.reject_non_lcx_signup()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email is null or new.email !~* '@lcx\.com$' then
    raise exception 'Sign-in restricted to @lcx.com accounts';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_lcx_domain on auth.users;

create trigger enforce_lcx_domain
  before insert on auth.users
  for each row
  execute function public.reject_non_lcx_signup();
