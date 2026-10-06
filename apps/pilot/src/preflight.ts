/**
 * `pnpm pilot:preflight` (4.1): one command a non-technical operator runs on the pilot laptop
 * before day one and every morning. Each check says ✅ or ❌, and a ❌ carries a one-line fix in
 * Arabic and English. Pure where possible (tested); the CLI (cli/preflight.ts) gathers the facts.
 */
import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';

export interface L {
  ar: string;
  en: string;
}
export interface Check {
  id: string;
  ok: boolean;
  title: L;
  /** One line: what to do when it is ❌. */
  fix: L;
  /** What was found (numbers, versions), shown in both cases. */
  detail?: string;
}

/** Arabic copy uses Arabic-Indic digits (CLAUDE.md i18n). */
const arNum = (n: number) => n.toLocaleString('ar-EG');

const check = (id: string, ok: boolean, title: L, fix: L, detail?: string): Check => ({
  id,
  ok,
  title,
  fix,
  detail,
});

const major = (v: string | null) => (v ? Number(/(\d+)/.exec(v)?.[1] ?? NaN) : NaN);

export function versions(f: {
  node: string;
  pnpm: string | null;
  uv: string | null;
  python: string | null;
  voice: boolean;
}): Check[] {
  const out = [
    check(
      'node',
      major(f.node) >= 24,
      { ar: 'إصدار Node.js (٢٤ أو أحدث)', en: 'Node.js version (24 or newer)' },
      {
        ar: 'ثبّت Node.js 24 من nodejs.org ثم أعد المحاولة.',
        en: 'Install Node.js 24 from nodejs.org, then try again.',
      },
      f.node,
    ),
    check(
      'pnpm',
      major(f.pnpm) >= 12,
      { ar: 'إصدار pnpm (١٢ أو أحدث)', en: 'pnpm version (12 or newer)' },
      { ar: 'شغّل: npm install -g pnpm@12.8.1', en: 'Run: npm install -g pnpm@12.8.1' },
      f.pnpm ?? 'not found',
    ),
  ];
  if (!f.voice) return out;
  out.push(
    check(
      'uv',
      !!f.uv,
      { ar: 'أداة uv (للملاحظات الصوتية)', en: 'uv (for voice notes)' },
      {
        ar: 'ثبّت uv: راجع دليل التشغيل، القسم 1b.',
        en: 'Install uv: see the runbook, section 1b.',
      },
      f.uv ?? 'not found',
    ),
    check(
      'python',
      /^3\.12\./.test(f.python ?? ''),
      { ar: 'Python 3.12 (للملاحظات الصوتية)', en: 'Python 3.12 (for voice notes)' },
      {
        ar: 'شغّل: uv sync --directory apps/ai-service',
        en: 'Run: uv sync --directory apps/ai-service',
      },
      f.python ?? 'not found',
    ),
  );
  return out;
}

export function disk(freeBytes: number, minGb = 2): Check {
  const gb = freeBytes / 1024 ** 3;
  return check(
    'disk',
    gb >= minGb,
    {
      ar: `مساحة فارغة على القرص (${arNum(minGb)} جيجابايت على الأقل)`,
      en: `Free disk space (at least ${minGb} GB)`,
    },
    {
      ar: 'احذف ملفات غير مهمة من القرص الذي عليه بيانات التجربة.',
      en: 'Free up space on the drive that holds the pilot data.',
    },
    `${gb.toFixed(1)} GB free`,
  );
}

/**
 * Windows reports BitLocker / Device encryption per drive (no admin needed) as a number:
 * 1 = on, 6 = on (locked); 3 = encrypting (not finished); 2 = off; 0 = not encryptable.
 */
export function encryption(state: number | null, drive: string): Check {
  return check(
    'encryption',
    state === 1 || state === 6,
    {
      ar: `تشفير القرص ${drive} مفعّل (BitLocker أو تشفير الجهاز)`,
      en: `Drive ${drive} is encrypted (BitLocker or Device encryption)`,
    },
    state === 3
      ? {
          ar: 'التشفير يعمل الآن ولم يكتمل: انتظر حتى ينتهي ثم أعد المحاولة.',
          en: 'Encryption is still running: wait until it finishes, then try again.',
        }
      : {
          ar: 'شغّل التشفير: الإعدادات ← الخصوصية والأمان ← تشفير الجهاز (أو BitLocker).',
          en: 'Turn it on: Settings → Privacy & security → Device encryption (or BitLocker).',
        },
    state === null ? 'could not read' : `state ${state}`,
  );
}

