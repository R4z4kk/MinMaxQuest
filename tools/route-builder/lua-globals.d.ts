declare function print(...args: unknown[]): void;
declare function pcall(f: () => void): [boolean, unknown];
declare function loadstring(chunk: string, chunkname?: string): [(() => unknown) | null, string | null];
