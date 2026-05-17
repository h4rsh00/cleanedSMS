import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth, useAuth, fetchProfilesByIds, formatDateTime } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/assignments/$id")({
  head: () => ({ meta: [{ title: "Assignment - College Portal" }] }),
  component: () => <RequireAuth><AssignmentDetail /></RequireAuth>,
});

function AssignmentDetail() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  const isTeacher = role === "teacher";

  const [a, setA] = useState<any>(null);
  const [klass, setKlass] = useState<any>(null);
  const [mySub, setMySub] = useState<any>(null);
  const [allSubs, setAllSubs] = useState<any[]>([]);
  const [profMap, setProfMap] = useState<Map<string, any>>(new Map());
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [roster, setRoster] = useState<string[]>([]);

  const load = async () => {
    const { data: ass } = await supabase.from("assignments").select("*").eq("id", id).maybeSingle();
    setA(ass);
    if (!ass) return;
    const { data: c } = await supabase.from("classes").select("*").eq("id", ass.class_id).maybeSingle();
    setKlass(c);
    if (!user) return;
    if (isTeacher) {
      const [{ data: subs }, { data: enr }] = await Promise.all([
        supabase.from("submissions").select("*").eq("assignment_id", id),
        supabase.from("enrollments").select("student_id").eq("class_id", ass.class_id),
      ]);
      setAllSubs(subs ?? []);
      const ids = (enr ?? []).map((e) => e.student_id);
      setRoster(ids);
      const profIds = Array.from(new Set([...(subs ?? []).map((s) => s.student_id), ...ids]));
      setProfMap(await fetchProfilesByIds(profIds));
    } else {
      const { data: m } = await supabase.from("submissions").select("*").eq("assignment_id", id).eq("student_id", user.id).maybeSingle();
      setMySub(m);
      setNotes(m?.notes ?? "");
    }
  };

  useEffect(() => { void load(); }, [id, user, isTeacher]);

  const submit = async () => {
    if (!user || !a) return;
    let file_url = mySub?.file_url ?? null;
    const file = fileRef.current?.files?.[0];
    if (file) {
      const path = `${a.class_id}/${user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("class-files").upload(path, file);
      if (upErr) return toast.error(upErr.message);
      file_url = path;
    }
    const payload = { assignment_id: id, student_id: user.id, file_url, notes, submitted_at: new Date().toISOString() };
    const { error } = await supabase.from("submissions").upsert(payload, { onConflict: "assignment_id,student_id" });
    if (error) return toast.error(error.message);
    toast.success("Submitted"); void load();
  };

  const grade = async (subId: string, score: number, feedback: string) => {
    const { error } = await supabase.from("submissions").update({ grade: score, feedback, graded_at: new Date().toISOString() }).eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success("Graded"); void load();
  };

  const downloadFile = async (path: string) => {
    const { data, error } = await supabase.storage.from("class-files").createSignedUrl(path, 60);
    if (error || !data) return toast.error(error?.message || "Failed");
    window.open(data.signedUrl, "_blank");
  };

  if (!a) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        {klass && <Link to="/classes/$id" params={{ id: klass.id }} className="text-xs text-muted-foreground hover:text-foreground">← {klass.name}</Link>}
        <div className="label-caps mt-3">Assignment</div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        <div className="text-xs text-muted-foreground mt-1">
          Due {formatDateTime(a.due_at)} · Max marks {a.max_marks}
        </div>
        {a.description && <p className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">{a.description}</p>}
        {a.attachment_url && (
          <div className="mt-3 text-sm">
            Attachment: <button className="underline" onClick={() => downloadFile(a.attachment_url)}>Download</button>
          </div>
        )}
      </div>

      {!isTeacher ? (
        <Card className="p-6 space-y-4">
          <div className="label-caps">Your submission</div>
          {(() => {
            if (!a.due_at) return null;
            const overdue = new Date(a.due_at) < new Date();
            if (mySub) {
              const late = new Date(mySub.submitted_at) > new Date(a.due_at);
              return late ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive p-3 text-sm">
                  ⚠ Submitted late on {formatDateTime(mySub.submitted_at)}
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  ✓ Submitted on time
                </div>
              );
            }
            return overdue ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive p-3 text-sm">
                ⚠ Deadline has passed - any submission will be marked late.
              </div>
            ) : null;
          })()}
          {mySub?.grade != null && (
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <div className="text-xs label-caps">Grade</div>
              <div className="text-xl font-semibold">{mySub.grade} / {a.max_marks}</div>
              {mySub.feedback && <p className="text-sm text-muted-foreground mt-2">{mySub.feedback}</p>}
            </div>
          )}
          {mySub?.file_url && (
            <div className="text-sm">
              Current file:{" "}
              <button className="underline" onClick={() => downloadFile(mySub.file_url)}>Download</button>
            </div>
          )}
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div><Label>File</Label><Input type="file" ref={fileRef} /></div>
          <Button onClick={submit}>{mySub ? "Update submission" : "Submit"}</Button>
        </Card>
      ) : (
        (() => {
          const subById = new Map(allSubs.map((s) => [s.student_id, s]));
          const lateCount = allSubs.filter((s) => a.due_at && new Date(s.submitted_at) > new Date(a.due_at)).length;
          const notSubmitted = roster.filter((sid) => !subById.has(sid));
          return (
            <Card className="p-0 overflow-hidden">
              <div className="px-6 py-4 flex flex-wrap gap-4 items-center border-b border-border">
                <div className="label-caps">Submissions</div>
                <div className="text-sm">
                  <span className="font-semibold">{allSubs.length}</span> / {roster.length} submitted
                  {lateCount > 0 && <span className="ml-2 text-destructive">· {lateCount} late</span>}
                  {notSubmitted.length > 0 && <span className="ml-2 text-muted-foreground">· {notSubmitted.length} pending</span>}
                </div>
              </div>
              {roster.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No students enrolled.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs label-caps">
                    <tr><th className="text-left px-4 py-3">Student</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">File</th><th className="text-left px-4 py-3">Grade</th></tr>
                  </thead>
                  <tbody>
                    {roster.map((sid) => {
                      const s = subById.get(sid);
                      const prof = profMap.get(sid);
                      if (!s) {
                        return (
                          <tr key={sid} className="border-t border-border">
                            <td className="px-4 py-3"><div>{prof?.full_name || "-"}</div><div className="text-xs text-muted-foreground">{prof?.identifier}</div></td>
                            <td className="px-4 py-3"><span className="text-xs rounded bg-muted px-2 py-1">Not submitted</span></td>
                            <td className="px-4 py-3 text-muted-foreground">-</td>
                            <td className="px-4 py-3 text-muted-foreground">-</td>
                          </tr>
                        );
                      }
                      const late = a.due_at && new Date(s.submitted_at) > new Date(a.due_at);
                      return (
                        <SubmissionRow
                          key={s.id} sub={s} maxMarks={a.max_marks} prof={prof}
                          late={late} onDownload={downloadFile} onGrade={grade}
                        />
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })()
      )}
    </div>
  );
}

function SubmissionRow({ sub, maxMarks, prof, late, onDownload, onGrade }: any) {
  const [score, setScore] = useState<string>(sub.grade != null ? String(sub.grade) : "");
  const [fb, setFb] = useState<string>(sub.feedback ?? "");
  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3">
        <div>{prof?.full_name || "-"}</div>
        <div className="text-xs text-muted-foreground">{prof?.identifier}</div>
      </td>
      <td className="px-4 py-3">
        {late ? (
          <span className="text-xs rounded bg-destructive/15 text-destructive px-2 py-1">Late</span>
        ) : (
          <span className="text-xs rounded bg-emerald-500/15 text-emerald-600 px-2 py-1">On time</span>
        )}
        <div className="text-xs text-muted-foreground mt-1">{formatDateTime(sub.submitted_at)}</div>
      </td>
      <td className="px-4 py-3">{sub.file_url ? <button className="underline" onClick={() => onDownload(sub.file_url)}>Download</button> : "-"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2 min-w-[180px]">
          <Input type="number" placeholder={`/${maxMarks}`} value={score} onChange={(e) => setScore(e.target.value)} />
          <Textarea placeholder="Feedback" value={fb} onChange={(e) => setFb(e.target.value)} rows={2} />
          <Button size="sm" onClick={() => onGrade(sub.id, Number(score), fb)}>Save</Button>
        </div>
      </td>
    </tr>
  );
}
