"use client";

import React from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "../ui/button";

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenCommand: () => void;
  onQuickAdd?: () => void;
  actionButton?: React.ReactNode;
}

export function Topbar({
  title,
  subtitle,
  onOpenCommand,
  onQuickAdd,
  actionButton,
}: TopbarProps) {
  return (
    <header className="h-14 border-b border-border-subtle bg-surface/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Title & Section breadcrumb */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-text-primary tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <>
            <span className="text-border-subtle">•</span>
            <span className="text-xs text-text-secondary hidden sm:inline-block">
              {subtitle}
            </span>
          </>
        )}
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center gap-3">
        {/* Search trigger */}
        <button
          onClick={onOpenCommand}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-border-subtle bg-card/60 hover:bg-card hover:border-border-focus text-xs text-text-tertiary hover:text-text-secondary transition-all shadow-inner"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline-block">Quick search...</span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border-subtle bg-surface text-text-tertiary">
            ⌘K
          </kbd>
        </button>

        {/* Action Button or Quick Add */}
        {actionButton || (
          onQuickAdd && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={onQuickAdd}
            >
              Add
            </Button>
          )
        )}
      </div>
    </header>
  );
}
