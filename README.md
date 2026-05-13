<h1 align="center">
<a href="https://six-degrees.wikiadventu.re"><img width="128" height="128" src="https://six-degrees.wikiadventu.re/favicon.svg" alt="Six Degrees WikiAdventure"/></a>
</h1>

<p align="center">
<strong>Six Degrees API — WikiAdventure</strong><br>
    Shortest path and graph search engine for Wikipedia articles.
</p>

<p align="center">
    <a href="https://discord.gg/wRN6Dam">
        <img src="https://img.shields.io/discord/724622557554147348?logo=discord" alt="Discord">
    </a>
</p>

## Tech Stack

<p align="center">
	<a href="https://www.rust-lang.org"><img width="32" height="32" src="https://upload.wikimedia.org/wikipedia/commons/d/d5/Rust_programming_language_black_logo.svg" alt="Rust logo"></a>
	<a href="https://bun.sh"><img width="30" height="26.25" src="https://bun.sh/logo.svg" alt="Bun logo"></a>  
	<a href="https://www.typescriptlang.org"><img width="32" height="32" src="https://upload.wikimedia.org/wikipedia/commons/4/4c/Typescript_logo_2020.svg" alt="Typescript logo"></a>
	<a href="https://rkyv.org/"><img width="32" height="32" src="https://raw.githubusercontent.com/rkyv/rkyv/main/media/logo_color.svg" alt="rkyv logo"></a>
</p>

Built for maximum performance and low memory overhead:

*   **Rust**: Core graph computation and pathfinding.
*   **Bun**: Fast JavaScript runtime for the API lifecycle.
*   **TypeScript**: Type-safe orchestration.
*   **rkyv**: Zero-copy deserialization for instant/low-overhead graph loading.

## Architecture

*   `/rust-graph-builder`: Parses Wikipedia SQL dumps and serializes them into compressed `.rkyv` graph binaries.
*   `/rust-graph-api`: High-performance Rust server executing All Shortest Path based on Breadth-First Search (BFS) routing.
*   `/infra`: Bun/TypeScript orchestrator that coordinates dataset generation and API requests, optimized for 64gb ddr4 ram with AMD Ryzen 5 3600 cpu on Hetzner.

## Environment Variables

### `/rust-graph-builder`
*   `WIKI_LANG` **(Required)**: The language code of the Wikipedia dump (e.g., `en`, `fr`).
*   `WIKI_DATE` **(Required)**: The date code for the dump (e.g., `latest` or `20240101`).
*   `USE_MULTITHREAD`: Set to `1` to enable multithreading (defaults to `0`).

### `/rust-graph-api`
*   `PORT`: The port the HTTP API will bind to (defaults to `8080`).

### `/infra` (Orchestrator)
*   `DOCKER_USERNAME` **(Required)**: Your Docker Hub username to tag and push the API images.
*   `DOCKER_PAT` **(Required)**: Docker Hub Personal Access Token for authentication.
*   `OPTIMIZED_RUSTFLAGS`: Custom compilation flags for the Rust API builds (defaults to `-C target-cpu=znver2`).

## Setup

```bash
# 1. Build Rust components
cd rust-graph-builder && cargo build --release
cd ../rust-graph-api && cargo build --release

# 2. Run the orchestrator
cd ../infra
bun install
bun run orchestrator.ts
```
