# Zeus — Git & Vercel Deployment Guide

This document records the exact steps, commands, code changes, and reasoning required to push the Zeus project to GitHub and deploy it to Vercel production. Every failure encountered along the way is included so it can be avoided in future deployments.

---

## 1. Repository Initialization

The project directory (`/Users/friday/Desktop/Delta XYZ/New`) had no git repository. Starting from scratch:

```bash
git init
git remote add origin https://github.com/irenicsunshine/Zeus.git
```

**Why:** The project was built locally with no version control. `git init` creates the `.git` folder. The remote URL points to the GitHub repo where the code lives.

---

## 2. Updating .gitignore

Before staging files, the `/sessions` folder was identified as a runtime artifact containing AI session logs (JSONL files, system prompts, extracted responses). These are generated at runtime and may contain sensitive data.

Added to `.gitignore`:

```
# runtime session data
/sessions
```

The existing `.gitignore` already excluded:
- `node_modules/` — dependencies, never committed
- `.next/` — compiled build output
- `.env*` — environment variables with secrets (DATABASE_URL, API keys, etc.)
- `.vercel` — Vercel project link metadata

**Why:** Committing sessions would expose model outputs and system prompts. Committing `.env.local` would expose database credentials and API keys to anyone with repo access.

---

## 3. Removing Stray Files

A `test.txt` file (containing just `"test"`) was found in the root. It was removed before committing:

```bash
git rm --cached test.txt
rm test.txt
```

**Why:** Keeps the repo clean. `git rm --cached` removes it from git's index without deleting it from disk first, but since we also ran `rm`, it's gone entirely.

---

## 4. Initial Commit and Push

```bash
git add -A
git commit -m "Initial commit — Zeus aircraft lessee management platform"
git push -u origin main
```

`git add -A` stages everything not excluded by `.gitignore`. The `-u` flag on push sets the upstream so future `git push` calls work without specifying the remote.

**Files committed (36 total):**
- `app/` — all Next.js pages, API routes, components, lib
- `public/` — static assets
- `package.json`, `package-lock.json` — dependency manifest
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`
- `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`

---

## 5. Vercel CLI Preflight

### 5a. Confirm CLI is installed

```bash
which vercel && vercel --version
# → /opt/homebrew/bin/vercel
# → 52.0.0
```

### 5b. Confirm authenticated

```bash
vercel whoami
# → irenicsunshine
```

### 5c. Link the project

The project was not yet linked (no `.vercel/project.json`). Running `vercel link --yes` failed because the directory name `Delta XYZ/New` contains spaces and uppercase letters, which Vercel rejects as a project name.

**Error:**
```
Error: Project names can be up to 100 characters long and must be lowercase.
They can include letters, digits, and: '.', '_', '-' (400)
```

**Fix:** Provide the project name explicitly:

```bash
vercel link --yes --project zeus
```

This created `.vercel/project.json` and connected the GitHub repo automatically:
```
Linked to irenicsunshines-projects/zeus (created .vercel)
Connecting GitHub repository: https://github.com/irenicsunshine/Zeus
Connected
```

---

## 6. Pushing Environment Variables to Vercel

The `.env.local` file is gitignored and will not be deployed automatically. Every secret must be added to Vercel's environment manually. The following were pushed to the **production** environment:

```bash
echo "postgresql://..." | vercel env add DATABASE_URL production --yes
echo "llx-..."          | vercel env add LLAMA_CLOUD_API_KEY production --yes
echo "sk-or-v1-..."     | vercel env add OPENROUTER_API_KEY production --yes
echo "aktpes..."        | vercel env add EDGE_STORE_ACCESS_KEY production --yes
echo "0ewELb..."        | vercel env add EDGE_STORE_SECRET_KEY production --yes
```

**Why:** Vercel builds in a sandboxed environment with no access to your local filesystem. Any `process.env.*` reads in API routes will return `undefined` unless the vars are configured in the Vercel dashboard or pushed via CLI. The `--yes` flag suppresses the confirmation prompt.

---

## 7. First Deployment Attempt — Native Module Error

```bash
vercel --prod --yes
```

**Build failed.** Error from Vercel build logs (also reproducible locally with `npm run build`):

```
Error: Turbopack build failed with 1 errors:
./node_modules/@mariozechner/clipboard/index.js
non-ecmascript placeable asset
asset is not placeable in ESM chunks, so it doesn't have a module id

