"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Brain,
  CheckSquare,
  FileText,
} from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();

  const items = [
    { name: "Chat", href: "/chat", icon: MessageSquare, accent: "text-amber-400" },
    { name: "Library", href: "/library", icon: BookOpen, accent: "text-accent-knowledge" },
    { name: "Memory", href: "/memory", icon: Brain, accent: "text-accent-memory" },
    { name: "Tasks", href: "/tasks", icon: CheckSquare, accent: "text-accent-tasks" },
    { name: "Review", href: "/review", icon: FileText, accent: "text-emerald-400" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border-subtle bg-surface/95 backdrop-blur-md z-40 flex items-center justify-around px-2">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 w-14 h-12 rounded transition-colors ${
              isActive ? `${item.accent} font-medium` : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] tracking-tight">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
