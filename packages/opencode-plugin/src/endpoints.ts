import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';

export type EndpointKind = 'lan' | 'tailscale' | 'custom';

export interface Endpoint {
  kind: EndpointKind;
  url: string;
}

export const DEFAULT_GATEWAY_PORT = 47821;

export const EXEC_TIMEOUT_MS = 1500;

export const EXCLUDED_ADDRESSES: ReadonlySet<string> = new Set(['127.0.0.1', '0.0.0.0']);

export const READ_ONLY_TAILSCALE_COMMANDS = [
  ['ip', '-4'],
  ['status', '--json'],
] as const;

const TAILSCALE_IP_ARGV: readonly string[] = READ_ONLY_TAILSCALE_COMMANDS[0];
const TAILSCALE_STATUS_ARGV: readonly string[] = READ_ONLY_TAILSCALE_COMMANDS[1];

export class EndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EndpointError';
  }
}

export interface ExecFileOptions {
  timeoutMs: number;
  signal: AbortSignal;
}

export type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

export type ExecFileLike = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: ExecFileCallback,
) => void;

export interface Ipv4InterfaceInfo {
  address: string;
  family: string | number;
  internal: boolean;
}

export type NetworkInterfacesFn = () => Record<
  string,
  ReadonlyArray<Ipv4InterfaceInfo> | undefined
>;

export interface DetectEndpointsOptions {
  execFile?: ExecFileLike;
  networkInterfaces?: NetworkInterfacesFn;
  port?: number;
}

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const defaultExecFile: ExecFileLike = (file, args, options, callback) => {
  execFile(
    file,
    [...args],
    { encoding: 'utf8', timeout: options.timeoutMs, signal: options.signal },
    (error, stdout, stderr) => {
      callback(error, stdout ?? '', stderr ?? '');
    },
  );
};

function isIpv4(info: Ipv4InterfaceInfo): boolean {
  return info.family === 'IPv4' || info.family === 4;
}

export function isIpv4Address(value: string): boolean {
  return IPV4_PATTERN.test(value);
}

/**
 * Runs a read-only command through the injectable port with a bounded timeout.
 * A command that outlives `timeoutMs` rejects with `EndpointError`; any other
 * exec failure also surfaces as `EndpointError`.
 */
export function runReadOnlyCommand(
  exec: ExecFileLike,
  file: string,
  args: readonly string[],
  timeoutMs: number = EXEC_TIMEOUT_MS,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      controller.abort();
      reject(new EndpointError(`Command timed out after ${timeoutMs}ms: ${file}`));
    }, timeoutMs);
    exec(file, args, { timeoutMs, signal: controller.signal }, (error, stdout) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== null) {
        reject(error instanceof EndpointError ? error : new EndpointError(error.message));
        return;
      }
      resolve(stdout ?? '');
    });
  });
}

function readMagicDnsName(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const self = (parsed as { Self?: unknown }).Self;
  if (typeof self !== 'object' || self === null) return null;
  const dnsName = (self as { DNSName?: unknown }).DNSName;
  if (typeof dnsName !== 'string') return null;
  const trimmed = dnsName.replace(/\.$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export async function detectEndpoints(
  options: DetectEndpointsOptions = {},
): Promise<Endpoint[]> {
  const port = options.port ?? DEFAULT_GATEWAY_PORT;
  const listInterfaces: NetworkInterfacesFn = options.networkInterfaces ?? networkInterfaces;
  const exec: ExecFileLike = options.execFile ?? defaultExecFile;
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();

  const push = (kind: EndpointKind, url: string): void => {
    if (seen.has(url)) return;
    seen.add(url);
    endpoints.push({ kind, url });
  };

  for (const infos of Object.values(listInterfaces())) {
    for (const info of infos ?? []) {
      if (!isIpv4(info)) continue;
      if (info.internal) continue;
      if (EXCLUDED_ADDRESSES.has(info.address)) continue;
      if (!isIpv4Address(info.address)) continue;
      push('lan', `http://${info.address}:${port}`);
    }
  }

  const tailscaleUrls: string[] = [];
  let ipOutput: string | null = null;
  try {
    ipOutput = await runReadOnlyCommand(exec, 'tailscale', TAILSCALE_IP_ARGV);
  } catch {
    ipOutput = null;
  }
  if (ipOutput !== null) {
    for (const line of ipOutput.split('\n')) {
      const address = line.trim();
      if (isIpv4Address(address)) tailscaleUrls.push(`http://${address}:${port}`);
    }
    try {
      const statusOutput = await runReadOnlyCommand(exec, 'tailscale', TAILSCALE_STATUS_ARGV);
      const magicDnsName = readMagicDnsName(statusOutput);
      if (magicDnsName !== null) tailscaleUrls.unshift(`http://${magicDnsName}:${port}`);
    } catch {
      // MagicDNS is optional; a failed or timed-out status read is ignored.
    }
  }
  for (const url of tailscaleUrls) push('tailscale', url);

  return endpoints;
}

export function validateEndpoint(kind: EndpointKind, url: string): Endpoint | EndpointError {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new EndpointError(`Invalid endpoint URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new EndpointError(`Endpoint must use http or https: ${url}`);
  }
  if (parsed.hostname.length === 0) {
    return new EndpointError(`Endpoint is missing a host: ${url}`);
  }
  return { kind, url };
}

export function customEndpoint(url: string): Endpoint | EndpointError {
  return validateEndpoint('custom', url);
}
