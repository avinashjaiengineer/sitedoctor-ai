import { lookup } from "node:dns/promises";
import net from "node:net";

/** An error whose message is safe and useful to show to the person who typed the URL. */
export class InputError extends Error {}

export function normalizeUrl(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new InputError("Enter a website address, like example.com.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InputError("That isn't a valid website address. Try something like example.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InputError("Only http and https addresses can be checked.");
  }
  if (url.username || url.password) {
    throw new InputError("Remove the username and password from the address.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || (!host.includes(".") && !net.isIP(host))) {
    throw new InputError("Enter a public website address. Local and intranet sites can't be reached.");
  }
  url.hash = "";
  return url;
}

/** Stable key so example.com, https://example.com/ and HTTPS://EXAMPLE.COM share a cached report. */
export function reportKey(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname.toLowerCase()}${path}${url.search}`;
}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/** Blocks requests to private networks (SSRF guard). Checked for every redirect hop. */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new InputError("That address points to a private network and can't be checked.");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new InputError(`We couldn't find ${host}. Check the spelling and try again.`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new InputError("That address points to a private network and can't be checked.");
  }
}
