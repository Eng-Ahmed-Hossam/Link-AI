import Image from 'next/image';

/**
 * Real app screens in device frames (landing "How it works"). The captures come from the running
 * app with sample data (scripts/landing-shots.mjs): phone 390×844 and laptop 1280×800, both @2×.
 */
export function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative w-[250px] rounded-[44px] bg-navy p-2.5 shadow-[0_30px_60px_-20px_rgba(10,24,36,0.45)] sm:w-[280px]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-4 z-10 mx-auto h-6 w-24 rounded-full bg-navy"
      />
      <Image
        src={src}
        alt={alt}
        width={780}
        height={1688}
        sizes="(min-width: 640px) 280px, 250px"
        className="h-auto w-full rounded-[34px]"
      />
    </div>
  );
}

export function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full max-w-[640px] overflow-hidden rounded-16 border border-border bg-white shadow-[0_30px_60px_-24px_rgba(10,24,36,0.35)]">
      <div
        aria-hidden
        dir="ltr"
        className="flex items-center gap-1.5 border-b border-border bg-soft px-4 py-2.5"
      >
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="mx-auto h-5 w-2/5 rounded-full bg-white" />
      </div>
      <Image
        src={src}
        alt={alt}
        width={2560}
        height={1600}
        sizes="(min-width: 1024px) 640px, 92vw"
        className="h-auto w-full"
      />
    </div>
  );
}
