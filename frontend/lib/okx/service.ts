import { execFile } from "node:child_process";
import type { OkxConfig, Runner } from "./types";

const defaultRunner: Runner = (bin, args, env) =>
  new Promise((resolve, reject) =>
    execFile(bin, args, { env: { ...process.env, ...env }, maxBuffer: 1 << 24 }, (err, stdout, stderr) =>
      err ? reject(new Error(`${bin} ${args.join(" ")} failed: ${stderr || err.message}`)) : resolve(stdout)));

export class OkxService {
  private bin: string;
  private env: Record<string, string>;
  private runner: Runner;
  constructor(cfg: OkxConfig = {}) {
    this.bin = cfg.bin ?? "onchainos";
    this.env = cfg.env ?? {
      OKX_API_KEY: process.env.OKX_API_KEY ?? "",
      OKX_SECRET_KEY: process.env.OKX_SECRET_KEY ?? "",
      OKX_PASSPHRASE: process.env.OKX_PASSPHRASE ?? "",
    };
    this.runner = cfg.runner ?? defaultRunner;
  }
  async run<T = unknown>(args: string[]): Promise<T> {
    const withJson = args.includes("--output") ? args : [...args, "--output", "json"];
    const stdout = await this.runner(this.bin, withJson, this.env);
    return JSON.parse(stdout) as T;
  }
}
