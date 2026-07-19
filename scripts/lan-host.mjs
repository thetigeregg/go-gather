import { networkInterfaces } from 'node:os';

const PREFERRED_INTERFACE_PREFIXES = ['en0', 'en1', 'en2', 'en3', 'wlan0', 'eth0'];

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  if (parts[0] === 10) {
    return true;
  }

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  if (parts[0] === 192 && parts[1] === 168) {
    return true;
  }

  return false;
}

function collectIpv4Addresses(networkInterfacesFn = networkInterfaces) {
  const interfaces = networkInterfacesFn();
  const addresses = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) {
        continue;
      }

      addresses.push({ name, address: entry.address });
    }
  }

  return addresses;
}

/**
 * Resolves the Mac's LAN IP for a physical iOS device to reach the local dev
 * backend. `IOS_LAN_HOST` env var wins if set (useful when multiple network
 * interfaces are active, e.g. VPNs); otherwise auto-detects via
 * os.networkInterfaces(), preferring common Wi-Fi interface names.
 */
export function resolveLanHost(envValues = {}, options = {}) {
  const explicitHost = envValues.IOS_LAN_HOST?.trim();
  if (explicitHost) {
    return explicitHost;
  }

  const addresses = collectIpv4Addresses(options.networkInterfaces);

  for (const prefix of PREFERRED_INTERFACE_PREFIXES) {
    const match = addresses.find((entry) => entry.name === prefix && isPrivateIpv4(entry.address));
    if (match) {
      return match.address;
    }
  }

  const fallback = addresses.find((entry) => isPrivateIpv4(entry.address));
  return fallback?.address ?? null;
}

export function composeLocalBackendOrigin(host, port) {
  if (typeof host !== 'string' || host.trim().length === 0) {
    return null;
  }

  const parsedPort = Number.parseInt(String(port), 10);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    return null;
  }

  return `http://${host.trim()}:${parsedPort}`;
}
