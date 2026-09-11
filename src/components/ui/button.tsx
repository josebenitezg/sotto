import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  "pressable inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap outline-none transition-[background-color,border-color,color,transform] duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75",
        outline:
          "border border-border bg-transparent text-foreground hover:border-border-hover hover:bg-gray-100",
        secondary: "bg-gray-100 text-foreground hover:bg-gray-200",
        ghost: "text-muted-foreground hover:bg-gray-100 hover:text-foreground",
        destructive:
          "text-destructive hover:bg-destructive/10 data-[filled=true]:bg-destructive data-[filled=true]:text-black data-[filled=true]:hover:bg-destructive/90",
        link: "h-auto px-0 text-foreground underline underline-offset-4 hover:text-muted-foreground",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
