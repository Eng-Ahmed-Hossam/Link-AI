/** Dev-only: visible whenever mock data is on. */
export function MockBadge({ label }: { label: string }) {
  return (
    <div
      role="note"
      className="pointer-events-none fixed bottom-20 end-3 z-50 rounded-full bg-navy px-3 py-1 text-caption font-semibold text-white opacity-90"
    >
      {label}
    </div>
  );
}
