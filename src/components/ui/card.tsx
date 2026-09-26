import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("rounded-xl border bg-card text-card-foreground shadow-sm shadow-black/[0.03]", className)}
      {...props}
    />
  );
}

export { Card };
