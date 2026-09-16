import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  badge?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  badge,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border-subtle bg-surface/40 max-w-lg mx-auto my-8 ${className}`}
    >
      {badge && (
        <span className="text-[10px] font-mono tracking-wider uppercase text-text-tertiary px-2 py-0.5 rounded border border-border-subtle bg-card mb-4">
          {badge}
        </span>
      )}
      {icon && (
        <div className="w-10 h-10 rounded-full border border-border-subtle bg-card flex items-center justify-center text-text-secondary mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-text-primary mb-1 tracking-tight">
        {title}
      </h3>
      <p className="text-xs text-text-secondary max-w-sm leading-relaxed mb-5">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  );
}