export function timeZone(zone: string): Check {
  return check(
    'timezone',
    zone === 'Africa/Cairo',
    { ar: 'المنطقة الزمنية القاهرة', en: 'Time zone is Cairo' },
    {
      ar: 'الإعدادات ← الوقت واللغة ← المنطقة الزمنية: (UTC+02:00) القاهرة.',
      en: 'Settings → Time & language → Time zone: (UTC+02:00) Cairo.',
    },
    zone,
  );
}

/** The server certificate is valid for at least `days` more days and names the LAN address. */
export function certificate(pem: string | null, bind: string, now = new Date(), days = 7): Check {
  const title = {
    ar: `شهادة HTTPS سارية وتطابق عنوان الشبكة ⁦${bind}⁩`,
    en: `HTTPS certificate is valid and matches the LAN address ${bind}`,
  };
  const fix = {
    ar: 'شغّل: pnpm pilot:cert (الهواتف تبقى مضبوطة).',
    en: 'Run: pnpm pilot:cert (the phones stay set up).',
  };
  if (!pem) return check('certificate', false, title, fix, 'no certificate');
  try {
    const cert = new X509Certificate(pem);
    const until = new Date(cert.validTo);
    const left = Math.floor((until.getTime() - now.getTime()) / 86_400_000);
    const names = cert.subjectAltName ?? '';
    const matches = names.split(',').some((n) => n.trim() === `IP Address:${bind}`);
    return check(
      'certificate',
      left >= days && matches,
      title,
      fix,
      `${left} days left; ${matches ? 'address matches' : `address ${bind} not in the certificate`}`,
    );
  } catch {
    return check('certificate', false, title, fix, 'unreadable certificate');
  }
}

export function ports(f: { running: boolean; busy: number[] }): Check {
  return check(
    'ports',
    f.running || f.busy.length === 0,
    { ar: 'المنافذ متاحة للتجربة', en: 'The pilot ports are free' },
    {
      ar: `برنامج آخر يستخدم المنفذ ${f.busy.join('، ')}: أعد تشغيل اللابتوب أو راجع دليل التشغيل §10.`,
      en: `Another program uses port ${f.busy.join(', ')}: restart the laptop or see the runbook §10.`,
    },
    f.running
      ? 'the pilot server is running'
      : f.busy.length
        ? `busy: ${f.busy.join(', ')}`
        : 'free',
  );
}

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

export function lan(bind: string, addresses: string[]): Check {
  const ok =
    isIP(bind) === 4 &&
    addresses.includes(bind) &&
    PRIVATE.some((r) => r.test(bind)) &&
    !bind.startsWith('169.254.');
  return check(
    'lan',
    ok,
    {
      ar: `عنوان الشبكة ⁦${bind}⁩ موجود على هذا اللابتوب`,
      en: `The LAN address ${bind} is on this laptop`,
    },
    {
      ar: 'شغّل ipconfig وضع العنوان الجديد في PILOT_BIND ثم pnpm pilot:cert. لا تستخدم شبكة الضيوف: كثيرًا ما تمنع الأجهزة من رؤية بعضها.',
      en: 'Run ipconfig, put the new address in PILOT_BIND, then pnpm pilot:cert. Avoid guest Wi-Fi: it often stops devices from seeing each other.',
    },
    `this laptop: ${addresses.join(', ') || 'no network'}`,
  );
}

export function backups(f: {
  writable: boolean;
  newest: Date | null;
  now?: Date;
  maxHours?: number;
}): Check {
  const now = f.now ?? new Date();
  const maxHours = f.maxHours ?? 2;
  const age = f.newest ? (now.getTime() - f.newest.getTime()) / 3_600_000 : Infinity;
  return check(
    'backups',
    f.writable && age < maxHours,
    {
      ar: `مجلد النسخ الاحتياطية قابل للكتابة وآخر نسخة عمرها أقل من ${arNum(maxHours)} ساعة`,
      en: `The backups folder is writable and the last backup is under ${maxHours} h old`,
    },
    !f.writable
      ? {
          ar: 'لا يمكن الكتابة في مجلد النسخ الاحتياطية: راجع PILOT_BACKUP_DIR.',
          en: 'Cannot write to the backups folder: check PILOT_BACKUP_DIR.',
        }
      : { ar: 'شغّل: pnpm pilot:backup', en: 'Run: pnpm pilot:backup' },
    f.newest ? `last backup ${age.toFixed(1)} h ago` : 'no backup yet',
  );
}

