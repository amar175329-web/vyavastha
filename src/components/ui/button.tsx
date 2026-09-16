import React from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "knowledge"
  | "memory"
  | "tasks"
  | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center gap-2 font-medium rounded transition-all focus:outline-none focus:ring-1 focus:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      "bg-text-primary text-canvas hover:bg-white border border-transparent shadow-sm",
    secondary:
      "bg-surface text-text-primary hover:bg-card border border-border-subtle hover:border-border-focus",
    ghost:
      "bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface/60 border border-transparent",
    knowledge:
      "bg-accent-knowledge/15 text-accent-knowledge hover:bg-accent-knowledge/25 border border-accent-knowledge/30",
    memory:
      "bg-accent-memory/15 text-accent-memory hover:bg-accent-memory/25 border border-accent-memory/30",
    tasks:
      "bg-accent-tasks/15 text-accent-tasks hover:bg-accent-tasks/25 border border-accent-tasks/30",
    danger:
      "bg-accent-danger/15 text-accent-danger hover:bg-accent-danger/25 border border-accent-danger/30",
  };

  const sizeStyles = {
    sm: "text-xs px-2.5 py-1.5 h-8 font-sans",
    md: "text-sm px-3.5 py-2 h-9 font-sans",
    lg: "text-base px-5 py-2.5 h-11 font-sans",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
