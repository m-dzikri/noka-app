export default function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col gap-5 py-2 animate-pulse"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="h-8 w-48 rounded-xl bg-[var(--bg-subtle)]" />
        <div className="h-10 w-36 rounded-full bg-[var(--bg-subtle)]" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-28 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4" />
        <div className="h-28 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4" />
        <div className="h-28 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:col-span-2 lg:col-span-1" />
      </div>

      <div className="h-80 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5" />
    </div>
  );
}
