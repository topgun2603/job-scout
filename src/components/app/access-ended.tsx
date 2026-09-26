"use client";

import { motion } from "framer-motion";
import { FileText, Hourglass } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Me } from "@/lib/me";

export function AccessEnded({ me }: { me: Me }) {
  const never = !me.access.expiresAt;
  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      <motion.div
        initial={{ rotate: 0 }}
        animate={{ rotate: [0, 180, 180, 360] }}
        transition={{ repeat: Infinity, duration: 3, times: [0, 0.4, 0.6, 1] }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-primary/12 text-primary"
      >
        <Hourglass className="size-9" />
      </motion.div>
      <h1 className="mt-6 font-display text-3xl font-extrabold tracking-tight">
        {never ? "Your access isn't active yet" : "Your access has ended"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {never
          ? "Your admin hasn't started a pass for you. Once they do, your matched jobs appear here."
          : `Your pass ended on ${new Date(me.access.expiresAt!).toLocaleString("en-IN")}. Ask your admin to renew it.`}
      </p>
      {me.hasResume && (
        <Button asChild variant="outline" className="mt-6">
          <Link href="/resume">
            <FileText /> Preview my resume
          </Link>
        </Button>
      )}
    </main>
  );
}
