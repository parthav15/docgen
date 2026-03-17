# codebase-docs

Generate full documentation for any codebase in 60 seconds.

Point it at a project, pick an AI provider, and get a complete `docs/` folder with architecture overview, API routes, database schema, getting started guide, and a visual dependency graph.

Works with **Claude**, **OpenAI**, or **Gemini** — bring whatever API key you have.

## What it generates

```
docs/
├── architecture.md        # Tech stack, folder structure, data flow
├── api-routes.md           # Every endpoint with request/response examples
├── database-schema.md      # Tables, columns, relationships in plain English
├── getting-started.md      # Setup from zero, common errors, "how to add X"
├── dependency-graph.svg    # Visual module dependency graph
├── dependency-graph.md     # Most-used modules, circular deps, orphan files
└── README.md               # Index linking to all docs
```

## Install

```bash
npm install -g codebase-docs
```

### Prerequisites

- Node.js 18+
- [Graphviz](https://graphviz.org/download/) (for dependency graph SVG generation)

```bash
# macOS
brew install graphviz

# Ubuntu/Debian
sudo apt install graphviz
```

## Usage

```bash
# Set your API key once (auto-detected, no flags needed)
export ANTHROPIC_API_KEY=sk-ant-xxx   # or OPENAI_API_KEY or GEMINI_API_KEY

# Then just cd into any project and run:
codebase-docs

# That's it. Docs appear in ./docs/
```

### More examples

```bash
# Pass provider and key explicitly
codebase-docs -p claude -k sk-ant-xxx

# Point it at a different project
codebase-docs my-project -p gemini -k AIza-xxx

# Custom output directory
codebase-docs -p openai -k sk-xxx -o documentation

# Skip dependency graph
codebase-docs -p claude -k sk-ant-xxx --no-graph

# Use a specific model
codebase-docs -p claude -k sk-ant-xxx -m claude-opus-4-6-20250514
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --provider` | AI provider: `claude`, `openai`, or `gemini` | Auto-detected from env |
| `-k, --key` | API key for the chosen provider | Auto-detected from env |
| `-m, --model` | Specific model to use | Best available |
| `-o, --output` | Output directory | `docs` |
| `--no-graph` | Skip dependency graph generation | `false` |

## Environment variables

Set any of these and the provider/key flags become optional:

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Claude |
| `OPENAI_API_KEY` | OpenAI |
| `GEMINI_API_KEY` | Gemini |

## Default models

| Provider | Model |
|----------|-------|
| Claude | claude-sonnet-4 |
| OpenAI | gpt-4.1 |
| Gemini | gemini-2.5-flash |

## How it works

1. **Scan** — Walks the project, finds source/config/route/schema files, skips node_modules and build artifacts. Smart content extraction keeps large files within context limits.

2. **Detect** — Identifies the framework (Next.js, Django, Rails, etc.) and primary language automatically from config files.

3. **Analyze** — Sends the codebase map to your chosen AI with a detailed prompt that asks for specific, file-referenced documentation.

4. **Graph** — Uses [madge](https://github.com/pahen/madge) to compute a real dependency graph from your imports. Finds circular dependencies and orphan files.

5. **Write** — Saves everything to a clean `docs/` folder.

## Supported frameworks

Auto-detected from config files:

- Next.js, Nuxt, Remix, Astro, SvelteKit
- Vite, Angular
- Django, Flask
- Ruby on Rails
- Rust (Cargo), Go
- Any JavaScript/TypeScript project

## License

MIT
