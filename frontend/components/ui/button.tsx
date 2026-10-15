"use client";

import * as React from "react";
import { Button as RACButton, type ButtonProps as RACButtonProps } from "react-aria-components";
import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonVariantProps } from "@/components/ui/styles";
import { Spinner } from "@/components/ui/spinner";

export interface ButtonProps extends Omit<RACButtonProps, "className" | "children">, ButtonVariantProps {
  className?: string;
  children?: React.ReactNode;
  /** Shows a spinner in place of the leading icon and blocks repeat presses. */
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, icon, isDisabled, children, ...props }, ref) => (
    <RACButton
      ref={ref}
      isDisabled={isDisabled || loading}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </RACButton>
  ),
);
Button.displayName = "Button";
