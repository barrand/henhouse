# Jev validation foundation

This runner is the executable evidence layer for the Jev migration plan. It is intentionally safe to run offline and does not read or print API credentials.

```powershell
node tools/jev-validation/index.mjs --phase foundation --profile offline
```

The command writes a redacted JSON report, Markdown summary, and JSONL event log under `validation-runs/jev/<run-id>/`. Those artifacts are ignored by Git. Exit codes are stable:

- `0` — all checks passed
- `1` — at least one check failed
- `2` — no check failed, but a required prerequisite or capability is incomplete

The foundation validates fixture shape and fingerprinting, independent Flock Together score expectations, partition invariants, mocked provider-response shape, credential redaction, and report-status semantics. It also runs the root and Functions builds/tests, proves Vite responds on a loopback-only port, and uses Firebase Emulator Suite isolation for Auth, Firestore, and Functions.

During that emulator session, two separate anonymous client actors create and join Flock Together and Fowl Words rooms through their public callable functions. The runner verifies persisted emulator state and requires Firebase to confirm shutdown. It never starts against a non-loopback host, deploys, creates production rooms, or reads a TypeSafe credential.

The runner discovers standard Windows installations when npm or firebase are not in PATH. Explicit overrides are available through JEV_NPM_BIN and JEV_FIREBASE_BIN.

Firestore Emulator Suite also requires a JDK. When Java is unavailable, the runner returns incomplete evidence (exit code 2) rather than treating unrun emulator actors as a passing or failing game check.
