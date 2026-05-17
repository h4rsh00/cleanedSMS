import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, fetchTeacherProfilesByIds, formatDate, formatBatch } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Pencil, Upload, Download } from "lucide-react";

export const Route = createFileRoute("/grades")({
  head: () => ({ meta: [{ title: "Test / Grades - College Portal" }] }),
  component: () => <RequireAuth><Grades /></RequireAuth>,
});

interface MCQDraft {
  question: string;
  options: string[];
  correct_index: number;
  marks: number;
}

function Grades() {
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";
  const [classes, setClasses] = useState<any[]>([]);
  const [batchMap, setBatchMap] = useState<Map<string, string>>(new Map());
  // Map of teacher_id -> profile, used to label classes by their teacher.
  const [teacherMap, setTeacherMap] = useState<Map<string, any>>(new Map());
  const [selected, setSelected] = useState<string>("");
  // Student-only: which teacher within the chosen class to filter by.
  // For teachers this stays empty (they see only their own created tests).
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  // Student dropdown options: one entry per (class, teacher, subject).
  const [studentOptions, setStudentOptions] = useState<
    { value: string; label: string; classId: string; teacherId: string }[]
  >([]);
  const [tests, setTests] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  // File-test submissions (student uploads). Keyed by `${test_id}:${student_id}`.
  const [fileSubs, setFileSubs] = useState<Map<string, any>>(new Map());
  const [roster, setRoster] = useState<any[]>([]);
  const [profMap, setProfMap] = useState<Map<string, any>>(new Map());
  const [draft, setDraft] = useState<Record<string, string>>({}); // key=`${test_id}:${student_id}`

  // Teacher-side label: just the batch (a teacher only sees one row per class).
  const labelFor = (c: any) =>
    (c?.batch_id && batchMap.get(c.batch_id)) || c?.name || "-";

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"file" | "mcq">("file");
  const [tForm, setTForm] = useState({ title: "", max_marks: 100, test_date: "" });
  const paperRef = useRef<HTMLInputElement>(null);
  const [questions, setQuestions] = useState<MCQDraft[]>([
    { question: "", options: ["", "", "", ""], correct_index: 0, marks: 1 },
  ]);

  // MCQ-taking
  const [attemptTest, setAttemptTest] = useState<any>(null);
  const [attemptQs, setAttemptQs] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  // Student: upload file submission for a File-type test.
  const [uploadTest, setUploadTest] = useState<any>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);

  const submitFileTest = async () => {
    if (!user || !uploadTest) return;
    const file = uploadRef.current?.files?.[0];
    const existing = fileSubs.get(`${uploadTest.id}:${user.id}`);
    let file_url = existing?.file_url ?? null;
    if (file) {
      const path = `${uploadTest.class_id}/${user.id}/test-${uploadTest.id}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("class-files").upload(path, file);
      if (upErr) return toast.error(upErr.message);
      file_url = path;
    }
    if (!file_url) return toast.error("Pick a file to upload");
    const { error } = await supabase.from("test_submissions").upsert(
      { test_id: uploadTest.id, student_id: user.id, file_url, notes: uploadNotes, submitted_at: new Date().toISOString() },
      { onConflict: "test_id,student_id" },
    );
    if (error) return toast.error(error.message);
    toast.success("Submitted");
    setUploadTest(null);
    setUploadNotes("");
    if (uploadRef.current) uploadRef.current.value = "";
    await refreshTests();
  };

  // Teacher: view/edit MCQs of an existing test
  const [editTest, setEditTest] = useState<any>(null);
  const [editQs, setEditQs] = useState<any[]>([]);

  const openEditMcq = async (t: any) => {
    const { data } = await supabase
      .from("mcq_questions")
      .select("id, question, options, correct_index, marks")
      .eq("test_id", t.id)
      .order("created_at");
    setEditTest(t);
    setEditQs((data ?? []) as any[]);
  };

  const saveEditQ = async (q: any) => {
    const { error } = await supabase.from("mcq_questions").update({
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
      marks: Number(q.marks) || 1,
    }).eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  const deleteEditQ = async (qid: string) => {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("mcq_questions").delete().eq("id", qid);
    if (error) return toast.error(error.message);
    setEditQs((qs) => qs.filter((q) => q.id !== qid));
  };

  const deleteTest = async (testId: string) => {
    if (!confirm("Delete this test? Scores and attempts will be lost.")) return;
    await supabase.from("mcq_questions").delete().eq("test_id", testId);
    await supabase.from("mcq_attempts").delete().eq("test_id", testId);
    await supabase.from("test_scores").delete().eq("test_id", testId);
    const { error } = await supabase.from("tests").delete().eq("id", testId);
    if (error) return toast.error(error.message);
    toast.success("Test deleted");
    await refreshTests();
  };

  const downloadPaper = async (path: string) => {
    const { data, error } = await supabase.storage.from("class-files").createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message || "Failed");
    window.open(data.signedUrl, "_blank");
  };

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: bs } = await supabase.from("batches").select("id, program, semester, section");
      setBatchMap(new Map((bs ?? []).map((b: any) => [b.id, formatBatch(b)])));
      let cls: any[] = [];
      if (isTeacher) {
        // Teacher classes = own + assigned by admin via class_teachers
        const [{ data: own }, { data: extra }] = await Promise.all([
          supabase.from("classes").select("*").eq("teacher_id", user.id),
          supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
        ]);
        const extraIds = ((extra ?? []) as any[]).map((r) => r.class_id);
        const merged = new Map<string, any>();
        for (const c of (own ?? []) as any[]) merged.set(c.id, c);
        if (extraIds.length) {
          const { data: more } = await supabase.from("classes").select("*").in("id", extraIds);
          for (const c of (more ?? []) as any[]) merged.set(c.id, c);
        }
        cls = Array.from(merged.values());
      } else {
        const { data: enr } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
        const ids = (enr ?? []).map((e) => e.class_id);
        if (ids.length) {
          const { data } = await supabase.from("classes").select("*").in("id", ids);
          cls = data ?? [];
        }
      }
      setClasses(cls);
      // Pre-fetch teacher profiles so the dropdown can show teacher names.
      const tIds = Array.from(new Set(cls.map((c) => c.teacher_id).filter(Boolean)));
      if (tIds.length) setTeacherMap(await fetchProfilesByIds(tIds));
      // For students, build "Subject - Teacher" options spanning every
      // (primary teacher, additional class_teacher) row. For teachers we
      // keep the simple class-only dropdown.
      if (!isTeacher && cls.length) {
        const classIds = cls.map((c) => c.id);
        const { data: cts } = await supabase
          .from("class_teachers")
          .select("class_id, teacher_id, subject")
          .in("class_id", classIds);
        const extraTeacherIds = (cts ?? []).map((r: any) => r.teacher_id);
        const allTeacherIds = Array.from(new Set([...tIds, ...extraTeacherIds]));
        const allProfs = allTeacherIds.length ? await fetchTeacherProfilesByIds(allTeacherIds) : new Map();
        setTeacherMap(allProfs);
        const opts: { value: string; label: string; classId: string; teacherId: string }[] = [];
        for (const c of cls) {
          // Primary teacher of the class. Class.name is treated as the subject.
          if (c.teacher_id && allProfs.has(c.teacher_id)) {
            const tName = (allProfs.get(c.teacher_id) as any)?.full_name || "Teacher";
            opts.push({
              value: `${c.id}::${c.teacher_id}`,
              label: `${c.name} - ${tName}`,
              classId: c.id, teacherId: c.teacher_id,
            });
          }
          // Additional teachers admin assigned to the class, with their subject.
          for (const ct of (cts ?? []).filter((x: any) => x.class_id === c.id)) {
            if (!allProfs.has(ct.teacher_id)) continue;
            const tName = (allProfs.get(ct.teacher_id) as any)?.full_name || "Teacher";
            opts.push({
              value: `${c.id}::${ct.teacher_id}`,
              label: `${ct.subject || c.name} - ${tName}`,
              classId: c.id, teacherId: ct.teacher_id,
            });
          }
        }
        setStudentOptions(opts);
        if (opts[0]) { setSelected(opts[0].classId); setSelectedTeacher(opts[0].teacherId); }
      } else if (cls[0]) {
        setSelected(cls[0].id);
      }
    })();
  }, [user, isTeacher]);

  const refreshTests = async () => {
    if (!selected || !user) return;
    let q = supabase.from("tests").select("*").eq("class_id", selected);
    // Students filter to only the tests created by the chosen teacher.
    if (!isTeacher && selectedTeacher) q = q.eq("created_by", selectedTeacher);
    // Teachers see only the tests they themselves created in this class.
    if (isTeacher) q = q.eq("created_by", user.id);
    const { data: t } = await q.order("test_date", { ascending: false });
    setTests(t ?? []);
    const testIds = (t ?? []).map((x) => x.id);
    // Pull student file uploads for these tests (used by both teacher and student views).
    const subMap = new Map<string, any>();
    if (testIds.length) {
      const { data: subs } = await supabase.from("test_submissions").select("*").in("test_id", testIds);
      (subs ?? []).forEach((s: any) => subMap.set(`${s.test_id}:${s.student_id}`, s));
    }
    setFileSubs(subMap);
    if (isTeacher) {
      const { data: enr } = await supabase.from("enrollments").select("student_id").eq("class_id", selected);
      const ids = (enr ?? []).map((e) => e.student_id);
      setProfMap(await fetchProfilesByIds(ids));
      setRoster(ids);
      const { data: s } = testIds.length
        ? await supabase.from("test_scores").select("*").in("test_id", testIds)
        : { data: [] };
      setScores(s ?? []);
    } else {
      const { data: s } = testIds.length
        ? await supabase.from("test_scores").select("*").in("test_id", testIds).eq("student_id", user.id)
        : { data: [] };
      setScores(s ?? []);
    }
  };

  useEffect(() => { void refreshTests(); }, [selected, selectedTeacher, user, isTeacher]);

  const createTest = async () => {
    if (!tForm.title) return toast.error("Title required");
    if (kind === "mcq") {
      const bad = questions.some((q) => !q.question.trim() || q.options.some((o) => !o.trim()));
      if (bad) return toast.error("Fill all question text and options");
    }
    const totalMarks = kind === "mcq"
      ? questions.reduce((a, q) => a + (Number(q.marks) || 0), 0)
      : tForm.max_marks;
    let paper_url: string | null = null;
    if (kind === "file") {
      const file = paperRef.current?.files?.[0];
      if (file) {
        const path = `${selected}/${user!.id}/test-${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("class-files").upload(path, file);
        if (upErr) return toast.error(upErr.message);
        paper_url = path;
      }
    }
    const { data: created, error } = await supabase.from("tests").insert({
      class_id: selected, title: tForm.title, max_marks: totalMarks,
      test_date: tForm.test_date || null, paper_url, kind,
      created_by: user!.id,
    }).select().single();
    if (error || !created) return toast.error(error?.message || "Failed");

    if (kind === "mcq") {
      const rows = questions.map((q) => ({
        test_id: created.id,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        marks: Number(q.marks) || 1,
      }));
      const { error: qErr } = await supabase.from("mcq_questions").insert(rows);
      if (qErr) return toast.error(qErr.message);
    }

    setOpen(false);
    setTForm({ title: "", max_marks: 100, test_date: "" });
    setQuestions([{ question: "", options: ["", "", "", ""], correct_index: 0, marks: 1 }]);
    setKind("file");
    if (paperRef.current) paperRef.current.value = "";
    await refreshTests();
  };

  const setScore = async (test_id: string, student_id: string, score: number) => {
    const { error } = await supabase.from("test_scores").upsert({ test_id, student_id, score }, { onConflict: "test_id,student_id" });
    if (error) return toast.error(error.message);
    toast.success("Score saved");
    setDraft((d) => { const n = { ...d }; delete n[`${test_id}:${student_id}`]; return n; });
    await refreshTests();
  };
  const findScore = (testId: string, studentId: string) =>
    scores.find((s) => s.test_id === testId && s.student_id === studentId);

  // Student opens an MCQ test
  const openMcq = async (t: any) => {
    if (!user) return;
    const { data: existing } = await supabase.from("mcq_attempts").select("id").eq("test_id", t.id).eq("student_id", user.id).maybeSingle();
    if (existing) return toast.error("You have already attempted this test");
    const { data: qs } = await supabase.from("mcq_questions").select("id, question, options, marks").eq("test_id", t.id).order("created_at");
    setAttemptTest(t);
    setAttemptQs(qs ?? []);
    setAnswers({});
  };

  const submitMcq = async () => {
    if (!user || !attemptTest) return;
    if (attemptQs.some((q) => answers[q.id] === undefined)) {
      if (!confirm("Some questions are unanswered. Submit anyway?")) return;
    }
    const { error } = await supabase.from("mcq_attempts").insert({
      test_id: attemptTest.id, student_id: user.id, answers,
    });
    if (error) return toast.error(error.message);
    toast.success("Submitted - score saved automatically");
    setAttemptTest(null);
    setAttemptQs([]);
    setAnswers({});
    await refreshTests();
  };

  const addQ = () => setQuestions([...questions, { question: "", options: ["", "", "", ""], correct_index: 0, marks: 1 }]);
  const removeQ = (i: number) => setQuestions(questions.filter((_, idx) => idx !== i));
  const updateQ = (i: number, patch: Partial<MCQDraft>) => setQuestions(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-caps">Test / Grades</div>
          <h1 className="text-2xl font-semibold">Tests and scores</h1>
        </div>
        <div className="flex items-end gap-2">
          {isTeacher ? (
            <select className="rounded-md border border-border bg-input px-3 py-2 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.id}>{labelFor(c)}</option>)}
            </select>
          ) : (
            // Student dropdown: "Subject - Teacher" (e.g. "Maths - Sam").
            <select
              className="rounded-md border border-border bg-input px-3 py-2 text-sm"
              value={selected && selectedTeacher ? `${selected}::${selectedTeacher}` : ""}
              onChange={(e) => {
                const opt = studentOptions.find((o) => o.value === e.target.value);
                if (opt) { setSelected(opt.classId); setSelectedTeacher(opt.teacherId); }
              }}
            >
              {studentOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {isTeacher && selected && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New test</Button></DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New test</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant={kind === "file" ? "default" : "outline"} onClick={() => setKind("file")}>Upload paper</Button>
                    <Button size="sm" variant={kind === "mcq" ? "default" : "outline"} onClick={() => setKind("mcq")}>MCQ test</Button>
                  </div>
                  <div><Label>Title</Label><Input value={tForm.title} onChange={(e) => setTForm({ ...tForm, title: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    {kind === "file" && (
                      <div><Label>Max marks</Label><Input type="number" value={tForm.max_marks} onChange={(e) => setTForm({ ...tForm, max_marks: Number(e.target.value) })} /></div>
                    )}
                    <div><Label>Date</Label><Input type="date" value={tForm.test_date} onChange={(e) => setTForm({ ...tForm, test_date: e.target.value })} /></div>
                  </div>
                  {kind === "file" ? (
                    <div><Label>Test paper (optional)</Label><Input type="file" ref={paperRef} /></div>
                  ) : (
                    <div className="space-y-3">
                      {questions.map((q, i) => (
                        <Card key={i} className="p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs label-caps">Question {i + 1}</span>
                            {questions.length > 1 && (
                              <Button size="icon" variant="ghost" onClick={() => removeQ(i)}><Trash2 className="h-3 w-3" /></Button>
                            )}
                          </div>
                          <Input placeholder="Question text" value={q.question} onChange={(e) => updateQ(i, { question: e.target.value })} />
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex gap-2 items-center">
                              <input
                                type="radio" name={`correct-${i}`}
                                checked={q.correct_index === oi}
                                onChange={() => updateQ(i, { correct_index: oi })}
                              />
                              <Input
                                placeholder={`Option ${oi + 1}${q.correct_index === oi ? " (correct)" : ""}`}
                                value={opt}
                                onChange={(e) => updateQ(i, { options: q.options.map((o, j) => j === oi ? e.target.value : o) })}
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 items-center">
                            <Label className="text-xs">Marks</Label>
                            <Input type="number" className="w-20" value={q.marks} onChange={(e) => updateQ(i, { marks: Number(e.target.value) })} />
                          </div>
                        </Card>
                      ))}
                      <Button size="sm" variant="outline" onClick={addQ}><Plus className="h-3 w-3 mr-1" /> Add question</Button>
                    </div>
                  )}
                  <Button onClick={createTest} className="w-full">Create</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* MCQ attempt dialog */}
      <Dialog open={!!attemptTest} onOpenChange={(o) => !o && setAttemptTest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{attemptTest?.title}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {attemptQs.map((q, i) => (
              <Card key={q.id} className="p-4 space-y-2">
                <div className="font-medium">{i + 1}. {q.question} <span className="text-xs text-muted-foreground">({q.marks} mark{q.marks !== 1 ? "s" : ""})</span></div>
                {(q.options as string[]).map((opt, oi) => (
                  <label key={oi} className="flex gap-2 items-center text-sm cursor-pointer">
                    <input
                      type="radio" name={`q-${q.id}`}
                      checked={answers[q.id] === oi}
                      onChange={() => setAnswers({ ...answers, [q.id]: oi })}
                    />
                    {opt}
                  </label>
                ))}
              </Card>
            ))}
            <Button className="w-full" onClick={submitMcq}>Submit answers</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Teacher: view + edit MCQs already created for a test */}
      <Dialog open={!!editTest} onOpenChange={(o) => !o && setEditTest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit MCQs - {editTest?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {editQs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No questions found for this test.</p>
            ) : editQs.map((q, i) => (
              <Card key={q.id} className="p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs label-caps">Question {i + 1}</span>
                  <Button size="icon" variant="ghost" onClick={() => deleteEditQ(q.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <Input value={q.question} onChange={(e) => setEditQs((qs) => qs.map((x, j) => j === i ? { ...x, question: e.target.value } : x))} />
                {(q.options as string[]).map((opt: string, oi: number) => (
                  <div key={oi} className="flex gap-2 items-center">
                    <input type="radio" name={`edit-correct-${q.id}`} checked={q.correct_index === oi}
                      onChange={() => setEditQs((qs) => qs.map((x, j) => j === i ? { ...x, correct_index: oi } : x))} />
                    <Input value={opt}
                      onChange={(e) => setEditQs((qs) => qs.map((x, j) => j === i ? { ...x, options: x.options.map((o: string, k: number) => k === oi ? e.target.value : o) } : x))} />
                  </div>
                ))}
                <div className="flex gap-2 items-center justify-between">
                  <div className="flex gap-2 items-center">
                    <Label className="text-xs">Marks</Label>
                    <Input type="number" className="w-20" value={q.marks}
                      onChange={(e) => setEditQs((qs) => qs.map((x, j) => j === i ? { ...x, marks: Number(e.target.value) } : x))} />
                  </div>
                  <Button size="sm" onClick={() => saveEditQ(q)}>Save</Button>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Student: upload answer file for a File-type test */}
      <Dialog open={!!uploadTest} onOpenChange={(o) => !o && setUploadTest(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload answer - {uploadTest?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>File</Label><Input type="file" ref={uploadRef} /></div>
            <div><Label>Notes (optional)</Label><Input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} /></div>
            <Button className="w-full" onClick={submitFileTest}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>

      {classes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No classes yet.</Card>
      ) : tests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No tests yet for this class.</Card>
      ) : isTeacher ? (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs label-caps">
              <tr>
                <th className="text-left px-4 py-3">Student</th>
                {tests.map((t) => (
                  <th key={t.id} className="text-left px-4 py-3">
                    {t.title}
                    <div className="font-normal text-[10px] text-muted-foreground">/{t.max_marks} · {t.kind === "mcq" ? "MCQ" : "File"}</div>
                    {t.paper_url && (
                      <button className="font-normal text-[10px] underline text-muted-foreground" onClick={() => downloadPaper(t.paper_url)}>Paper</button>
                    )}
                    <div className="flex gap-1 mt-1">
                      {t.kind === "mcq" && (
                        <Button size="icon" variant="ghost" className="h-5 w-5" title="View / edit MCQs" onClick={() => openEditMcq(t)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive" title="Delete test" onClick={() => deleteTest(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((sid) => {
                const p = profMap.get(sid);
                return (
                  <tr key={sid} className="border-t border-border">
                    <td className="px-4 py-2">
                      <Link to="/profile" search={{ id: sid }} className="hover:underline">
                        {p?.full_name || "-"}
                      </Link>
                    </td>
                    {tests.map((t) => {
                      const sc = findScore(t.id, sid);
                      if (t.kind === "mcq") {
                        return (
                          <td key={t.id} className="px-4 py-2 text-sm">
                            {sc ? `${sc.score} / ${t.max_marks}` : <span className="text-muted-foreground text-xs">Not submitted</span>}
                          </td>
                        );
                      }
                      const key = `${t.id}:${sid}`;
                      const current = draft[key] ?? (sc?.score?.toString() ?? "");
                      const dirty = draft[key] !== undefined && draft[key] !== (sc?.score?.toString() ?? "");
                      const sub = fileSubs.get(key);
                      return (
                        <td key={t.id} className="px-4 py-2">
                          <div className="flex flex-col gap-1">
                            {sub?.file_url ? (
                              <button className="text-xs underline text-left flex items-center gap-1" onClick={() => downloadPaper(sub.file_url)}>
                                <Download className="h-3 w-3" /> Submission
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">No upload</span>
                            )}
                            <div className="flex gap-1 items-center">
                            <Input
                              type="number" className="h-8 w-20"
                              value={current}
                              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                            />
                            <Button
                              size="sm" variant={dirty ? "default" : "outline"}
                              className="h-8 px-2 text-xs"
                              disabled={current === "" || !dirty}
                              onClick={() => setScore(t.id, sid, Number(current))}
                            >
                              Submit score
                            </Button>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs label-caps">
              <tr><th className="text-left px-4 py-3">Test</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Action</th><th className="text-left px-4 py-3">Score</th></tr>
            </thead>
            <tbody>
              {tests.map((t) => {
                const sc = scores.find((s) => s.test_id === t.id);
                const mySub = user ? fileSubs.get(`${t.id}:${user.id}`) : null;
                return (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-3">{t.title}</td>
                    <td className="px-4 py-3 capitalize">{t.kind}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(t.test_date)}</td>
                    <td className="px-4 py-3">
                      {t.kind === "mcq" ? (
                        sc ? <span className="text-xs text-muted-foreground">Attempted</span>
                          : <Button size="sm" onClick={() => openMcq(t)}>Take test</Button>
                      ) : (
                        <div className="flex flex-col gap-1 items-start">
                          {t.paper_url && (
                            <button className="underline text-xs flex items-center gap-1" onClick={() => downloadPaper(t.paper_url)}>
                              <Download className="h-3 w-3" /> Question paper
                            </button>
                          )}
                          {mySub?.file_url && (
                            <button className="underline text-xs flex items-center gap-1" onClick={() => downloadPaper(mySub.file_url)}>
                              <Download className="h-3 w-3" /> Your submission
                            </button>
                          )}
                          <Button size="sm" variant={mySub ? "outline" : "default"} className="h-7 text-xs"
                            onClick={() => { setUploadTest(t); setUploadNotes(mySub?.notes ?? ""); }}>
                            <Upload className="h-3 w-3 mr-1" />
                            {mySub ? "Update upload" : "Upload answer"}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{sc ? `${sc.score} / ${t.max_marks}` : <span className="text-muted-foreground">-</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
