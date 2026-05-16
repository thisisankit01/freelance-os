import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-all focus-visible:border-violet-300 focus-visible:ring-[3px] focus-visible:ring-violet-500/15 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-violet-200 bg-violet-50 text-violet-700 [a]:hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
        secondary:
          "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 [a]:hover:bg-fuchsia-100 dark:border-fuchsia-900 dark:bg-fuchsia-950/35 dark:text-fuchsia-300",
        destructive:
          "border-rose-200 bg-rose-50 text-rose-700 focus-visible:ring-rose-500/20 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-300 dark:focus-visible:ring-rose-500/30 [a]:hover:bg-rose-100",
        outline:
          "border-violet-200 bg-white text-violet-700 [a]:hover:bg-violet-50 dark:border-violet-900 dark:bg-zinc-950 dark:text-violet-300",
        ghost:
          "border-transparent text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
