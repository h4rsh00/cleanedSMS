import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/app";
import {
  GraduationCap,
  BookOpen,
  CalendarCheck,
  FileText,
  Inbox,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "College Portal - College Student Management System" },
      {
        name: "description",
        content:
          "A professional college portal for students and faculty. Classes, assignments, attendance, grades, messaging.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: BookOpen, title: "Classes & Courses", body: "Create or join classes with a unique code. Manage rosters, materials and announcements.", to: "/classes" as const },
  { icon: FileText, title: "Assignments", body: "Post assignments, upload submissions, and grade work with feedback.", to: "/assignments" as const },
  { icon: GraduationCap, title: "Grades & Test Scores", body: "Maintain a gradebook. Students see only their own results.", to: "/grades" as const },
  { icon: CalendarCheck, title: "Attendance", body: "Mark daily attendance per class. Students view their full attendance history.", to: "/attendance" as const },
  { icon: Inbox, title: "Messaging", body: "Direct inbox between students and teachers for academic queries.", to: "/messages" as const },
  { icon: CalendarDays, title: "Timetable", body: "Weekly schedule generated from class slots - visible to all members.", to: "/timetable" as const },
];

function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const openFeature = (to: typeof FEATURES[number]["to"]) => {
    if (user) navigate({ to });
    else navigate({ to: "/login" });
  };
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-semibold tracking-tight">College Portal</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm">Create account</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <div className="label-caps mb-4">Student Management System</div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl max-w-3xl">
            One portal for students and faculty.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Manage classes, assignments, attendance, test scores, announcements, and messaging in
            one disciplined, professional workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup"><Button size="lg">Get started</Button></Link>
            <Link to="/login"><Button size="lg" variant="outline">Sign in</Button></Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="label-caps mb-6">What you can do</div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <button
              key={f.title}
              type="button"
              onClick={() => openFeature(f.to)}
              className="bg-card p-6 text-left hover:bg-accent/10 group"
            >
              <f.icon className="mb-3 h-5 w-5 text-muted-foreground group-hover:text-foreground" />
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              <div className="mt-3 text-xs label-caps text-muted-foreground group-hover:text-foreground">Open →</div>
            </button>
          ))}
        </div>
      </section>

    </div>
  );
}
