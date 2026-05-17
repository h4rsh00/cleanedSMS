/* =============================================================================
 * src/lib/app.tsx
 * -----------------------------------------------------------------------------
 * Single consolidated module that holds the building-blocks shared by every
 * page of the College Portal. Keeping these together makes the project easier
 * to read - instead of jumping between many small files, you can find:
 *
 *   1. Auth context         - current user / profile / role / sign-out
 *   2. RequireAuth wrapper  - redirects to /login if no user
 *   3. AppShell layout      - sidebar + top header used on every signed-in page
 *   4. BatchPicker widget   - choose / create a Program-Semester-Section batch
 *   5. Small data helpers   - fetchProfilesByIds, formatDate, formatDateTime
 *
 * Each section below is clearly labelled. Routes import from this one file.
 * ===========================================================================*/

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Shield,
  UserCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* =============================================================================
 * 1. AUTH CONTEXT
 * -----------------------------------------------------------------------------
 * Exposes the current Supabase user, their profile row, and their role
 * ("student" | "teacher") to every component via the useAuth() hook.
 * ===========================================================================*/

export type AppRole = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  full_name: string;
  department: string | null;
  identifier: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  // Loads both the profile row and the user's role in parallel.
  const loadProfile = async (uid: string) => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setRole((r?.role as AppRole) ?? null);
  };

  useEffect(() => {
    // Subscribe FIRST so we never miss an auth event that fires during init.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        // Defer the profile fetch - Supabase warns against awaiting inside
        // the auth callback because it can deadlock the internal lock.
        setTimeout(() => void loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    // Then read the existing session once on mount.
    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <Ctx.Provider
      value={{ user, session, profile, role, loading, signOut, refreshProfile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}

/* =============================================================================
 * 2. REQUIRE AUTH
 * -----------------------------------------------------------------------------
 * Wraps a page so that only signed-in users can see it. Anyone else is sent
 * to /login. Also wraps the page in <AppShell> so every signed-in page gets
 * the sidebar + header for free.
 * ===========================================================================*/

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!user) return null;
  return <AppShell>{children}</AppShell>;
}

/* =============================================================================
 * 3. APP SHELL
 * -----------------------------------------------------------------------------
 * The persistent sidebar + top header used on every authenticated page.
 * The sidebar is fixed on desktop (lg+) and turns into a slide-in drawer on
 * mobile. The header shows a Back button on every route except dashboard/home.
 * ===========================================================================*/

// Order here = order shown in the sidebar.
const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["student", "teacher", "admin"] as AppRole[] },
  { to: "/admin", label: "Admin", icon: Shield, roles: ["admin"] as AppRole[] },
  { to: "/classes", label: "Classes", icon: BookOpen, roles: ["student", "teacher", "admin"] as AppRole[] },
  { to: "/assignments", label: "Assignments", icon: FileText, roles: ["student", "teacher"] as AppRole[] },
  { to: "/grades", label: "Test / Grades", icon: GraduationCap, roles: ["student", "teacher"] as AppRole[] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["student", "teacher"] as AppRole[] },
  { to: "/messages", label: "Messages", icon: Inbox, roles: ["student", "teacher", "admin"] as AppRole[] },
  { to: "/timetable", label: "Timetable", icon: CalendarDays, roles: ["student", "teacher", "admin"] as AppRole[] },
  { to: "/profile", label: "Profile", icon: UserCircle, roles: ["student", "teacher", "admin"] as AppRole[] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, signOut, user } = useAuth();
  const navigate = useNavigate();
  const router = useRouter();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false); // mobile-drawer open?

  // Show the Back button on every page except the two "home" screens.
  const canGoBack = path !== "/dashboard" && path !== "/";
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  // The sidebar markup is identical on desktop and mobile, so we declare it
  // once and render it in both places.
  const Sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="text-xs label-caps">College Portal</div>
        <div className="mt-1 text-base font-semibold">College Management</div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.filter((item) => !role || item.roles.includes(role)).map((item) => {
          const active = path === item.to || path.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="text-sm font-medium truncate">
          {profile?.full_name || user?.email}
        </div>
        <div className="text-xs text-muted-foreground capitalize">
          {role ?? "-"}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start gap-2 px-2"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">{Sidebar}</div>

      {/* Mobile drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">{Sidebar}</div>
        </>
      )}

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-4 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Hamburger - only on mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Back button - every page except home/dashboard */}
            {canGoBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                aria-label="Go back"
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}

            <div className="text-sm label-caps">
              {NAV.find((n) => path.startsWith(n.to))?.label ?? "Home"}
            </div>
          </div>

          <div className="text-xs text-muted-foreground hidden sm:block">
            {role === "teacher" ? "Faculty" : role === "admin" ? "Admin" : ""}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

/* =============================================================================
 * 4. BATCH PICKER
 * -----------------------------------------------------------------------------
 * A small widget for selecting (or creating) a "batch" - the combination of
 * Program + Semester + Section that groups students for auto-enrolment.
 *
 *   <BatchPicker value={batchId} onChange={setBatchId} />
 * ===========================================================================*/

export interface Batch {
  id: string;
  program: string;
  semester: number;
  section: string;
}

/** Human-friendly label for a batch - e.g. "BTech · Sem 3 · Sec A". */
export const formatBatch = (
  b: Pick<Batch, "program" | "semester" | "section">,
) => `${b.program} · Sem ${b.semester} · Sec ${b.section}`;

// Predefined options - students cannot invent new programs/sections.
export const PROGRAMS = [
  "B.Tech CSE",
  "B.Tech ECE",
  "B.Tech ME",
  "B.Tech Civil",
  "B.Tech IT",
  "B.Tech EEE",
  "B.Tech AI & DS",
  "B.Tech CDS",
  "B.Tech CCS",
  "BCA",
  "MCA",
  "BBA",
  "MBA",
  "B.Sc",
  "M.Sc",
  "B.Com",
  "M.Com",
  "BA",
  "MA",
] as const;
export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const SECTIONS = ["A", "B", "C", "D"] as const;

export function BatchPicker({
  value,
  onChange,
  allowCreate = true,
}: {
  value: string | null;
  onChange: (batchId: string | null) => void;
  /** Kept for API compatibility — picker always find-or-creates so students can join
   *  before a teacher sets up their batch. The class auto-enroll trigger pulls them in
   *  whenever a matching class is later created. */
  allowCreate?: boolean;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [program, setProgram] = useState<string>("");
  const [semester, setSemester] = useState<string>("");
  const [section, setSection] = useState<string>("");

  const load = async () => {
    const { data } = await supabase
      .from("batches")
      .select("id, program, semester, section")
      .order("program")
      .order("semester")
      .order("section");
    setBatches((data as Batch[]) ?? []);
  };
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!value) return;
    const b = batches.find((x) => x.id === value);
    if (b) {
      setProgram(b.program);
      setSemester(String(b.semester));
      setSection(b.section);
    }
  }, [value, batches]);

  useEffect(() => {
    if (!program || !semester || !section) return;
    const sem = parseInt(semester, 10);
    const existing = batches.find(
      (b) => b.program === program && b.semester === sem && b.section === section,
    );
    if (existing) {
      if (existing.id !== value) onChange(existing.id);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("batches")
        .insert({ program, semester: sem, section })
        .select("id, program, semester, section")
        .single();
      if (data) {
        setBatches((prev) => [...prev, data as Batch]);
        onChange((data as Batch).id);
      }
    })();
  }, [program, semester, section, batches, value, onChange]);

  // allowCreate is intentionally ignored — see prop doc above.
  void allowCreate;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Program</Label>
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              {PROGRAMS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Semester</Label>
          <Select value={semester} onValueChange={setSemester}>
            <SelectTrigger><SelectValue placeholder="Sem" /></SelectTrigger>
            <SelectContent>
              {SEMESTERS.map((s) => (
                <SelectItem key={s} value={String(s)}>Semester {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Class / Section</Label>
          <Select value={section} onValueChange={setSection}>
            <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>Class {s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
 * 5. DATA HELPERS
 * -----------------------------------------------------------------------------
 * Tiny utilities used by several pages. Kept here so any page only needs to
 * import from "@/lib/app" instead of a separate helpers file.
 * ===========================================================================*/

/**
 * Look up multiple profile rows in one round-trip and return them as a Map
 * keyed by user id - convenient for joining names onto lists of records.
 */
export async function fetchProfilesByIds(ids: string[]) {
  if (ids.length === 0) {
    return new Map<
      string,
      { id: string; full_name: string; identifier: string | null }
    >();
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, identifier")
    .in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/** Return profile rows only for users whose role is teacher. */
export async function fetchTeacherProfilesByIds(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map<string, { id: string; full_name: string; identifier: string | null }>();
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "teacher")
    .in("user_id", uniqueIds);
  return fetchProfilesByIds((roles ?? []).map((r) => r.user_id));
}

/** "12 Mar 2026" - short, locale-aware date. */
export function formatDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "12 Mar 2026, 4:30 PM" - short date + short time. */
export function formatDateTime(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
