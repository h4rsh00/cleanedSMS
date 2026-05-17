
-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  department TEXT,
  identifier TEXT,
  avatar_url TEXT,
  bio TEXT,
  id_card_url text,
  admission_no text,
  admission_date date,
  dob date,
  address text,
  phone text,
  parent_name text,
  parent_phone text,
  parent_email text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "Roles viewable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
CREATE POLICY "Users can insert own role"
  ON public.user_roles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ BATCHES ============
CREATE TABLE IF NOT EXISTS public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL,
  semester integer NOT NULL CHECK (semester BETWEEN 1 AND 12),
  section text NOT NULL DEFAULT 'A',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program, semester, section)
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated view batches" ON public.batches;
CREATE POLICY "Authenticated view batches" ON public.batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated create batches" ON public.batches;
DROP POLICY IF EXISTS "admin manages batches" ON public.batches;
CREATE POLICY "admin manages batches" ON public.batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL;

-- ============ CLASSES ============
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  semester TEXT,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS classes_updated_at ON public.classes;
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_profiles_batch ON public.profiles(batch_id);
CREATE INDEX IF NOT EXISTS idx_classes_batch ON public.classes(batch_id);

-- ============ ENROLLMENTS ============
CREATE TABLE IF NOT EXISTS public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_class_student_uniq
  ON public.enrollments(class_id, student_id);

CREATE OR REPLACE FUNCTION public.is_class_member(_user_id UUID, _class_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.enrollments WHERE class_id = _class_id AND student_id = _user_id)
$$;
CREATE OR REPLACE FUNCTION public.is_class_teacher(_user_id UUID, _class_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.classes WHERE id = _class_id AND teacher_id = _user_id)
$$;

DROP POLICY IF EXISTS "Members can view classes" ON public.classes;
CREATE POLICY "Members can view classes"
  ON public.classes FOR SELECT TO authenticated
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = id AND e.student_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'teacher'::public.app_role)
  );

DROP POLICY IF EXISTS "Teachers can create classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can update own classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can delete own classes" ON public.classes;
DROP POLICY IF EXISTS "admin manages classes" ON public.classes;
CREATE POLICY "admin manages classes" ON public.classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Members can view enrollments" ON public.enrollments;
CREATE POLICY "Members can view enrollments"
  ON public.enrollments FOR SELECT TO authenticated
  USING (
    public.is_class_member(auth.uid(), class_id)
    OR student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS "Students can self-enroll" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers manage enrollments in own class" ON public.enrollments;
DROP POLICY IF EXISTS "Students can unenroll self" ON public.enrollments;
DROP POLICY IF EXISTS "admin manages enrollments" ON public.enrollments;
CREATE POLICY "admin manages enrollments" ON public.enrollments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  max_marks NUMERIC NOT NULL DEFAULT 100,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Class members view assignments" ON public.assignments;
CREATE POLICY "Class members view assignments" ON public.assignments FOR SELECT TO authenticated
  USING (public.is_class_member(auth.uid(), class_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS "Teachers create assignments" ON public.assignments;
CREATE POLICY "Teachers create assignments" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_class_teacher(auth.uid(), class_id));
DROP POLICY IF EXISTS "Teachers update assignments" ON public.assignments;
CREATE POLICY "Teachers update assignments" ON public.assignments FOR UPDATE TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id));
DROP POLICY IF EXISTS "Teachers delete assignments" ON public.assignments;
CREATE POLICY "Teachers delete assignments" ON public.assignments FOR DELETE TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id));

-- ============ SUBMISSIONS ============
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grade NUMERIC,
  feedback TEXT,
  graded_at TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assignment_class(_assignment_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.assignments WHERE id = _assignment_id
$$;

DROP POLICY IF EXISTS "Students view own submissions" ON public.submissions;
CREATE POLICY "Students view own submissions" ON public.submissions FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), public.assignment_class(assignment_id)));
DROP POLICY IF EXISTS "Students insert own submissions" ON public.submissions;
CREATE POLICY "Students insert own submissions" ON public.submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Students update own submissions or teacher grades" ON public.submissions;
CREATE POLICY "Students update own submissions or teacher grades" ON public.submissions FOR UPDATE TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), public.assignment_class(assignment_id)));

-- ============ TESTS ============
CREATE TABLE IF NOT EXISTS public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  max_marks NUMERIC NOT NULL DEFAULT 100,
  test_date DATE,
  paper_url text,
  kind text NOT NULL DEFAULT 'file',
  time_limit_minutes integer,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view tests" ON public.tests;
