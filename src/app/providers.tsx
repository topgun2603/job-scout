"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-center" richColors closeButton toastOptions={{ className: "!rounded-2xl" }} />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
