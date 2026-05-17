ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_class_id_student_id_session_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_class_student_date_teacher_key
  ON public.attendance (class_id, student_id, session_date, teacher_id);