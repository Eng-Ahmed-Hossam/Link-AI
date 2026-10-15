// The deploy configs in the repo (Vercel, Railway) may only point at `main`: every deployment
// builds from main (docs/deploy/environments.md). Pure: the CLI is scripts/check-deploy-branch.mjs.

/** Files that configure a deployment on Vercel or Railway. */
export const DEPLOY_CONFIG =
  /(^|\/)((vercel|now)\.json|railway\.(json|toml)|railway[.-][^/]*\.(json|toml))$/;

/** Keys that name the branch a deployment follows. */
const BRANCH_KEY = /^(branch|productionBranch|deployBranch|gitBranch|ref)$/i;
/** Our working-branch prefixes: none of them may be a deploy source. */
const WORK_BRANCH = /\b(codex|claude|feat|fix|chore|docs|stage\d*|part[a-z])\/[\w.-]+/;

function walk(v, path, out) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (BRANCH_KEY.test(k) && typeof x === 'string' && x !== 'main')
        out.push(`${p} = "${x}" (only main may deploy)`);
      walk(x, p, out);
    }
}

/** Problems in one config file (empty = fine). `text` is its content. */
export function deployBranchProblems(file, text) {
  const out = [];
  const work = WORK_BRANCH.exec(text);
  if (work) out.push(`names the working branch "${work[0]}"`);
  if (file.endsWith('.json')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return [...out, 'is not valid JSON'];
    }
    walk(json, '', out);
    // Vercel: git.deploymentEnabled {"<branch>": true} turns deployments on per branch.
    const de = json?.git?.deploymentEnabled;
    if (de && typeof de === 'object')
      for (const [b, on] of Object.entries(de))
        if (on === true && b !== 'main')
          out.push(`git.deploymentEnabled["${b}"] = true (only main)`);
  } else {
    for (const m of text.matchAll(/^\s*(\w+)\s*=\s*["']([^"']+)["']/gm))
      if (BRANCH_KEY.test(m[1]) && m[2] !== 'main')
        out.push(`${m[1]} = "${m[2]}" (only main may deploy)`);
  }
  return [...new Set(out)];
}
