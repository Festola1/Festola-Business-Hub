import fs from 'fs';
import path from 'path';

const targetDir = process.argv[2] || 'dist';
const resolvedDir = path.resolve(process.cwd(), targetDir);

if (!fs.existsSync(resolvedDir)) {
  console.error(`ERROR: Build directory not found at ${resolvedDir}. Run "npm run build" first.`);
  process.exit(1);
}

const FORBIDDEN_PATTERNS = [
  { name: 'SUPABASE_SERVICE_ROLE_KEY', regex: /SUPABASE_SERVICE_ROLE_KEY/ },
  { name: 'PAYSTACK_SECRET_KEY', regex: /PAYSTACK_SECRET_KEY/ },
  { name: 'PAYSTACK_WEBHOOK_SECRET', regex: /PAYSTACK_WEBHOOK_SECRET/ },
  { name: 'FLUTTERWAVE_SECRET_KEY', regex: /FLUTTERWAVE_SECRET_KEY/ },
  { name: 'FLUTTERWAVE_WEBHOOK_SECRET', regex: /FLUTTERWAVE_WEBHOOK_SECRET/ },
  { name: 'DATABASE_URL', regex: /DATABASE_URL/ },
  { name: 'Paystack live/test secret token', regex: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { name: 'Flutterwave secret token', regex: /\bFLWSECK(?:_TEST)?-[A-Za-z0-9-]{16,}\b/ },
];

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.map']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walk(resolvedDir);
const findings = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.regex.test(content)) {
      findings.push({ file: path.relative(process.cwd(), file), rule: rule.name });
    }
  }
}

if (findings.length > 0) {
  console.error('SECURITY FAILURE: Forbidden server secret pattern detected in client build:');
  for (const f of findings) {
    console.error(`  - ${f.file}: matched ${f.rule}`);
  }
  process.exit(1);
}

console.log(
  `PASS: Scanned ${files.length} built client files in "${targetDir}" — zero secret leaks detected.`,
);