CREATE POLICY "Members view tests" ON public.tests FOR SELECT TO authenticated
  USING (public.is_class_member(auth.uid(), class_id));
DROP POLICY IF EXISTS "Teachers manage tests" ON public.tests;
CREATE POLICY "Teachers manage tests" ON public.tests FOR ALL TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id))
  WITH CHECK (public.is_class_teacher(auth.uid(), class_id));

CREATE TABLE IF NOT EXISTS public.test_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id)
);
ALTER TABLE public.test_scores ENABLE ROW LEVEL SECURITY;

DELETE FROM public.test_scores a USING public.test_scores b
  WHERE a.ctid < b.ctid AND a.test_id = b.test_id AND a.student_id = b.student_id;
CREATE UNIQUE INDEX IF NOT EXISTS test_scores_test_student_uniq
  ON public.test_scores(test_id, student_id);

CREATE OR REPLACE FUNCTION public.test_class(_test_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT class_id FROM public.tests WHERE id = _test_id
$$;

DROP POLICY IF EXISTS "Students view own scores" ON public.test_scores;
CREATE POLICY "Students view own scores" ON public.test_scores FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), public.test_class(test_id)));
DROP POLICY IF EXISTS "Teachers manage scores" ON public.test_scores;
CREATE POLICY "Teachers manage scores" ON public.test_scores FOR ALL TO authenticated
  USING (public.is_class_teacher(auth.uid(), public.test_class(test_id)))
  WITH CHECK (public.is_class_teacher(auth.uid(), public.test_class(test_id)));

-- ============ ATTENDANCE ============
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id, session_date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students view own attendance + teachers view class" ON public.attendance;
CREATE POLICY "Students view own attendance + teachers view class" ON public.attendance FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), class_id));
DROP POLICY IF EXISTS "Teachers manage attendance" ON public.attendance;
CREATE POLICY "Teachers manage attendance" ON public.attendance FOR ALL TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id))
  WITH CHECK (public.is_class_teacher(auth.uid(), class_id));

-- ============ ANNOUNCEMENTS ============
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view announcements" ON public.announcements;
CREATE POLICY "Members view announcements" ON public.announcements FOR SELECT TO authenticated
  USING (public.is_class_member(auth.uid(), class_id));
DROP POLICY IF EXISTS "Teachers post announcements" ON public.announcements;
CREATE POLICY "Teachers post announcements" ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_class_teacher(auth.uid(), class_id) AND author_id = auth.uid());
DROP POLICY IF EXISTS "Teachers delete own announcements" ON public.announcements;
CREATE POLICY "Teachers delete own announcements" ON public.announcements FOR DELETE TO authenticated
  USING (public.is_class_teacher(auth.uid(), class_id));

-- ============ TIMETABLE ============
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room TEXT,
  subject TEXT
);
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view timetable" ON public.timetable_slots;
CREATE POLICY "Members view timetable" ON public.timetable_slots FOR SELECT TO authenticated
  USING (public.is_class_member(auth.uid(), class_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'teacher'::public.app_role));
DROP POLICY IF EXISTS "Teachers manage timetable" ON public.timetable_slots;
DROP POLICY IF EXISTS "admin manages timetable" ON public.timetable_slots;
CREATE POLICY "admin manages timetable" ON public.timetable_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ MESSAGING ============
CREATE TABLE IF NOT EXISTS public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_b UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participants_ordered CHECK (participant_a < participant_b),
  UNIQUE (participant_a, participant_b)
);
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants view threads" ON public.message_threads;
CREATE POLICY "Participants view threads" ON public.message_threads FOR SELECT TO authenticated
  USING (auth.uid() IN (participant_a, participant_b));
DROP POLICY IF EXISTS "Authenticated create threads" ON public.message_threads;
CREATE POLICY "Authenticated create threads" ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (participant_a, participant_b));
DROP POLICY IF EXISTS "Participants update threads" ON public.message_threads;
CREATE POLICY "Participants update threads" ON public.message_threads FOR UPDATE TO authenticated
  USING (auth.uid() IN (participant_a, participant_b));

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_thread_participant(_user UUID, _thread UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.message_threads WHERE id = _thread AND _user IN (participant_a, participant_b))
$$;

DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (public.is_thread_participant(auth.uid(), thread_id));
DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_thread_participant(auth.uid(), thread_id));
DROP POLICY IF EXISTS "Participants mark read" ON public.messages;
CREATE POLICY "Participants mark read" ON public.messages FOR UPDATE TO authenticated
  USING (public.is_thread_participant(auth.uid(), thread_id));

