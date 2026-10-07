/**
 * Ambient declarations for the Jest test environment. The frontend's
 * tsconfig does not include `@types/jest` (only the backend does), so the
 * globals used by component tests are declared here.
 */
declare global {
  // Minimal shape of the jest global used by the component tests.
  const jest: {
    fn: <T extends (...args: any[]) => unknown>(implementation?: T) => {
      (...args: Parameters<T>): ReturnType<T>;
      mockResolvedValue(value: Awaited<ReturnType<T>>): ReturnType<T>;
      mockRejectedValue(value: unknown): ReturnType<T>;
      mockImplementation(fn: T): ReturnType<T>;
    };
    expect: (actual: unknown) => unknown;
  };
}

export {};