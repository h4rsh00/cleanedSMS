
-- Create class_teachers join table so admins can assign multiple teachers to a batch/class.
CREATE TABLE IF NOT EXISTS public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, teacher_id)
);

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manages class_teachers" ON public.class_teachers;
CREATE POLICY "admin manages class_teachers" ON public.class_teachers
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Members view class_teachers" ON public.class_teachers;
CREATE POLICY "Members view class_teachers" ON public.class_teachers
  FOR SELECT USING (
    teacher_id = auth.uid()
    OR public.is_class_member(auth.uid(), class_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Extend membership helpers so additional teachers count as class members.
CREATE OR REPLACE FUNCTION public.is_class_teacher(_user_id uuid, _class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.class_teachers WHERE class_id = _class_id AND teacher_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_class_member(_user_id uuid, _class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.enrollments WHERE class_id = _class_id AND student_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.class_teachers WHERE class_id = _class_id AND teacher_id = _user_id)
$$;

-- Allow teachers to see any timetable slot they are personally assigned to.
DROP POLICY IF EXISTS "Assigned teacher views own slot" ON public.timetable_slots;
CREATE POLICY "Assigned teacher views own slot" ON public.timetable_slots
  FOR SELECT USING (teacher_id = auth.uid());
