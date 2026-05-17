-- Subject taught by an additional teacher in a class (admin allots this).
ALTER TABLE public.class_teachers ADD COLUMN IF NOT EXISTS subject text;

-- Track who created tests/assignments so students can filter by teacher.
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS created_by uuid;

-- Track which teacher marked each attendance row, so students can see
-- attendance per subject/teacher (useful when one batch has multiple teachers).
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS teacher_id uuid;