CREATE OR REPLACE FUNCTION public.bump_thread_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.message_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS messages_bump_thread ON public.messages;
CREATE TRIGGER messages_bump_thread AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_thread_last_message();

-- ============ ALLOWED IDENTIFIERS ============
CREATE TABLE IF NOT EXISTS public.allowed_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  role public.app_role NOT NULL,
  used_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identifier, role)
);
ALTER TABLE public.allowed_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone authenticated reads allowlist" ON public.allowed_identifiers;
CREATE POLICY "anyone authenticated reads allowlist"
  ON public.allowed_identifiers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manages allowlist" ON public.allowed_identifiers;
CREATE POLICY "admin manages allowlist"
  ON public.allowed_identifiers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============ STUDENT DOCUMENTS ============
CREATE TABLE IF NOT EXISTS public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  doc_type text NOT NULL DEFAULT 'other',
  title text NOT NULL,
  file_url text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.teaches_student(_teacher uuid, _student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.enrollments e ON e.class_id = c.id
    WHERE c.teacher_id = _teacher AND e.student_id = _student
  )
$$;

DROP POLICY IF EXISTS "Students manage own docs" ON public.student_documents;
CREATE POLICY "Students manage own docs"
  ON public.student_documents FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Teachers view docs of their students" ON public.student_documents;
CREATE POLICY "Teachers view docs of their students"
  ON public.student_documents FOR SELECT TO authenticated
  USING (public.teaches_student(auth.uid(), student_id));

-- ============ MCQ ============
CREATE TABLE IF NOT EXISTS public.mcq_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_index integer NOT NULL,
  marks numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcq_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view mcq questions" ON public.mcq_questions;
CREATE POLICY "Members view mcq questions" ON public.mcq_questions FOR SELECT TO authenticated
  USING (public.is_class_member(auth.uid(), public.test_class(test_id)));
DROP POLICY IF EXISTS "Teachers manage mcq questions" ON public.mcq_questions;
CREATE POLICY "Teachers manage mcq questions" ON public.mcq_questions FOR ALL TO authenticated
  USING (public.is_class_teacher(auth.uid(), public.test_class(test_id)))
  WITH CHECK (public.is_class_teacher(auth.uid(), public.test_class(test_id)));

CREATE TABLE IF NOT EXISTS public.mcq_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  answers jsonb NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id)
);
ALTER TABLE public.mcq_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students submit own attempts" ON public.mcq_attempts;
CREATE POLICY "Students submit own attempts" ON public.mcq_attempts FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Students view own attempts; teachers view class" ON public.mcq_attempts;
CREATE POLICY "Students view own attempts; teachers view class" ON public.mcq_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_class_teacher(auth.uid(), public.test_class(test_id)));

CREATE OR REPLACE FUNCTION public.grade_mcq_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q record;
  total numeric := 0;
  ans integer;
BEGIN
  FOR q IN SELECT id, correct_index, marks FROM public.mcq_questions WHERE test_id = NEW.test_id LOOP
    ans := NULLIF(NEW.answers->>q.id::text, '')::integer;
    IF ans IS NOT NULL AND ans = q.correct_index THEN
      total := total + q.marks;
    END IF;
  END LOOP;
  NEW.score := total;
  INSERT INTO public.test_scores (test_id, student_id, score)
  VALUES (NEW.test_id, NEW.student_id, total)
  ON CONFLICT (test_id, student_id) DO UPDATE SET score = EXCLUDED.score;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_grade_mcq_attempt ON public.mcq_attempts;
CREATE TRIGGER trg_grade_mcq_attempt
  BEFORE INSERT ON public.mcq_attempts
  FOR EACH ROW EXECUTE FUNCTION public.grade_mcq_attempt();

