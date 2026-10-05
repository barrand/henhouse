# Jev validation foundation

This runner is the executable evidence layer for the Jev migration plan. It is intentionally safe to run offline and does not read or print API credentials.

```powershell
node tools/jev-validation/index.mjs --phase foundation --profile offline
```

The command writes a redacted JSON report and a short Markdown summary under `validation-runs/jev/<run-id>/`. Those artifacts are ignored by Git. Exit codes are stable:

- `0` — all checks passed
- `1` — at least one check failed
- `2` — no check failed, but a required prerequisite or capability is incomplete

The committed foundation currently validates fixture shape and fingerprinting, independent Flock Together score expectations, partition invariants, mocked provider-response shape, credential-redaction smoke checks, and report-status semantics. It reports missing npm/Firebase tooling and the not-yet-implemented emulator lifecycle/scripted actors as incomplete instead of silently skipping them.

The next foundation increment should add a Firebase Emulator Suite lifecycle wrapper and scripted host/player actors. Those actors must emit the same report format and must be runnable with no production project or live Jev key.
