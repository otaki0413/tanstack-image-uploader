# tanstack-cloudflare-template

A template for SSR-ready React applications powered by TanStack Start and Cloudflare Workers.

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19)
- **Routing**: [TanStack Router](https://tanstack.com/router) (file-based)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Hosting**: [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- **Build**: [Vite](https://vite.dev/)
- **Testing**: [Vitest](https://vitest.dev/) + Testing Library
- **Lint / Format**: [oxlint](https://oxc.rs/docs/guide/usage/linter) / [oxfmt](https://oxc.rs/docs/guide/usage/formatter)
- **Git Hooks**: [Lefthook](https://github.com/evilmartians/lefthook)
- **Package Manager**: pnpm

## Development

```bash
pnpm install        # Install dependencies
pnpm dev            # Start dev server
pnpm build          # Production build
pnpm preview        # Preview production build
pnpm deploy         # Deploy to Cloudflare Workers
pnpm test           # Run tests
pnpm lint           # Run linter
pnpm lint:fix       # Auto-fix lint issues
pnpm fmt            # Check formatting
pnpm fmt:fix        # Auto-fix formatting
pnpm check          # Run lint + format check
pnpm cf-typegen     # Generate Cloudflare bindings types
```

## Project Structure

```
src/
  routes/         # File-based routing
  router.tsx      # Router configuration
  styles.css      # Global styles
wrangler.jsonc    # Cloudflare Workers config
vite.config.ts    # Vite config
```
