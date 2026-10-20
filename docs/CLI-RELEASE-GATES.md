# CLI release and cross-repository parity

The CLI is independently testable from its checked-in canonical public operation index, with no live sibling-repository dependency during PR CI.

Release gate: API contract hash must match the approved Engine artifact and the versioned public operation indexes of SDK and Cookbooks. Every mismatch blocks **coordinated release**, not unrelated local development runs. Reconciliation must record exact commit SHAs, tests, artifact digests, rollback, and approval.

## Requirements
- [ ] Validate local command paths against pinned contract
- [ ] Mock execution tests for all commands and auth boundaries
- [ ] No live keys in args, files or logs; test/live explicitly separate
- [ ] No automatic retries of mutation requests
- [ ] Verify published API readiness and tenant sandbox access, with expiry/revocation
- [ ] Verify public npm/package manifest if published later
- [ ] Run coordinated registry and examples parity before GA
- [ ] PR CI must not need latest state of SDK/Cookbooks or Iran Open Finance

Cloudflare Forge is an optional experimental OpenAPI generation input only; it is not a production runtime dependency or a blocking CLI build dependency.
