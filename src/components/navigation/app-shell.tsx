"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onQuickAdd?: () => void;
  actionButton?: React.ReactNode;
}

export function AppShell({
  children,
  title,
  subtitle,
  onQuickAdd,
  actionButton,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  // If on login page, render bare
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) {
      setAuthenticated(true);
      return;
    }

    async function verifyAuth() {
      try {
        const res = await fetch("/api/auth");
        if (res.ok) {
          const data = await res.json();
          if (!data.authenticated) {
            router.push("/login");
          } else {
            setAuthenticated(true);
          }
        } else {
          router.push("/login");
        }
      } catch {
        router.push("/login");
      }
    }

    verifyAuth();
  }, [isLoginPage, router]);

  if (isLoginPage) {
    return <div className="min-h-screen bg-canvas text-text-primary">{children}</div>;
  }

  // Show a quiet loading state while checking session
  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-5 h-5 border-2 border-text-tertiary border-t-accent-knowledge rounded-full animate-spin" />
      </div>
    );
  }

  // Derive default titles if not provided
  const routeTitles: Record<string, { title: string; subtitle: string }> = {
    "/": { title: "Overview", subtitle: "Personal Multimodal Knowledge & Memory OS" },
    "/chat": { title: "Chat", subtitle: "Primary Doorway into Personal Knowledge" },
    "/library": { title: "Library", subtitle: "Layer A: Saved External Knowledge & Notes" },
    "/memory": { title: "Memory", subtitle: "Layer B: Identity Facts & Provenance" },
    "/tasks": { title: "Tasks", subtitle: "Layer C: Intentions & Extracted Tasks" },
    "/review": { title: "Weekly Review", subtitle: "Reflective Synthesis & Activity Document" },
  };

  const currentMeta = routeTitles[pathname] || {
    title: title || "VYAVASTHA",
    subtitle: subtitle || "Personal OS",
  };

  return (
    <div className="flex min-h-screen bg-canvas text-text-primary antialiased font-sans">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <Topbar
          title={title || currentMeta.title}
          subtitle={subtitle || currentMeta.subtitle}
          onOpenCommand={() => setCommandOpen(true)}
          onQuickAdd={onQuickAdd}
          actionButton={actionButton}
        />

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
      />
    </div>
  );
}
