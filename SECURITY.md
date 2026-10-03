# Security

## Reporting a vulnerability

Please report security issues privately rather than in public issues.

- **Email**: hui.sde.us@gmail.com (preferred)
- **GitHub**: use the repository's private vulnerability reporting form
  (Security → Report a vulnerability)

You can expect an acknowledgment within 3 business days and a coordinated fix
timeline after triage.

## Security notes for this project

This plugin mounts the `@earendil-works/pi-durable` agent harness inside the
DeepSeek Harness host process. Two trust boundaries matter:

1. **The durable agent's coding tools run with full host trust.** The mounted
   `CodingTools` toolset (bash/read/write/edit) executes through a
   `NodeExecutionEnv` in the host process (or the configured `cwd`). This is
   process confinement, not a security boundary — treat the durable agent as
   bash-equivalent trust, exactly like the harness's own shell tool. Do not
   point it at mutually distrusting workloads.

2. **The SQLite database is a durability medium, not a secrecy medium.** The
   agent transcript, submissions, and documents are stored in plaintext
   (WAL-mode SQLite) at the configured `path`. Protect that file like any
   other secret-bearing host state; pi-durable's durability guarantee is
   process-crash durability (WAL `synchronous=NORMAL`), not power-loss
   durability or encryption.

3. **Model credentials.** The relay provider resolves its API key from the
   environment variable named by `apiKeyEnv` (default `PI_DURABLE_API_KEY`)
   or from an inline `apiKey` (development only — prefer the env var).
