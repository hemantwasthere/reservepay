import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
const actionStyles =
  "inline-flex items-center justify-center gap-3 min-h-[46px] py-0 px-[21px] [border:1px_solid_transparent] rounded-[3px] text-[13px] font-[500] [transition:color_180ms_ease,_background-color_180ms_ease,_border-color_180ms_ease,_box-shadow_180ms_ease,_transform_220ms_var(--ease-settle)] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:not(:disabled):active]:[transform:translateY(1px)_scale(0.985)] [&>svg]:[transition:transform_280ms_var(--ease-settle)] [@media((hover:_hover)_and_(pointer:_fine))]:[&:not(:disabled):hover>svg:last-child:not(.pending-spinner)]:[transform:translateX(3px)] motion-reduce:[&:hover]:[transform:none]! motion-reduce:[&:active]:[transform:none]! motion-reduce:[&>svg]:[transform:none]!";
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[3px] text-[13px] font-medium transition-[background-color,color,transform,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        brand:
          actionStyles +
          " bg-primary text-primary-foreground [&:hover:not(:disabled)]:bg-primary/90",
        ink:
          actionStyles +
          " bg-foreground text-background [&:hover:not(:disabled)]:bg-foreground/90",
        quiet:
          actionStyles +
          " border-[light-dark(#cdd3c5,var(--border))] bg-transparent [&:hover]:bg-[light-dark(#eaf0e3,var(--secondary))]",
        default:
          "border border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        outline: "border border-border bg-card text-foreground hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "bg-transparent hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        unstyled: "",
      },
      size: {
        default: "min-h-11 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-6",
        "icon-lg": "size-10",
        xs: "h-6 px-2 text-xs",
        unstyled: "",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? type : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
export { Button, buttonVariants };
