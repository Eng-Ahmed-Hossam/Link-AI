import { useId, type ReactNode } from 'react';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { cn } from '../cn';

/**
 * Website-only components (landing page, public pages): Figma `Link Web / Button` (69:629) and
 * `Link Web / FAQ item` (76:657). App screens keep using `Button`.
 */
export type WebButtonStyle = 'primary' | 'onDark' | 'outline' | 'dark';

const webBase =
  'group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full px-[26px] py-4 text-web-button transition-[gap,padding,background-color,box-shadow,border-color] duration-200 hover:gap-3.5 hover:pe-[22px]';

const webStyles: Record<WebButtonStyle, string> = {
  primary:
    'bg-blue text-navy shadow-[0_6px_18px_rgba(0,173,247,0.28)] hover:bg-[#40c8ff] hover:shadow-[0_12px_32px_rgba(0,173,247,0.55)]',
  onDark:
    'border-[1.5px] border-white/25 bg-white/[0.06] text-white hover:border-white/55 hover:bg-white/[0.14]',
  outline: 'border-[1.5px] border-border bg-white text-navy hover:border-navy hover:bg-soft',
  dark: 'bg-navy text-white hover:bg-[#16324a] hover:shadow-[0_12px_28px_rgba(10,24,36,0.28)]',
};

/** Class names for a website button on any element (`<a>`, Next `Link`, `<button>`). */
export const webButtonClass = (style: WebButtonStyle = 'primary', className?: string) =>
  cn(webBase, webStyles[style], className);

/** The arrow after a website button label; it points the reading direction (mirrored in RTL). */
export const WebArrow = () => (
  <ArrowRight aria-hidden className="size-4 shrink-0 rtl:-scale-x-100" />
);

export function WebButton({
  style = 'primary',
  arrow = true,
  className,
  children,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> & {
  style?: WebButtonStyle;
  arrow?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className={webButtonClass(style, className)} {...rest}>
      {children}
      {arrow ? <WebArrow /> : null}
    </button>
  );
}

/** FAQ accordion row; the page keeps one open at a time (docs/11 §3). */
export function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        'rounded-[18px] border transition-[background-color,border-color,box-shadow] duration-200',
        open
          ? 'border-[1.5px] border-blue/55 bg-white shadow-[0_14px_36px_rgba(10,24,36,0.08)]'
          : 'border-border bg-bg',
      )}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-a`}
          id={`${id}-q`}
          onClick={onToggle}
          className="flex min-h-11 w-full cursor-pointer items-center gap-4 px-6 py-[22px] text-start"
        >
          <span className="flex-1 text-web-faq text-navy">{question}</span>
          <span
            aria-hidden
            className={cn(
              'flex size-[34px] shrink-0 items-center justify-center rounded-full [&>svg]:size-4',
              open ? 'bg-navy text-white' : 'border border-border bg-white text-navy',
            )}
          >
            {open ? <Minus /> : <Plus />}
          </span>
        </button>
      </h3>
      <div
        id={`${id}-a`}
        role="region"
        aria-labelledby={`${id}-q`}
        hidden={!open}
        className="-mt-2 px-6 pb-[22px] text-web-faq-answer text-muted"
      >
        {answer}
      </div>
    </div>
  );
}

/**
 * The FAQ accordion with no JavaScript (website pages): native `<details>` sharing one `name`, so
 * the browser keeps one answer open at a time. Same look as `FaqItem` (Figma 76:657).
 */
export function FaqList({ name, items }: { name: string; items: { q: string; a: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <details
          key={it.q}
          name={name}
          open={i === 0}
          className="group rounded-[18px] border border-border bg-bg transition-[background-color,border-color,box-shadow] duration-200 open:border-[1.5px] open:border-blue/55 open:bg-white open:shadow-[0_14px_36px_rgba(10,24,36,0.08)]"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-4 px-6 py-[22px] text-start [&::-webkit-details-marker]:hidden">
            <h3 className="m-0 flex-1 text-web-faq text-navy">{it.q}</h3>
            <span
              aria-hidden
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-white text-navy group-open:border-navy group-open:bg-navy group-open:text-white [&>svg]:size-4"
            >
              <Plus className="group-open:hidden" />
              <Minus className="hidden group-open:block" />
            </span>
          </summary>
          <div className="-mt-2 px-6 pb-[22px] text-web-faq-answer text-muted">{it.a}</div>
        </details>
      ))}
    </div>
  );
}