export function noDemo(problems: string[]): Check {
  return check(
    'no-demo',
    problems.length === 0,
    {
      ar: 'لا توجد بيانات أو مسارات أو مستخدمو العرض التجريبي',
      en: 'No demo data, routes or users',
    },
    {
      ar: 'شغّل pnpm pilot:check واقرأ الرسالة (غالبًا: pnpm pilot:build).',
      en: 'Run pnpm pilot:check and read the message (usually: pnpm pilot:build).',
    },
    problems.length ? problems.slice(0, 3).join(' · ') : 'clean',
  );
}

/** Seconds for a 1-minute note per profile (ADR-0007); the morning check allows 1.5×. */
export const PROFILE_BUDGET_S: Record<string, number> = { gpu: 15, cpu_rules: 40, cpu_llm: 100 };

export function voiceModels(f: {
  whisper: string;
  whisperOk: boolean;
  llm: string | null;
  llmOk: boolean;
}): Check[] {
  const out = [
    check(
      'whisper-model',
      f.whisperOk,
      {
        ar: `نموذج التعرّف على الكلام موجود (${f.whisper})`,
        en: `Speech-to-text model present (${f.whisper})`,
      },
      {
        ar: `شغّل في مكان فيه إنترنت: pnpm ai:models ${f.whisper}`,
        en: `Somewhere with internet, run: pnpm ai:models ${f.whisper}`,
      },
    ),
  ];
  if (f.llm)
    out.push(
      check(
        'ollama-model',
        f.llmOk,
        {
          ar: `نموذج Ollama موجود ويعمل (${f.llm})`,
          en: `Ollama model present and running (${f.llm})`,
        },
        {
          ar: `شغّل Ollama ثم: ollama pull ${f.llm}`,
          en: `Start Ollama, then: ollama pull ${f.llm}`,
        },
      ),
    );
  return out;
}

export function voiceTrial(f: {
  profile: string;
  audioS: number;
  sttS: number;
  totalS: number;
  chars: number;
}): Check {
  const budget = PROFILE_BUDGET_S[f.profile] ?? 100;
  // Speech-to-text scales with the audio; the LLM step does not, so project it separately.
  const projected = Math.round(
    (f.sttS / Math.max(f.audioS, 1)) * 60 + Math.max(0, f.totalS - f.sttS),
  );
  const ok = f.chars > 0 && projected <= budget * 1.5;
  return check(
    'voice-trial',
    ok,
    {
      ar: 'مقطع تجريبي مدته ٥ ثوانٍ يُحوَّل إلى نص في الوقت المتوقع',
      en: 'A 5-second test clip is transcribed in the expected time',
    },
    f.chars === 0
      ? {
          ar: 'لم يخرج نص: راجع دليل التشغيل §1b (تثبيت ai-service).',
          en: 'No text came out: see the runbook §1b (ai-service set-up).',
        }
      : {
          ar: 'أبطأ من المتوقع: أغلق البرامج الأخرى، أو اختر ملف «المعالج فقط» في دليل التشغيل §1b.',
          en: 'Slower than expected: close other programs, or choose the processor-only profile (runbook §1b).',
        },
    `${f.audioS.toFixed(1)} s clip → ${f.totalS.toFixed(1)} s; about ${projected} s for a 1-minute note (profile ${f.profile}: up to ${budget} s)`,
  );
}

export function render(checks: Check[]): string {
  const lines: string[] = [];
  for (const c of checks) {
    lines.push(
      `${c.ok ? '✅' : '❌'} ${c.title.ar} — ${c.title.en}${c.detail ? `  (${c.detail})` : ''}`,
    );
    if (!c.ok) {
      lines.push(`   ↳ ${c.fix.ar}`);
      lines.push(`   ↳ ${c.fix.en}`);
    }
  }
  const bad = checks.filter((c) => !c.ok).length;
  lines.push('');
  lines.push(
    bad
      ? `❌ ${bad} بند يحتاج إصلاحًا قبل بدء اليوم — ${bad} item(s) to fix before the day starts.`
      : '✅ كل شيء جاهز — Everything is ready.',
  );
  return lines.join('\n');
}
