DROP POLICY IF EXISTS "Members can view classes" ON public.classes;

CREATE POLICY "Members can view classes"
ON public.classes
FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = classes.id AND e.student_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
);