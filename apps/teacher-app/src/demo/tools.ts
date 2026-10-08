/** The demo banner's "Demo tools" link (local demo only) opens the Demo controls panel. */
const openers = new Set<() => void>();
export const openDemoTools = () => openers.forEach((f) => f());
export function onOpenDemoTools(f: () => void) {
  openers.add(f);
  return () => {
    openers.delete(f);
  };
}
