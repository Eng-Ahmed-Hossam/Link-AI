import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface BottomNavItem {
  id: string;
  label: string;
  /** Optional: the parent PWA tab bar in Figma is text-only. */
  icon?: ReactNode;
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

/**
 * Floating tab bar (Figma P02 "Tab bar"): a card with equal tabs; the active tab is a blueSoft
 * pill with blueText label and `aria-current="page"`, and is bold, so it is not colour alone.
 */
export function BottomNav({ items, activeId, label, renderLink }: BottomNavProps) {
  return (
    <nav aria-label={label} className="rounded-16 border border-border bg-white p-1.5 shadow-card">
      <ul className="flex gap-1">
        {items.map((item) => {
          const active = item.id === activeId;
          const props: BottomNavLinkProps = {
            className: cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-12 px-2 py-3 text-label',
              active ? 'bg-blueSoft text-blueText' : 'text-muted hover:bg-soft',
            ),
            'aria-current': active ? 'page' : undefined,
            children: (
              <>
                {item.icon ? (
                  <span aria-hidden className="[&>svg]:size-5">
                    {item.icon}
                  </span>
                ) : null}
                <span>{item.label}</span>
              </>
            ),
          };
          return (
            <li key={item.id} className="flex flex-1">
              {renderLink ? renderLink(item, props) : <a href={item.href} {...props} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
