import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireAuth, useAuth } from "@/lib/app";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { BookOpen, FileText, GraduationCap, CalendarCheck, Shield, Users, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard - College Portal" }] }),
  component: () => <RequireAuth><Dashboard /></RequireAuth>,
});

function Dashboard() {
  const { user, profile, role } = useAuth();
  const [stats, setStats] = useState({ classes: 0, assignments: 0, pending: 0, attendancePct: 0 });
  const [recent, setRecent] = useState<{ id: string; title: string; class_id: string; due_at: string | null }[]>([]);
  const [adminStats, setAdminStats] = useState({ classes: 0, students: 0, teachers: 0 });
  // bumping `tick` re-runs the data effect — used by the focus listener so
  // dashboards refresh whenever the user comes back to the tab.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      if (role === "admin") {
        const [{ count: cCount }, { count: sCount }, { count: tCount }] = await Promise.all([
          supabase.from("classes").select("id", { count: "exact", head: true }),
          supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "student"),
          supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "teacher"),
        ]);
        setAdminStats({ classes: cCount ?? 0, students: sCount ?? 0, teachers: tCount ?? 0 });
        return;
      }
      if (role === "teacher") {
        // Teacher's classes = ones they own + ones admin assigned them to.
        const [{ data: own }, { data: extra }] = await Promise.all([
          supabase.from("classes").select("id").eq("teacher_id", user.id),
          supabase.from("class_teachers").select("class_id").eq("teacher_id", user.id),
        ]);
        const classIds = Array.from(new Set([
          ...((own ?? []) as any[]).map((c) => c.id),
          ...((extra ?? []) as any[]).map((r) => r.class_id),
        ]));
        const [{ count: aCount }, { data: pendingSubs }] = await Promise.all([
          supabase.from("assignments").select("id", { count: "exact", head: true }).in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"]),
          supabase.from("submissions").select("id, assignment:assignments!inner(class_id)").is("grade", null),
        ]);
        const pending = (pendingSubs ?? []).filter((s: any) => classIds.includes(s.assignment?.class_id)).length;
        setStats({ classes: classIds.length, assignments: aCount ?? 0, pending, attendancePct: 0 });

        const { data: r } = await supabase
          .from("assignments")
          .select("id, title, class_id, due_at")
          .in("class_id", classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"])
          .order("created_at", { ascending: false })
          .limit(5);
        setRecent(r ?? []);
      } else {
        const { data: enrolls } = await supabase.from("enrollments").select("class_id").eq("student_id", user.id);
        const classIds = (enrolls ?? []).map((e) => e.class_id);
        const safeIds = classIds.length ? classIds : ["00000000-0000-0000-0000-000000000000"];
        const [{ count: aCount }, { data: subs }, { data: att }] = await Promise.all([
          supabase.from("assignments").select("id", { count: "exact", head: true }).in("class_id", safeIds),
          supabase.from("submissions").select("id").eq("student_id", user.id),
          supabase.from("attendance").select("status").eq("student_id", user.id),
        ]);
        const totalA = aCount ?? 0;
        const submitted = (subs ?? []).length;
        const pending = Math.max(totalA - submitted, 0);
        const total = (att ?? []).length;
        const present = (att ?? []).filter((a) => a.status !== "absent").length;
        const pct = total ? Math.round((present / total) * 100) : 0;
        setStats({ classes: classIds.length, assignments: totalA, pending, attendancePct: pct });

        const { data: r } = await supabase
          .from("assignments")
          .select("id, title, class_id, due_at")
          .in("class_id", safeIds)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(5);
        setRecent(r ?? []);
      }
    })();
  }, [user, role, tick]);

  if (role === "admin") {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <div className="label-caps">Welcome back</div>
          <h1 className="mt-1 text-2xl font-semibold">{profile?.full_name || "Admin"}</h1>
          <p className="text-sm text-muted-foreground">Administrator</p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Link to="/admin" className="block">
            <Card className="p-5 h-full cursor-pointer hover:bg-accent/10 border-border hover:border-foreground/40">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div className="mt-3 text-2xl font-semibold">Open</div>
              <div className="text-xs label-caps mt-1">Admin panel</div>
            </Card>
          </Link>
          <Link to="/classes" className="block">
            <Card className="p-5 h-full cursor-pointer hover:bg-accent/10 border-border hover:border-foreground/40">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div className="mt-3 text-2xl font-semibold">{adminStats.classes}</div>
              <div className="text-xs label-caps mt-1">Classes</div>
            </Card>
          </Link>
          <Card className="p-5 h-full border-border">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="mt-3 text-2xl font-semibold">{adminStats.students}</div>
            <div className="text-xs label-caps mt-1">Students</div>
          </Card>
          <Card className="p-5 h-full border-border">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="mt-3 text-2xl font-semibold">{adminStats.teachers}</div>
            <div className="text-xs label-caps mt-1">Teachers</div>
          </Card>
          <Link to="/timetable" className="block">
            <Card className="p-5 h-full cursor-pointer hover:bg-accent/10 border-border hover:border-foreground/40">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div className="mt-3 text-2xl font-semibold">Manage</div>
              <div className="text-xs label-caps mt-1">Timetable</div>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  const cards = role === "teacher"
    ? [
        { label: "Classes taught", value: stats.classes, icon: BookOpen, to: "/classes" as const },
        { label: "Assignments posted", value: stats.assignments, icon: FileText, to: "/assignments" as const },
        { label: "Test / Grades", value: stats.pending, icon: GraduationCap, to: "/grades" as const },
        { label: "Attendance", value: "Open", icon: CalendarCheck, to: "/attendance" as const },
      ]
    : [
        { label: "Enrolled classes", value: stats.classes, icon: BookOpen, to: "/classes" as const },
        { label: "Assignments", value: stats.assignments, icon: FileText, to: "/assignments" as const },
        { label: "Test", value: stats.pending, icon: GraduationCap, to: "/grades" as const },
        { label: "Attendance", value: `${stats.attendancePct}%`, icon: CalendarCheck, to: "/attendance" as const },
      ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="label-caps">Welcome back</div>
        <h1 className="mt-1 text-2xl font-semibold">{profile?.full_name || "-"}</h1>
        <p className="text-sm text-muted-foreground capitalize">
          {role}{profile?.department ? ` · ${profile.department}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="block">
            <Card className="p-5 h-full cursor-pointer hover:bg-accent/10 border-border hover:border-foreground/40">
              <c.icon className="h-4 w-4 text-muted-foreground" />
              <div className="mt-3 text-2xl font-semibold">{c.value}</div>
              <div className="text-xs label-caps mt-1">{c.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-6">
        <div className="label-caps mb-3">Recent assignments</div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3">
                <Link to="/assignments/$id" params={{ id: a.id }} className="text-sm hover:underline">
                  {a.title}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString()}` : "No due date"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
