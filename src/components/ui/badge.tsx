import React from "react";

export type BadgeVariant =
  | "knowledge"
  | "memory"
  | "tasks"
  | "danger"
  | "neutral"
  | "success"
  | "warning";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
}

export function Badge({
  children,
  variant = "neutral",
  size = "sm",
  className = "",
}: BadgeProps) {
  const variantStyles: Record<BadgeVariant, string> = {
    knowledge: "bg-accent-knowledge/10 text-accent-knowledge border-accent-knowledge/20",
    memory: "bg-accent-memory/10 text-accent-memory border-accent-memory/20",
    tasks: "bg-accent-tasks/10 text-accent-tasks border-accent-tasks/20",
    danger: "bg-accent-danger/10 text-accent-danger border-accent-danger/20",
    neutral: "bg-card text-text-secondary border-border-subtle",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  const sizeStyles = {
    sm: "text-[11px] px-2 py-0.5 font-mono tracking-tight",
    md: "text-xs px-2.5 py-1 font-mono",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border font-medium transition-colors ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
}
