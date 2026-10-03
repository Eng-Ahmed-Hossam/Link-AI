import { cn } from '@link/ui';

/**
 * Placeholder cover until centres upload photos (C02). Token gradients only; Figma's per-centre
 * hues (#3399e5, #1a7359, #734db2) are not tokens. Decorative.
 */
const covers = [
  'from-blue to-navy',
  'from-green to-navy',
  'from-blueText to-navy',
  'from-amber to-navy',
];

export function CentreCover({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={!children}
      className={cn('relative bg-gradient-to-r', covers[index % covers.length], className)}
    >
      {children}
    </div>
  );
}
