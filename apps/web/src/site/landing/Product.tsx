import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@link/ui';

const FIGMA = '/landing/figma';

/** Figma "Showcase" (72:722) is 1200 × 730; children are placed in percent of that box. */
const at = (x: number, y: number, w?: number): CSSProperties => ({
  position: 'absolute',
  insetInlineStart: `${(x / 1200) * 100}%`,
  top: `${(y / 730) * 100}%`,
  ...(w ? { width: `${(w / 1200) * 100}%` } : {}),
});

export type ProductWords = Record<
  | 'tabOwner'
  | 'tabTeacher'
  | 'tabParent'
  | 'calloutRule'
  | 'calloutConfirm'
  | 'altOwner'
  | 'altTeacher'
  | 'altParent'
  | 'label',
  string
>;

const browser = (alt: string) => (
  <Image
    src={`${FIGMA}/product-browser.webp`}
    alt={alt}
    width={2400}
    height={1690}
    sizes="(min-width: 1280px) 1200px, 100vw"
    className="h-auto w-full"
  />
);
const phone = (alt: string) => (
  <Image
    src={`${FIGMA}/product-phone.webp`}
    alt={alt}
    width={792}
    height={1344}
    sizes="396px"
    className="h-auto w-full"
  />
);

function Callout({
  icon,
  text,
  className,
  style,
}: {
  icon: ReactNode;
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p
      className={cn(
        'lp-callout flex w-max items-center gap-2.5 rounded-[14px] border border-border bg-white py-3 ps-3 pe-4 text-[14px] font-semibold text-navy shadow-[0_16px_36px_rgba(10,24,36,0.14)]',
        className,
      )}
      style={style}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-blueSoft"
      >
        {icon}
      </span>
      {text}
    </p>
  );
}

/**
 * Section 5's tabs and showcase (Figma 72:715, 72:722). "Owner dashboard" is the Figma
 * composition: Figma's renders of the A01 browser and the V02 phone, with the two callouts.
 * Figma shows only that tab, so the other two show the same Figma renders on their own: the
 * teacher's phone, and the approved WhatsApp update from the hero. The tabs are native radio
 * buttons and CSS, so the page ships no JavaScript for them.
 */
export function ProductShowcase({
  w,
  icons,
}: {
  w: ProductWords;
  icons: { rule: ReactNode; check: ReactNode };
}) {
  const tabs = [
    ['owner', w.tabOwner],
    ['teacher', w.tabTeacher],
    ['parent', w.tabParent],
  ] as const;
  // Written out in full so Tailwind sees each class (no class names built from variables).
  const panel = {
    owner: 'hidden w-full [.lp-tabs:has(input[value=owner]:checked)_&]:block',
    teacher: 'hidden w-full [.lp-tabs:has(input[value=teacher]:checked)_&]:block',
    parent: 'hidden w-full [.lp-tabs:has(input[value=parent]:checked)_&]:block',
  };
  return (
    <div className="lp-tabs flex w-full flex-col items-center gap-10">
      <div
        role="radiogroup"
        aria-label={w.label}
        className="flex max-w-full gap-1.5 overflow-x-auto rounded-full border border-border bg-white p-1.5"
      >
        {tabs.map(([id, label], i) => (
          <label
            key={id}
            className="flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-[18px] py-2.5 text-[14px] font-semibold whitespace-nowrap text-muted transition-colors hover:text-navy has-checked:bg-navy has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-blue"
          >
            <input
              type="radio"
              name="product-tab"
              value={id}
              defaultChecked={i === 0}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
      <div className={panel.owner} data-testid="product-owner">
        <div className="relative hidden aspect-[1200/730] w-full lg:block">
          <span style={at(20 - 60.5, -40.5, 1200)}>{browser(w.altOwner)}</span>
          <span className="lp-phone" style={at(944 - 70, 196 - 34, 396)}>
            {phone(w.altTeacher)}
          </span>
          <Callout icon={icons.rule} text={w.calloutRule} style={at(0, 520)} />
          <Callout
            icon={icons.check}
            text={w.calloutConfirm}
            className="lp-callout-2"
            style={at(700, 128)}
          />
        </div>
        <div className="flex flex-col items-center gap-4 lg:hidden">
          <div className="-mx-[5%] w-[110%]">{browser(w.altOwner)}</div>
          <div className="w-[70%] max-w-[300px]">{phone(w.altTeacher)}</div>
          <Callout icon={icons.rule} text={w.calloutRule} className="max-w-full" />
          <Callout icon={icons.check} text={w.calloutConfirm} className="max-w-full" />
        </div>
      </div>
      <div className={panel.teacher} data-testid="product-teacher">
        <div className="mx-auto w-[70%] max-w-[396px]">{phone(w.altTeacher)}</div>
      </div>
      <div className={panel.parent} data-testid="product-parent">
        <div className="mx-auto w-full max-w-[412px] py-10">
          <Image
            src={`${FIGMA}/hero-whatsapp.webp`}
            alt={w.altParent}
            width={824}
            height={536}
            sizes="412px"
            className="h-auto w-full"
          />
        </div>
      </div>
    </div>
  );
}
