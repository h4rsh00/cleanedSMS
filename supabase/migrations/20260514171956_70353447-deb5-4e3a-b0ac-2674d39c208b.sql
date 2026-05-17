
CREATE TABLE public.test_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid NOT NULL,
  student_id uuid NOT NULL,
  file_url text,
  notes text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id)
);

ALTER TABLE public.test_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own test submissions; teachers view class"
  ON public.test_submissions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), public.test_class(test_id)));

CREATE POLICY "Students insert own test submissions"
  ON public.test_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students update own test submissions"
  ON public.test_submissions FOR UPDATE TO authenticated
  USING (student_id = auth.uid());
