import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Spinner } from "@/components/ui/spinner"

// Kelp: compact rounded rectangles for a dense console, Tide for the primary action.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[color,background-color,box-shadow,opacity,transform] duration-150 outline-none select-none active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_1px_rgb(0_0_0/0.08),inset_0_1px_0_rgb(255_255_255/0.12)] hover:brightness-110",
        outline:
          "bg-card text-foreground shadow-[0_0_0_0.5px_var(--input),0_1px_1px_rgb(0_0_0/0.05)] hover:bg-raised aria-expanded:bg-raised dark:bg-raised dark:hover:bg-[#3a3a3c]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[rgb(120_120_128/0.18)] aria-expanded:bg-[rgb(120_120_128/0.18)] dark:hover:bg-[rgb(120_120_128/0.32)]",
        ghost:
          "text-foreground hover:bg-accent aria-expanded:bg-accent",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/15 dark:hover:bg-destructive/25",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-lg px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  pending,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & {
  /** Kelp: a spinner slides in beside the label while an action runs, and slides out after. */
  pending?: boolean
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {pending !== undefined ? (
        <span
          data-slot="button-pending"
          data-on={pending ? "" : undefined}
          className="-mr-1.5 grid grid-cols-[0fr] opacity-0 transition-[grid-template-columns,margin,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-on:mr-0 data-on:grid-cols-[1fr] data-on:opacity-100"
        >
          <span className="min-w-0 overflow-hidden">
            <Spinner {...(pending ? {} : { role: undefined, "aria-hidden": true, "aria-label": undefined })} />
          </span>
        </span>
      ) : null}
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
