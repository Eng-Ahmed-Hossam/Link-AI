export const setupWorker = (): never => {
  throw new Error("msw/browser is browser-only");
};
