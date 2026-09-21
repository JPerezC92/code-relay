import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GATEWAY_PORT,
  EXEC_TIMEOUT_MS,
  EndpointError,
  READ_ONLY_TAILSCALE_COMMANDS,
  detectEndpoints,
  runReadOnlyCommand,
} from './endpoints';
import type { ExecFileLike, NetworkInterfacesFn } from './endpoints';

const TAILSCALE_IP_ARGV = READ_ONLY_TAILSCALE_COMMANDS[0];
const TAILSCALE_STATUS_ARGV = READ_ONLY_TAILSCALE_COMMANDS[1];

const noTailscale: ExecFileLike = (_file, _args, _options, callback) => {
  callback(new Error('not found'), '', '');
};

function interfacesFixture(): ReturnType<NetworkInterfacesFn> {
  return {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    eth0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
    docker0: [{ address: '0.0.0.0', family: 'IPv4', internal: false }],
    wlan0: [{ address: '10.0.0.5', family: 'IPv4', internal: false }],
    eth0v6: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
  };
}

describe('detectEndpoints', () => {
  it('collects non-loopback ipv4 lan addresses', async () => {
    const execFile = vi.fn(noTailscale);
    const endpoints = await detectEndpoints({
      networkInterfaces: interfacesFixture,
      execFile,
    });
    expect(endpoints).toEqual([
      { kind: 'lan', url: `http://192.168.1.20:${DEFAULT_GATEWAY_PORT}` },
      { kind: 'lan', url: `http://10.0.0.5:${DEFAULT_GATEWAY_PORT}` },
    ]);
  });

  it('adds tailscale ip and MagicDNS endpoints from read-only commands only', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const execFile: ExecFileLike = (file, args, _options, callback) => {
      calls.push({ file, args });
      if (file === 'tailscale' && args[0] === TAILSCALE_IP_ARGV[0]) {
        callback(null, '100.64.0.9\n', '');
        return;
      }
      if (file === 'tailscale' && args[0] === TAILSCALE_STATUS_ARGV[0]) {
        callback(null, JSON.stringify({ Self: { DNSName: 'host.tailnet.ts.net.' } }), '');
        return;
      }
      callback(new Error('not found'), '', '');
    };
    const endpoints = await detectEndpoints({
      networkInterfaces: () => ({}),
      execFile,
    });
    expect(endpoints).toEqual([
      { kind: 'tailscale', url: `http://host.tailnet.ts.net:${DEFAULT_GATEWAY_PORT}` },
      { kind: 'tailscale', url: `http://100.64.0.9:${DEFAULT_GATEWAY_PORT}` },
    ]);
    expect(calls.map((call) => [...call.args])).toEqual([
      [...TAILSCALE_IP_ARGV],
      [...TAILSCALE_STATUS_ARGV],
    ]);
    const allowed = READ_ONLY_TAILSCALE_COMMANDS.map((command) => [...command].join(' '));
    for (const call of calls) {
      expect(call.file).toBe('tailscale');
      expect(allowed).toContain([...call.args].join(' '));
    }
  });

  it('only invokes the read-only tailscale detect subcommands', async () => {
    const execFile = vi.fn(noTailscale);
    await detectEndpoints({ networkInterfaces: () => ({}), execFile });
    const invokedArgvs = execFile.mock.calls.map((call) => [...call[1]]);
    expect(invokedArgvs).toEqual([[...TAILSCALE_IP_ARGV]]);
    const allowed = READ_ONLY_TAILSCALE_COMMANDS.map((command) => [...command].join(' '));
    for (const argv of invokedArgvs) {
      expect(allowed).toContain(argv.join(' '));
    }
  });
});

describe('runReadOnlyCommand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the timeout to the exec port and resolves stdout', async () => {
    const received: number[] = [];
    const exec: ExecFileLike = (_file, _args, options, callback) => {
      received.push(options.timeoutMs);
      callback(null, '100.64.0.9\n', '');
    };
    await expect(runReadOnlyCommand(exec, 'tailscale', TAILSCALE_IP_ARGV)).resolves.toBe(
      '100.64.0.9\n',
    );
    expect(received).toEqual([EXEC_TIMEOUT_MS]);
  });

  it('rejects with EndpointError when the exec port times out', async () => {
    const hanging: ExecFileLike = () => {};
    const pending = runReadOnlyCommand(hanging, 'tailscale', TAILSCALE_IP_ARGV);
    const assertion = expect(pending).rejects.toBeInstanceOf(EndpointError);
    await vi.advanceTimersByTimeAsync(EXEC_TIMEOUT_MS);
    await assertion;
  });

  it('reports a failed exec as EndpointError', async () => {
    const exec: ExecFileLike = (_file, _args, _options, callback) => {
      callback(new Error('not found'), '', '');
    };
    await expect(runReadOnlyCommand(exec, 'tailscale', TAILSCALE_IP_ARGV)).rejects.toBeInstanceOf(
      EndpointError,
    );
  });
});
