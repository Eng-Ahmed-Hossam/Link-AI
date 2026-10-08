import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface SideNavItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode;
}

export interface SideNavSection {
  id: string;
  /** Section heading, for example "Marketplace". Omit for an ungrouped list. */
  label?: string;
  /** A small tag after the heading, for example "Paid extra". */
  tag?: string;
  items: SideNavItem[];
}

export interface SideNavLinkProps {
  className: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

export interface SideNavProps {
  sections: SideNavSection[];
  activeId: string;
  /** Accessible name of the nav landmark. */
  label: string;
  /** `dark` is the ops console (navy surface). */
  tone?: 'light' | 'dark';
  header?: ReactNode;
  footer?: ReactNode;
  renderLink?: (item: SideNavItem, props: SideNavLinkProps) => ReactNode;
  className?: string;
}

export function SideNav({
  sections,
  activeId,
  label,
  tone = 'light',
  header,
  footer,
  renderLink,
  className,
}: SideNavProps) {
  const dark = tone === 'dark';
  return (
    <nav
      aria-label={label}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-6 border-e p-4',
        dark ? 'border-navy bg-navy text-white' : 'border-border bg-white text-navy',
        className,
      )}
    >
      {header}
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-1">
          {section.label ? (
            <p
              className={cn(
                'px-3 pb-1 text-caption font-semibold',
                dark ? 'text-white/70' : 'text-muted',
              )}
            >
              {section.label}
              {section.tag ? (
                <span
                  data-testid={`nav-tag-${section.id}`}
                  className={cn(
                    'ms-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    dark ? 'bg-white/15 text-white' : 'bg-amberSoft text-amber',
                  )}
                >
                  {section.tag}
                </span>
              ) : null}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => {
              const active = item.id === activeId;
              const props: SideNavLinkProps = {
                className: cn(
                  'flex min-h-11 items-center gap-3 rounded-12 px-3 text-label',
                  dark
                    ? active
                      ? 'bg-white/15 text-white'
                      : 'text-white/80 hover:bg-white/10'
                    : active
                      ? 'bg-blueSoft text-navy'
                      : 'text-muted hover:bg-soft',
                ),
                'aria-current': active ? 'page' : undefined,
                children: (
                  <>
                    {item.icon ? (
                      <span aria-hidden className="[&>svg]:size-5">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0">{item.label}</span>
                  </>
                ),
              };
              return (
                <li key={item.id}>
                  {renderLink ? renderLink(item, props) : <a href={item.href} {...props} />}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {footer ? <div className="mt-auto">{footer}</div> : null}
    </nav>
  );
}
