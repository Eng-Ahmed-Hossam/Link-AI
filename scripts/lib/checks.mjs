export function parseMajorVersion(output) {
  const match = String(output).match(/(?:^|\s|v)(\d+)(?:\.\d+)+/i);
  return match ? Number(match[1]) : null;
}

export function pnpmVersionMatches(output, packageManager) {
  return String(output).trim() === String(packageManager).replace(/^pnpm@/, '');
}

function addPort(map, port, pid) {
  if (!map.has(port)) map.set(port, new Set());
  map.get(port).add(pid);
}

export function parseWindowsPorts(output) {
  const result = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (match) addPort(result, Number(match[1]), Number(match[2]));
  }
  return result;
}

export function parseUnixPorts(output) {
  const result = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^\S+\s+(\d+)\s+.*:(\d+)\s+\(LISTEN\)\s*$/);
    if (match) addPort(result, Number(match[2]), Number(match[1]));
  }
  return result;
}

export function envNames(text) {
  return [
    ...new Set(
      String(text)
        .split(/\r?\n/)
        .map((line) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1])
        .filter(Boolean),
    ),
  ].sort();
}

export function compareEnvNames(exampleText, localText) {
  const expected = envNames(exampleText);
  const present = new Set(envNames(localText));
  return { expected, missing: expected.filter((name) => !present.has(name)) };
}
