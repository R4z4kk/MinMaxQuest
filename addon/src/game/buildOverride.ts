let override: string | null = null;

export function setBuildOverride(build: string | null): void {
  override = build;
}

export function getBuildOverride(): string | null {
  return override;
}