Import trace:
  App Route:
    ./node_modules/@mariozechner/clipboard/index.js
    ./node_modules/@mariozechner/pi-coding-agent/dist/utils/clipboard-native.js
    ./node_modules/@mariozechner/pi-coding-agent/dist/utils/clipboard.js
    ./node_modules/@mariozechner/pi-coding-agent/dist/index.js
    ./app/lib/pdf-extract.ts
    ./app/api/upload-reports/route.ts
```

**Root cause:** The `@mariozechner/pi-coding-agent` package (used to extract PDF data) internally depends on `@mariozechner/clipboard`, a native Node.js binary module. Turbopack (Next.js 16's default bundler) cannot bundle native binaries into ESM chunks — it expects pure JavaScript.

**Fix:** Tell Next.js to treat these packages as server-side externals (never bundle them, just `require()` them at runtime on the server):

```ts
// next.config.ts
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@mariozechner/pi-coding-agent",
    "@mariozechner/clipboard",
    "pdf-parse",
    "xlsx",
  ],
};
```

**Why `serverExternalPackages`:** This config instructs the bundler to skip these packages during the build step and instead load them from `node_modules` at runtime on the server. Since API routes run in a Node.js environment on Vercel, the native binaries load correctly at request time.

---

## 8. Second Deployment Attempt — `useSearchParams` Suspense Errors

After fixing the native module issue, the build failed with a new error:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/admin"
Error occurred prerendering page "/admin"
```

Then again on `/operations`:

```
⨯ useSearchParams() should be wrapped in a suspense boundary at page "/operations"
Error occurred prerendering page "/operations"
```

**Root cause:** Next.js App Router requires any component that calls `useSearchParams()` to be wrapped in a `<Suspense>` boundary. During static page generation (build time), there are no real search params available. Without Suspense, Next.js throws a hard error and aborts the build.

The Navbar component called `useSearchParams()` at the top level and was rendered on every page including `/admin`, `/upload-reports`, and `/` — all of which were being statically prerendered.

### Fix A — Navbar

Extracted the `useSearchParams()` usage into a dedicated child component (`PeriodSync`) and wrapped it in `<Suspense>` inside the Navbar's JSX. The parent Navbar component no longer calls `useSearchParams()` directly.

```tsx
// app/components/Navbar.tsx

function PeriodSync({ setSelectedMonth }: { setSelectedMonth: (m: string) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();   // ← useSearchParams lives here now
  useEffect(() => {
    if (pathname === "/operations") {
      const period = searchParams.get("period");
      if (period) setSelectedMonth(fromPeriod(period));
    }
  }, [pathname, searchParams, setSelectedMonth]);
  return null;
}

export default function Navbar() {
  // ... no useSearchParams here anymore
  return (
    <div ...>
      <Suspense fallback={null}>
        <PeriodSync setSelectedMonth={setSelectedMonth} />
      </Suspense>
      <nav ...>
        ...
      </nav>
    </div>
  );
}
```

**Why this pattern:** `<Suspense fallback={null}>` tells React "if this subtree isn't ready yet (no search params during prerender), render nothing and continue". The Navbar still displays normally — `PeriodSync` renders `null` anyway. It only updates state when search params are available at runtime.

### Fix B — Operations, Logs, Validate pages

These three pages called `useSearchParams()` at the top level of their own component functions. Even `export const dynamic = "force-dynamic"` (which was tried first) did not suppress the Suspense check during Next.js's build-time validation pass.

**Fix:** Rename the page function to an inner component and export a thin default wrapper that wraps it in `<Suspense>`:

```tsx
// Pattern applied to:
// app/operations/page.tsx
// app/operations/logs/[assetId]/page.tsx
// app/operations/validate/[assetId]/page.tsx

// Before:
export default function OperationsPage() {
  const searchParams = useSearchParams();
  ...
}

// After:
function OperationsPage() {           // ← same code, not exported
  const searchParams = useSearchParams();
  ...
}

export default function OperationsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <OperationsPage />
    </Suspense>
  );
}
```

**Why not just `export const dynamic = "force-dynamic"`:** This flag tells Next.js to skip static caching and always server-render the page at request time. However, Next.js still performs a static render pass during the build to validate the page structure. `useSearchParams()` without Suspense fails this validation regardless of the dynamic flag.

---

## 9. Successful Build and Deployment

After both fixes were applied, the local build passed:

```bash
npm run build
# ✓ Compiled successfully in 5.8s
# ✓ Generating static pages (14/14)
#
# Route (app)
# ┌ ○ /                    Static
# ├ ○ /admin               Static
# ├ ○ /operations          Static
# ├ ○ /upload-reports      Static
# ├ ƒ /api/*               Dynamic (server-rendered on demand)
# ├ ƒ /operations/logs/[assetId]      Dynamic
# └ ƒ /operations/validate/[assetId]  Dynamic
```

Then committed all fixes and deployed:

```bash
git add -A
git commit -m "Fix production build: Suspense boundaries and server external packages"
git push
vercel --prod --yes
```

**Deployment result:**
```
Status  : READY
URL     : https://zeus-umber.vercel.app
Build   : 49s
```

The "Cannot find module as expression is too dynamic" warnings that appear during `Collecting page data` are **harmless** — they come from Turbopack workers scanning the server chunk that contains the pi-agent's dynamic `require()` calls. These do not block any page from rendering and all 14 pages generate successfully.

---

## 10. Subsequent Deployments

For any future change, the workflow is:

```bash
# Make code changes
git add -A
git commit -m "Description of change"
git push
vercel --prod --yes
```

Since the project is linked (`.vercel/project.json` exists) and all environment variables are set in Vercel, no additional setup is needed. Vercel caches `node_modules` between builds, so subsequent deploys are significantly faster (36s vs 49s for the first).

---

## 11. Summary of All Changes Required for Deployment

| File | Change | Reason |
|------|--------|--------|
| `.gitignore` | Added `/sessions` | Exclude runtime AI session logs |
| `next.config.ts` | Added `serverExternalPackages` | Prevent Turbopack from bundling native clipboard module |
| `app/components/Navbar.tsx` | Extracted `useSearchParams` into `PeriodSync` + Suspense | Fix build error on statically prerendered pages |
| `app/operations/page.tsx` | Added `OperationsPageWrapper` with Suspense | Fix `useSearchParams` Suspense error |
| `app/operations/logs/[assetId]/page.tsx` | Added `LogsPageWrapper` with Suspense | Fix `useSearchParams` Suspense error |
| `app/operations/validate/[assetId]/page.tsx` | Added `ValidatePageWrapper` with Suspense | Fix `useSearchParams` Suspense error |
| `app/layout.tsx` | Added anti-flash script + `suppressHydrationWarning` | Prevent white flash before dark mode CSS applies |

---

## 12. Environment Variables Reference

These must be set in Vercel (Dashboard → Project → Settings → Environment Variables) or via CLI before deploying:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `LLAMA_CLOUD_API_KEY` | LlamaCloud PDF parsing API |
| `OPENROUTER_API_KEY` | OpenRouter API for Gemini 2.5 Flash (pi-agent) |
| `EDGE_STORE_ACCESS_KEY` | EdgeStore CDN access key |
| `EDGE_STORE_SECRET_KEY` | EdgeStore CDN secret key |

Never commit `.env.local`. It is gitignored by default via `.env*` in `.gitignore`.

---

## 13. Live URLs

| Environment | URL |
|-------------|-----|
| Production | https://zeus-umber.vercel.app |
| GitHub Repo | https://github.com/irenicsunshine/Zeus |
| Vercel Dashboard | https://vercel.com/irenicsunshines-projects/zeus |
