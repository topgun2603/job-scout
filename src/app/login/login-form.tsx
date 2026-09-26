"use client";

import { motion, useAnimationControls } from "framer-motion";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Radar } from "@/components/dashboard/radar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const shake = useAnimationControls();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Sign-in failed.");
        shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
        return;
      }
      router.replace(body.role === "admin" ? "/admin" : "/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute left-1/4 top-10 -z-10 h-80 w-80 rounded-full bg-[var(--blob-1)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-10 right-1/4 -z-10 h-72 w-72 rounded-full bg-[var(--blob-2)] blur-3xl" />

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Radar active={busy} className="size-16" />
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">
            Job<span className="text-primary">Scout</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Fresh React roles, matched to your skills.</p>
        </div>

        <motion.div animate={shake}>
          <Card className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Username</span>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Password</span>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
              {error && (
                <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium text-careful" role="alert">
                  {error}
                </motion.p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                <LogIn /> {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>
        </motion.div>
        <p className="mt-4 text-center text-xs text-muted-foreground">No account? Your admin creates it for you.</p>
      </motion.div>
    </main>
  );
}
