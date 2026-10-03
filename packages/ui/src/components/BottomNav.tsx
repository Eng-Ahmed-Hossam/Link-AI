import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface BottomNavItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

export interface BottomNavLinkProps {
  className: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  activeId: string;
  /** Accessible name of the nav landmark. */
  label: string;
  /** Inject the router's Link (for example Next `Link`). Defaults to a plain anchor. */
  renderLink?: (item: BottomNavItem, props: BottomNavLinkProps) => ReactNode;
}

export function BottomNav({ items, activeId, label, renderLink }: BottomNavProps) {
  return (
    <nav aria-label={label} className="sticky bottom-0 z-10 border-t border-border bg-white">
      <ul className="mx-auto flex max-w-xl">
        {items.map((item) => {
          const active = item.id === activeId;
          const props: BottomNavLinkProps = {
            className: cn(
              'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-caption',
              active ? 'font-semibold text-navy' : 'text-muted',
            ),
            'aria-current': active ? 'page' : undefined,
            children: (
              <>
                {/* Blue marks the active state as a shape, never as text colour. */}
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full [&>svg]:size-5',
                    active && 'bg-blueSoft',
                  )}
                >
                  <span aria-hidden className="contents">
                    {item.icon}
                  </span>
                </span>
                <span>{item.label}</span>
              </>
            ),
          };
          return (
            <li key={item.id} className="flex-1">
              {renderLink ? renderLink(item, props) : <a href={item.href} {...props} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
