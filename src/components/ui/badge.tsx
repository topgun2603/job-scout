import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        strong: "border-transparent bg-strong/15 text-strong",
        maybe: "border-transparent bg-maybe/20 text-[color-mix(in_oklch,var(--maybe)_70%,var(--foreground))]",
        careful: "border-transparent bg-careful/15 text-careful",
        lime: "border-transparent bg-lime text-[oklch(0.25_0.05_130)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
