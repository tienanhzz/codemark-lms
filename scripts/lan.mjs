import { networkInterfaces } from "node:os";

// Only allow this server's addresses, never arbitrary LAN origins or '*'.
export function localHosts() {
  return [...new Set([
    "localhost",
    "127.0.0.1",
    ...Object.values(networkInterfaces()).flat().filter((entry) =>
      entry && entry.family === "IPv4" && !entry.internal &&
      !entry.address.startsWith("169.254.")
    ).map((entry) => entry.address),
  ])];
}

export function localOrigins() {
  return localHosts().map((host) => `http://${host}:3000`);
}
