# Internal AI Development System

This directory defines the internal AI-assisted development system used to build Raze consistently inside Codex, Cursor, and Claude.

It is not part of the product runtime. It exists to reduce hallucination, preserve architecture decisions, and keep changes aligned with the current codebase.

## What This System Provides

- deterministic routing from request type to the right agent
- file-first retrieval with no vector database
- sparse Markdown memory for durable project knowledge
- four specialized agents for planning, implementation, review, and debugging

## Operating Order

1. Start with `index.md`.
2. Read `rules.md`.
3. Apply `routing.md`.
4. Follow the retrieval steps in `retrieval/playbook.md`.
5. Read the assigned agent file under `agents/`.
6. Load durable memory only when it is relevant.

## Output Contract

Each agent should produce the same compact structure:

- task classification
- files to read
- assumptions
- action or result
- required tests
- risks or blockers
