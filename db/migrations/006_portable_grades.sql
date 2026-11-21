-- 006: grades are defined per campus (campus/<id>.json), so the DB only checks the length. Applied 2026-11-21.
-- Twi language preference was removed from the product; drop its column.
alter table public.gpa_records drop constraint if exists gpa_records_grade_check;
alter table public.gpa_records add constraint gpa_records_grade_check check (char_length(grade) between 1 and 3);
alter table public.profiles drop column if exists lang;
