import { glob } from 'glob';
import { readFileSync, statSync } from 'fs';
import { basename, extname, relative, join, resolve, isAbsolute } from 'path';

const INCLUDE_PATTERNS = [
  '**/*.{js,ts,jsx,tsx,py,rb,go,rs,java}',
  '**/package.json',
  '**/tsconfig.json',
  '**/next.config.*',
  '**/vite.config.*',
  '**/Dockerfile',
  '**/docker-compose*.yml',
  '**/.env.example',
  '**/.env.sample',
  '**/schema.prisma',
  '**/drizzle.config.*',
  '**/knexfile.*',
  '**/requirements.txt',
  '**/pyproject.toml',
  '**/Cargo.toml',
  '**/go.mod',
  '**/Gemfile',
];

const IGNORE_PATTERNS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '.next/**',
  '__pycache__/**',
  'coverage/**',
  '*.lock',
  'package-lock.json',
  '*.log',
  '*.min.js',
  '*.map',
  'vendor/**',
  'target/**',
];

const FRAMEWORK_SIGNALS = {
  'next.config.js': 'Next.js',
  'next.config.ts': 'Next.js',
  'next.config.mjs': 'Next.js',
  'nuxt.config.ts': 'Nuxt',
  'nuxt.config.js': 'Nuxt',
  'vite.config.ts': 'Vite',
  'vite.config.js': 'Vite',
  'angular.json': 'Angular',
  'svelte.config.js': 'SvelteKit',
  'remix.config.js': 'Remix',
  'astro.config.mjs': 'Astro',
  'manage.py': 'Django',
  'app.py': 'Flask',
  'main.py': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'Gemfile': 'Ruby on Rails',
};

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'docker-compose.yml', 'docker-compose.yaml',
  'Dockerfile', '.env.example', '.env.sample', 'schema.prisma',
  'drizzle.config.ts', 'drizzle.config.js', 'knexfile.js',
  'requirements.txt', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Gemfile',
]);

function isRouteFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('/api/') ||
    lower.includes('/routes/') ||
    lower.includes('/route.') ||
    lower.includes('/pages/api/') ||
    lower.includes('/app/api/') ||
    lower.includes('router') ||
    lower.includes('urls.py') ||
    lower.includes('views.py')
  );
}

function isSchemaFile(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('schema') ||
    lower.includes('model') ||
    lower.includes('migration') ||
    lower.includes('entity')
  );
}

function extractSmartContent(filePath, fullContent) {
  const name = basename(filePath);

  // Config files — send everything
  if (CONFIG_FILES.has(name)) {
    return fullContent;
  }

  // Route and schema files — send everything (critical for docs)
  if (isRouteFile(filePath) || isSchemaFile(filePath)) {
    return fullContent;
  }

  const lines = fullContent.split('\n');

  // Small files — send everything
  if (lines.length <= 150) {
    return fullContent;
  }

  // Large files — first 80 lines + exports + last 10 lines
  const head = lines.slice(0, 80).join('\n');
  const exportLines = lines.filter(l =>
    /^export\s/.test(l) ||
    /^module\.exports/.test(l) ||
    /^def\s/.test(l) ||
    /^class\s/.test(l) ||
    /^func\s/.test(l) ||
    /^pub\s/.test(l) ||
    /^type\s/.test(l) ||
    /^interface\s/.test(l)
  ).join('\n');
  const tail = lines.slice(-10).join('\n');

  return `${head}\n\n// ... (${lines.length - 90} lines omitted) ...\n\n// Exports and definitions:\n${exportLines}\n\n// End of file:\n${tail}`;
}

export async function scan(projectPath) {
  const absolutePath = isAbsolute(projectPath) ? projectPath : resolve(process.cwd(), projectPath);

  const files = await glob(INCLUDE_PATTERNS, {
    cwd: absolutePath,
    ignore: IGNORE_PATTERNS,
    nodir: true,
    absolute: false,
  });

  // Detect framework
  let framework = 'Unknown';
  let language = 'Unknown';
  const languageCounts = {};

  for (const file of files) {
    const name = basename(file);
    if (FRAMEWORK_SIGNALS[name]) {
      framework = FRAMEWORK_SIGNALS[name];
    }

    const ext = extname(file).slice(1);
    const langMap = {
      js: 'JavaScript', ts: 'TypeScript', jsx: 'React (JSX)',
      tsx: 'React (TSX)', py: 'Python', rb: 'Ruby',
      go: 'Go', rs: 'Rust', java: 'Java',
    };
    if (langMap[ext]) {
      languageCounts[langMap[ext]] = (languageCounts[langMap[ext]] || 0) + 1;
    }
  }

  // Primary language = most files
  language = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)[0] || 'Unknown';

  // Read and categorize files
  const codebaseMap = {
    framework,
    language,
    totalFiles: files.length,
    config: [],
    routes: [],
    schemas: [],
    source: [],
  };

  let totalTokenEstimate = 0;
  const MAX_TOKENS = 800000; // leave room for prompt + response

  for (const file of files) {
    const fullPath = join(absolutePath, file);

    try {
      const stat = statSync(fullPath);
      if (stat.size > 500000) continue; // skip files > 500KB

      const content = readFileSync(fullPath, 'utf-8');
      const smartContent = extractSmartContent(file, content);
      const tokenEstimate = Math.ceil(smartContent.length / 4);

      if (totalTokenEstimate + tokenEstimate > MAX_TOKENS) continue;
      totalTokenEstimate += tokenEstimate;

      const entry = { path: file, content: smartContent, lines: content.split('\n').length };

      if (CONFIG_FILES.has(basename(file))) {
        codebaseMap.config.push(entry);
      } else if (isRouteFile(file)) {
        codebaseMap.routes.push(entry);
      } else if (isSchemaFile(file)) {
        codebaseMap.schemas.push(entry);
      } else {
        codebaseMap.source.push(entry);
      }
    } catch {
      // skip unreadable files
    }
  }

  return codebaseMap;
}
