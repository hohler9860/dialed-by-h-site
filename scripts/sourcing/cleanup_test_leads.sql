-- Remove test leads and Henry's own submissions from dialed_submissions.
-- Run in the Supabase SQL editor for the DBH project (untnrofsnmoyxdidxbdj).
--
-- Reviewed against live data on 2026-08-03: matches 28 of 49 rows, leaving the
-- 21 genuine leads untouched. Step 1 snapshots everything it is about to
-- delete, so this is reversible.

-- ── STEP 1: back up the rows being removed ────────────────────────────
create table if not exists public.dialed_submissions_removed_20260803 as
select * from public.dialed_submissions
where lead_class in ('TEST', 'SPAM')
   or lower(coalesce(full_name, '')) like '%henry%ohler%'
   or lower(coalesce(email, '')) in ('dialedbyh@gmail.com', 'henrycohler@gmail.com')
   or lower(coalesce(full_name, '')) ~ '\mtest\M'
   or lower(coalesce(email, '')) like '%resend-debug%';

-- ── STEP 2: see exactly what will go (run this and eyeball it) ────────
select lead_class, full_name, email, created_at::date
from public.dialed_submissions_removed_20260803
order by created_at desc;

-- ── STEP 3: delete them ───────────────────────────────────────────────
-- Only run once you are happy with STEP 2's output.
delete from public.dialed_submissions
where id in (select id from public.dialed_submissions_removed_20260803);

-- ── STEP 4: confirm what survived ─────────────────────────────────────
select count(*) as remaining, count(*) filter (where lead_class = 'REAL') as real_leads
from public.dialed_submissions;

-- To undo:
--   insert into public.dialed_submissions
--   select * from public.dialed_submissions_removed_20260803;
--
-- Once you are confident, drop the snapshot:
--   drop table public.dialed_submissions_removed_20260803;
