/**
 * "Test environment — sample data" (Stage 3): on every page of a staging build, so nobody mistakes
 * the hosted staging for the real service. Server-rendered, no script.
 */
export function EnvBanner({ label }: { label: string }) {
  return (
    <div
      role="note"
      data-testid="env-banner"
      className="sticky top-0 z-50 border-b border-amber bg-amberSoft px-4 py-1 text-center text-caption font-semibold text-navy"
    >
      {label}
    </div>
  );
}
