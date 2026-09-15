export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full p-8 rounded-lg border border-border-subtle bg-surface shadow-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border-subtle bg-card text-xs font-mono text-text-secondary mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          PHASE 6: FOUNDATION
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-text-primary mb-2">
          VYAVASTHA
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          Personal Multimodal Knowledge & Memory Operating System
        </p>

        <div className="text-xs text-text-tertiary border-t border-border-subtle pt-4 space-y-1">
          <p>Database: Connected to Turso (aws-ap-south-1)</p>
          <p>Runtime: Node.js 22 / Bun 1.4 / Next.js 15</p>
          <div className="pt-2">
            <a
              href="/api/health"
              className="text-accent-tasks hover:underline font-mono text-xs"
            >
              Probe /api/health →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
