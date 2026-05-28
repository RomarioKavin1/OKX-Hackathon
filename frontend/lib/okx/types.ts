export type Runner = (bin: string, args: string[], env: Record<string, string>) => Promise<string>;

export interface OkxConfig {
  bin?: string;
  env?: Record<string, string>;
  runner?: Runner;
}