-- ============ AUTO-ENROLL ============
CREATE OR REPLACE FUNCTION public.enroll_student_in_batch(_student uuid, _batch uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _batch IS NULL OR _student IS NULL THEN RETURN; END IF;
  INSERT INTO public.enrollments (class_id, student_id)
  SELECT c.id, _student FROM public.classes c WHERE c.batch_id = _batch
  ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.on_profile_batch_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
    IF public.has_role(NEW.id, 'student'::public.app_role) THEN
      PERFORM public.enroll_student_in_batch(NEW.id, NEW.batch_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profile_batch_autoenroll ON public.profiles;
CREATE TRIGGER profile_batch_autoenroll AFTER INSERT OR UPDATE OF batch_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.on_profile_batch_change();

CREATE OR REPLACE FUNCTION public.on_class_batch_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
    INSERT INTO public.enrollments (class_id, student_id)
    SELECT NEW.id, p.id FROM public.profiles p
    WHERE p.batch_id = NEW.batch_id AND public.has_role(p.id, 'student'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS class_batch_autoenroll ON public.classes;
CREATE TRIGGER class_batch_autoenroll AFTER INSERT OR UPDATE OF batch_id ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.on_class_batch_change();

-- ============ HANDLE NEW USER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _batch uuid;
  _program text;
  _semester integer;
  _section text;
  _role public.app_role;
  _identifier text;
  _email text;
  _allowed_id uuid;
BEGIN
  _email := lower(coalesce(NEW.email, ''));
  _identifier := NULLIF(BTRIM(coalesce(NEW.raw_user_meta_data->>'identifier', '')), '');

  IF _email = 'abcdef@gmail.com' THEN
    _role := 'admin'::public.app_role;
  ELSE
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'student'::public.app_role);
    IF _role IN ('student'::public.app_role, 'teacher'::public.app_role) THEN
      IF _identifier IS NULL THEN
        RAISE EXCEPTION 'Roll No / Staff ID is required';
      END IF;
      SELECT id INTO _allowed_id FROM public.allowed_identifiers
        WHERE identifier = _identifier AND role = _role AND used_by IS NULL LIMIT 1;
      IF _allowed_id IS NULL THEN
        RAISE EXCEPTION 'This % is not authorised. Contact the admin.',
          CASE WHEN _role = 'teacher'::public.app_role THEN 'Staff ID' ELSE 'Roll No' END;
      END IF;
      UPDATE public.allowed_identifiers SET used_by = NEW.id WHERE id = _allowed_id;
    END IF;
  END IF;

  _batch := NULLIF(NEW.raw_user_meta_data->>'batch_id', '')::uuid;
  _program := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'batch_program', '')), '');
  _semester := NULLIF(NEW.raw_user_meta_data->>'batch_semester', '')::integer;
  _section := COALESCE(NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'batch_section', '')), ''), 'A');

  IF _role = 'student'::public.app_role AND _batch IS NULL AND _program IS NOT NULL AND _semester IS NOT NULL THEN
    SELECT id INTO _batch FROM public.batches
      WHERE program = _program AND semester = _semester AND section = _section LIMIT 1;
    IF _batch IS NULL THEN
      INSERT INTO public.batches (program, semester, section) VALUES (_program, _semester, _section) RETURNING id INTO _batch;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, department, identifier, batch_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          NEW.raw_user_meta_data->>'department', _identifier, _batch);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('class-files', 'class-files', false)
ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-docs', 'student-docs', false)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Class members read files" ON storage.objects;
CREATE POLICY "Class members read files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'class-files'
    AND public.is_class_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "Class members upload files" ON storage.objects;
CREATE POLICY "Class members upload files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'class-files'
    AND public.is_class_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    AND ((storage.foldername(name))[2])::uuid = auth.uid());
DROP POLICY IF EXISTS "Owners delete own files" ON storage.objects;
CREATE POLICY "Owners delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'class-files'
    AND ((storage.foldername(name))[2])::uuid = auth.uid());

DROP POLICY IF EXISTS "student-docs owner read" ON storage.objects;
CREATE POLICY "student-docs owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'student-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "student-docs owner write" ON storage.objects;
CREATE POLICY "student-docs owner write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "student-docs owner update" ON storage.objects;
CREATE POLICY "student-docs owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'student-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "student-docs owner delete" ON storage.objects;
CREATE POLICY "student-docs owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'student-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============ FUNCTION GRANTS ============
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_class_teacher(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assignment_class(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.test_class(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assignment_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_class(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_thread_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_student(uuid, uuid) TO authenticated;

-- ============ SEED ADMIN ============
DO $$
DECLARE
  _id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'abcdef@gmail.com') THEN
    _id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', _id, 'authenticated', 'authenticated',
      'abcdef@gmail.com', extensions.crypt('harsh@123', extensions.gen_salt('bf')), now(),
      '{"full_name":"Admin"}'::jsonb,
      '{"provider":"email","providers":["email"]}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), _id,
      jsonb_build_object('sub', _id::text, 'email', 'abcdef@gmail.com'),
      'email', _id::text, now(), now(), now()
    );
    INSERT INTO public.user_roles (user_id, role) VALUES (_id, 'admin'::public.app_role)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, full_name) VALUES (_id, 'Admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
