"use client";

import { motion } from "framer-motion";
import { Briefcase, Building2, FileText, LogOut, ShieldCheck, Timer } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/dashboard/hero";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { msUntil, useNow } from "@/hooks/use-now";
import { formatLeft, PLANS } from "@/lib/access";
import type { Me } from "@/lib/me";
import { cn } from "@/lib/utils";

export function AccessChip({ me }: { me: Me }) {
  const now = useNow(1000);
  if (me.role === "admin") return null;
  const left = now ? msUntil(me.access.expiresAt, now) : me.access.msLeft;
  const active = me.access.active && left > 0;
  const urgent = active && left < 3_600_000;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tabular-nums",
            !active ? "bg-careful/15 text-careful" : urgent ? "bg-maybe/20 text-foreground" : "bg-strong/15 text-strong",
          )}
        >
          <Timer className={cn("size-3.5", urgent && "animate-pulse")} />
          {active ? formatLeft(left) : "Access expired"}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {active && me.access.plan
          ? `${PLANS[me.access.plan].label} pass · until ${new Date(me.access.expiresAt!).toLocaleString("en-IN")}`
          : "Ask the admin to renew your access"}
      </TooltipContent>
    </Tooltip>
  );
}

export function TopBar({ me }: { me: Me }) {
  const pathname = usePathname();
  const router = useRouter();
  const links =
    me.role === "admin"
      ? [
          { href: "/admin", label: "Applicants", icon: ShieldCheck },
          { href: "/admin/mncs", label: "MNCs", icon: Building2 },
          { href: "/", label: "Jobs", icon: Briefcase },
        ]
      : [
          { href: "/", label: "My jobs", icon: Briefcase },
          { href: "/mncs", label: "MNC jobs", icon: Building2 },
          { href: "/resume", label: "My resume", icon: FileText },
        ];

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
        <Link href={me.role === "admin" ? "/admin" : "/"} className="mr-2 font-display text-lg font-extrabold tracking-tight">
          Job<span className="text-primary">Scout</span>
        </Link>
        <nav className="flex items-center rounded-full border bg-card p-0.5">
          {links.map((l) => {
            const on = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {on && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                )}
                <l.icon className="relative size-3.5" />
                <span className="relative hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <AccessChip me={me} />
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {me.fullName || me.username}
            {me.role === "admin" && <span className="ml-1.5 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">admin</span>}
          </span>
          <ThemeToggle />
          <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );
}
