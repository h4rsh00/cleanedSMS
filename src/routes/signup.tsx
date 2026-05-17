import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account - College Portal" }] }),
  component: SignupPage,
});

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  role: z.enum(["student", "teacher"]),
  identifier: z.string().trim().max(40).optional(),
  department: z.string().trim().max(80).optional(),
  batch_id: z.string().uuid().nullable().optional(),
  batch_program: z.string().trim().optional(),
  batch_semester: z.string().trim().optional(),
  batch_section: z.string().trim().optional(),
});

function SignupPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "student" as "student" | "teacher",
    identifier: "",
    department: "",
    batch_id: null as string | null,
    batch_program: "",
    batch_semester: "",
    batch_section: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: parsed.data.full_name,
          role: parsed.data.role,
          identifier: parsed.data.identifier || null,
          department: parsed.data.department || null,
          batch_id: parsed.data.batch_id || null,
          batch_program: parsed.data.batch_program || null,
          batch_semester: parsed.data.batch_semester || null,
          batch_section: parsed.data.batch_section || null,
        },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created. Signing you in…");
    navigate({ to: "/dashboard" });
  };

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <div className="mt-6 rounded-md border border-border bg-card p-8">
          <div className="label-caps">College Portal</div>
          <h1 className="mt-1 text-2xl font-semibold">Create account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose your role to get started.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>I am a</Label>
              <RadioGroup
                value={form.role}
                onValueChange={(v) => update("role", v as "student" | "teacher")}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 ${form.role === "student" ? "bg-accent" : ""}`}
                >
                  <RadioGroupItem value="student" /> Student
                </Label>
                <Label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 ${form.role === "teacher" ? "bg-accent" : ""}`}
                >
                  <RadioGroupItem value="teacher" /> Teacher
                </Label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="identifier">{form.role === "student" ? "Roll No" : "Staff ID"}</Label>
              <Input
                id="identifier"
                value={form.identifier}
                onChange={(e) => update("identifier", e.target.value)}
              />
            </div>
            {form.role === "student" && (
              <p className="text-xs text-muted-foreground">
                Your batch will be assigned by the admin after sign up.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creating…" : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
