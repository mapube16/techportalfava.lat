# Project Research Summary

**Project:** FAVA Control Técnico — field-operations tracking web app for industrial machinery installation technicians
**Domain:** Field service / time & attendance (day-based, not hour-based) with client-signed weekly reports and sold-vs-executed commercial control
**Researched:** 2026-07-25
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a field-service timesheet app with one unusual constraint that drives every other decision: the weekly output must be a PDF the client accepts as a legal replacement for a paper form, signed on-site by a client representative. The market is split — Field Service Management tools (Salesforce FSM, Dynamics 365 FS) produce signed service reports but don't do sold-vs-executed commercial tracking; Professional Services Automation tools (Replicon, BigTime) do budget-vs-actual but never produce a client-signed document. FAVA needs the intersection, which is why building beats buying. Research converges on a modular-monolith NestJS backend, PostgreSQL with Row-Level Security scoped to just three tables (daily_entries, weekly_notes, trips), Prisma 7 with an explicit cjs module format to stay compatible with NestJS decorators, Microsoft Entra ID auth validated by hand with jose (the old passport-azure-ad library is dead), and native NestJS SSE as a lightweight invalidation bus rather than a data channel.

The recommended build order is dictated by two hard dependencies: nothing works without identity, and retrofitting RLS after services are written means touching every one of them. So the sequence is auth-first (deployed to Railway immediately, because Railway's real limits — SSE timeouts, dual Postgres roles, single-service builds — only surface in that environment), then the RLS foundation, then reference data, then the daily-entry core, then the approval state machine, then PDF/signature, migration (parallelizable with the core), realtime, dashboards, and hardening last. The features research is unusually actionable: it identifies that the weekly note — not the daily entry — must be the approvable unit, that notes should be auto-derived per project rather than manually managed by the technician, and that offline support should cover only draft capture and signature (not full sync), which is exactly the scope Dynamics 365 FS validates as sufficient even in its own offline-first product.

The main risks are well-documented and concentrated in a few places: RLS silently doing nothing because the runtime connects as the table owner (Postgres bypasses RLS for owners by default — this has zero symptoms until it's exploited), the PDF being regenerated on demand so the "signed" document drifts from what the client actually signed, and a hosting-plan mismatch — the original security plan (CONTEXTO Section 12) assumes Azure (Key Vault, VNet, TDE) but the project deploys to Railway, and nobody has reconciled the two. All three pitfalls have concrete, cheap mitigations (two Postgres roles + FORCE ROW LEVEL SECURITY, freeze-and-hash the PDF at signing time, rewrite Section 12 as a Railway controls matrix) and all three must be decided in the first phase, not discovered in the last one.

## Key Findings

### Recommended Stack

NestJS 11.1.x on Node 22 LTS with TypeScript pinned exactly at 5.9.3 (npm's latest tag now points to TS 7, the Go-native compiler, which has no confirmed decorator-metadata support — NestJS would not boot on it). Prisma 7.9.x is a breaking major release; it must be configured with provider = "prisma-client", moduleFormat = "cjs", and @prisma/adapter-pg, or it ships ESM by default and conflicts with NestJS's CJS/decorator setup. Auth uses jose@6 with createRemoteJWKSet plus a ~30-line hand-written guard, because passport-azure-ad is archived and deprecated with no Microsoft-blessed replacement. Real-time uses NestJS's native @Sse() (zero dependencies) paired with @microsoft/fetch-event-source on the client, because the browser's native EventSource cannot send an Authorization header. Charts use Nivo 0.99, which works with the existing React 18.3.1 with no frontend upgrade needed.

**Core technologies:**
- **NestJS 11.1.28 / Node 22 LTS / TypeScript 5.9.3 (pinned)** — decorator metadata is the whole framework; Node 22 is forced by the intersection of Prisma 7, NestJS 11, and whichever PDF engine is chosen (Puppeteer requires >=22.12.0)
- **Prisma 7.9.0 + @prisma/adapter-pg** — driver adapters are mandatory in v7 (Rust query engine removed); moduleFormat = "cjs" is the one line that makes it work with NestJS
- **jose@6.2.4** — replaces passport-azure-ad + 4 glue packages with one JWKS/JWT verification call
- **PostgreSQL 16/17 (Railway managed)**, RLS scoped to 3 tables only — everything else is RBAC-protected, not RLS-protected, to keep the policy surface auditable
- **ExcelJS 4.4.0** for writing .xlsx (reconciliation report, Fase 2 exports); Python xlrd for the one-off legacy .xls read, run **outside** the deployed backend (the only npm library that reads BIFF is abandoned with unpatched CVEs)
- **Nivo 0.99.0** for charts, replacing ECharts, with no React upgrade required

### Expected Features

The 8 findings in FEATURES.md that change the original design are the most load-bearing part of that document: the weekly note (not the daily entry) is the approvable unit; technicians never manage "notes" directly — they fill a 7-day grid and the system derives one note per project on submit; the correct order is sign then submit then approve (the client signs in the field before the office ever sees it); a signature invalidates only when the signed content changes (tracked via signed_content_hash); the signed PDF is an immutable, versioned artifact; full offline sync is an anti-feature but offline draft + signature capture is table stakes; technicians must exist independently of users/Entra (the migration brings historical Italian technicians who may never log in); and migrated records must land as approved + is_migrated=true, never draft (7,589 rows in the approval inbox would kill the first demo).

**Must have (table stakes):**
- Weekly grid capture (7 day-rows), mirroring the PDF body exactly
- draft to submitted to approved/returned state machine with dedicated transition endpoints (never a generic PATCH /status)
- Mandatory comment on return, read-only lock after submit, immutability after approve
- Append-only audit log on every transition (who/when/before/after)
- Faithful PDF matching the real paper form field-for-field, with dual signatures + evidence record
- UNIQUE(technician_id, date) on a pure calendar date (no time, no timezone)
- Closed catalogs (concept, role, project, machine) — free text is the documented root cause of the Excel's data-quality problems
- Sold vs. executed days by role x phase, Entra SSO + 3-role RBAC + RLS, in-app notifications with SSE badge
- Local draft persistence + idempotent submit (client-generated Idempotency-Key)

**Should have (differentiators):**
- Auto-derived weekly notes per project (no market PSA tool does this — they all force choosing a timesheet first)
- Single source of truth: the signed note IS the timesheet IS the KPI input — the actual core value proposition
- source_row_ref traceability to the original Excel row (cheap, high trust during acceptance)
- Audited reopen (Super Admin only, mandatory reason, version++, prior PDF preserved)
- Signature escape hatch: upload a scanned signed PDF, for the client who refuses to sign on a phone

**Defer (v2+):**
- Full offline-first sync, GPS/geofencing (explicitly rejected — kills team trust, no core-value payoff), hourly granularity (the whole domain is day-atomic), a client-facing login portal, automatic ES/IT translation, payroll calculation, unlimited photo attachments, Viaggi travel billing module (formula not yet defined by FAVA)

### Architecture Approach

A single NestJS modular monolith, organized by domain (not by layer), serving both the API and the existing Vite frontend build from one Railway service — eliminating CORS entirely. RLS is implemented as one interactive Prisma transaction per request (via AsyncLocalStorage), deliberately **not** Prisma's own official RLS client-extension example, because that example wraps every query in its own batch transaction and Prisma's own docs warn it can silently break explicit $transaction() calls — exactly the multi-statement operation the approve transition needs. RLS policies are scoped to only daily_entries, weekly_notes, and trips; catalogs, projects, and users rely on RBAC alone.

**Major components:**
1. common/prisma + common/auth — the transaction-per-request RLS interceptor and Entra JWT validation; the only truly cross-cutting concerns
2. weekly-notes (+ nested pdf/) — owns the approval state machine and is the **only** module allowed to write status on daily_entries; the PDF is a projection of the note, not an independent capability
3. dashboards — raw SQL/views only, never routed through domain services, to avoid N+1 aggregation
4. realtime — SSE endpoint emitting {type, entity, id} only; clients refetch via TanStack Query invalidateQueries rather than receiving state deltas
5. import — a standalone Nest CLI context with no HTTP controller, running under an owner Postgres role that intentionally bypasses RLS

### Critical Pitfalls

1. **RLS enabled but the runtime connects as the table owner** — Postgres table owners bypass RLS by default with zero symptoms. Fix: two Postgres roles (fava_migrator owner, fava_app runtime with NOBYPASSRLS) + FORCE ROW LEVEL SECURITY + an integration test that connects as the runtime role and asserts row counts are actually filtered.
2. **RLS session variable set with plain SET instead of set_config(..., true)** — leaks between pooled connections (one technician sees another's data intermittently), or the overcorrection of wrapping the entire request in $transaction causes P2028 timeouts and pool exhaustion under load. Fix: set_config scoped to a transaction-per-use-case, with slow I/O (PDF rendering) always outside the transaction.
3. **Entra token validated "by eye"** — accepting Graph-scoped tokens, skipping aud comparison (confused deputy), or keying identity on email instead of the stable oid. Fix: a separate API app registration with an exposed scope, jose validation of signature/iss/tid/aud/scp in that exact order, oid as the real user key.
4. **A day shift bug from storing the workday as timestamptz instead of DATE** — corrupts UNIQUE(technician_id, date) across FAVA's genuinely multi-timezone technician base (Colombia, Italy, Brazil, USA). Fix: DATE type end-to-end, never new Date() server-side for "today", test the suite under TZ=UTC+14 and TZ=UTC-11.
5. **Approval race conditions from read-then-write instead of compare-and-set** — two admins approving the same note, or a technician editing a day that's already locked inside an approved note. Fix: updateMany with a status precondition + count === 1 check to return 409 on conflict, enforced in one shared guard function, backed by a DB-level check/trigger as a second net.

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Foundation — schema, RLS, auth, first Railway deploy
**Rationale:** Nothing works without identity, and retrofitting RLS after services exist means touching every one of them. Railway's real constraints (SSE timeouts, dual Postgres roles, single-service build) only surface once deployed — discover them now, not at the end.
**Delivers:** schema.prisma with the source_* migration-traceability fields already in place, two Postgres roles with FORCE ROW LEVEL SECURITY on the 3 in-scope tables, Entra login to GET /api/me deployed and working on Railway.
**Addresses:** SSO Entra ID + RBAC + RLS (table stakes), technicians independent of users
**Avoids:** Pitfalls 1, 2, 3, 4 (schema), 11 (Railway network/role decisions), 12 (the fase dimension needed for KPIs must be decided here)
**Research flag:** the Prisma 7 + RLS + interactive $transaction() combination is a documented internal tension (Prisma's own docs warn about it) — prototype the submit/approve multi-table transition here before committing.

### Phase 2: Reference data (catalogs, technicians, projects, users)
**Rationale:** projects carries the NIT/localidad/suministro/contrato fields that live nowhere else and are required for the PDF header — this must exist before weekly-notes can render anything real.
**Delivers:** CRUD for catalogs, technicians (with deactivation, independent of Entra), projects (+ sold-days rol x fase + machines in one module), users/RBAC.
**Addresses:** closed catalogs, sold-vs-executed baseline data, technician deactivation without data loss
**Research flag:** none — standard CRUD, well-documented pattern.

### Phase 3: Daily entry capture (bitácora)
**Rationale:** The core value proposition — single-capture-source — starts here. daily_entries is the one place data enters the system.
**Delivers:** weekly grid UI, UNIQUE(technician_id, date) upsert, local draft persistence, idempotent submit.
**Addresses:** weekly grid capture, one entry per technician per day, local draft + idempotency (table stakes)
**Avoids:** Pitfall 4 (date/timezone), Pitfall 14 (mobile double-submit), Pitfall 13 partially (Sin Proyecto handling)

### Phase 4: Weekly notes — approval state machine
**Rationale:** Confirmed finding: the note, not the entry, is the approvable unit; entries must derive their lock state from the note.
**Delivers:** auto-derivation of one note per project on submit, submit/approve/return/reopen as dedicated endpoints, append-only audit log with reason and on_behalf_of.
**Addresses:** state machine, mandatory return comment, lock-after-submit, audited reopen (differentiator)
**Avoids:** Pitfall 5 (approval races) — via compare-and-set updates
**Uses:** the RLS transaction pattern from Phase 1; weekly-notes is the sole writer of daily_entries.status

### Phase 5: PDF generation + client signature
**Rationale:** The hard acceptance criterion ("fiel al formato real") and the legal/evidentiary requirement both live here; this is the highest-risk phase and depends on projects (headers) and the approval flow (what gets signed) both being stable.
**Delivers:** faithful PDF render, canvas signature + evidence record, freeze-and-hash on sign, versioned/immutable PDF history.
**Addresses:** PDF fidelity, signature capture + evidence (table stakes); versioned notes, signature escape hatch (differentiators)
**Avoids:** Pitfall 8 (PDF regenerated on demand drifts from what was signed), Pitfall 9 (signature with no evidentiary value)
**PDF library decision — see the reconciled recommendation below. This is the one open disagreement between STACK.md and ARCHITECTURE.md; resolve it at the start of this phase, not before, once the real PDF and FAVA's answer on a fillable-PDF original are in hand.**
**Research flag:** yes — the PDF fidelity approach needs a timeboxed spike (see decision trigger) before locking the implementation.

### Phase 6: Historical migration + reconciliation
**Rationale:** Can run in parallel with Phases 3-4 once the schema is stable (Phase 2); must finish before Phase 8, since KPIs without history are unvalidatable and undermine the first demo.
**Delivers:** one-off ETL (Python xlrd, proven on this exact file per CONTEXTO Section 17), idempotent upsert keyed by source_*, a reconciliation report FAVA signs off on.
**Addresses:** migration with reconciliation report (table stakes, high complexity)
**Avoids:** Pitfall 6 (migration without reconciliation/idempotency — the pitfall that undermines client trust), Pitfall 7 (BIFF parsing errors: encoding, merged cells, 1900 leap-year bug)
**Research flag:** low — the extraction tool is already proven; the reconciliation report format is a design decision, not a research gap.

### Phase 7: Real-time (SSE) + in-app notifications
**Rationale:** Needs events to publish, so it comes after the approval flow exists.
**Delivers:** @Sse() endpoint as an invalidation bus only ({type, entity, id}, never a data payload), 25s heartbeat (Railway kills idle streams at 5 min, caps streams at 15 min), notification center.
**Addresses:** SSE badge, in-app notification center (table stakes)
**Avoids:** Pitfall 10 (SSE dies silently on Railway) — validate in the actual Railway environment, not just locally.
**Research flag:** low — the pattern (native @Sse(), @microsoft/fetch-event-source client, invalidate-and-refetch) is fully documented in ARCHITECTURE.md with working code.

### Phase 8: Dashboards / KPIs
**Rationale:** Needs both migrated history (Phase 6) and the approved-entries filter (Phase 4) to produce credible numbers.
**Delivers:** 5 Nivo dashboards (vendido/ejecutado, utilizacion, distribucion por concepto, dias por cliente/pais, estado de reportes), backed by SQL views, not TypeScript aggregation.
**Addresses:** sold-vs-executed, utilization KPI, reconciliation screen (differentiator)
**Avoids:** Pitfall 12 (KPIs that recompute over unapproved data or ignore the MD half-day weight)

### Phase 9: Hardening / production readiness
**Rationale:** The original security plan (CONTEXTO Section 12) assumes Azure; the project deploys to Railway. This must be reconciled before go-live, and backups must be tested, not assumed.
**Delivers:** Railway controls matrix replacing the Azure-assumption doc, private-network DB connection, verified backup restore, zod-validated env vars that fail boot rather than silently defaulting.
**Avoids:** Pitfall 11 (security plan written for the wrong hosting platform)

Frontend cutover is interleaved starting in Phase 2, screen by screen, never as a big-bang at the end (per ARCHITECTURE.md's explicit recommendation).

### PDF Library — Reconciling the One Disagreement

**The disagreement:** STACK.md recommends Puppeteer 25.3.0 rendering an HTML/CSS template, reasoning that CSS @page + <table> makes matching a paper form a styling task rather than coordinate math, and treats the "Chromium is heavy" objection as inapplicable at this generation volume (a handful of PDFs per week). ARCHITECTURE.md recommends @react-pdf/renderer instead, citing ~400ms vs. ~2.8s render time, no Chromium image (~300-400MB) or Dockerfile requirement, and no page-leak/OOM risk in a small Railway container. PITFALLS.md sides with the architecture view on deployment risk (OOM, zombie processes, chrome-headless-shell dependency wrangling in Docker) and explicitly recommends evaluating a non-browser library first, since the Nota is one fixed template, not a general document renderer.

**Reconciled recommendation, with decision trigger:**

1. **First, ask FAVA one question before writing any template code:** does a fillable PDF (AcroForm) of the Nota already exist? If yes, use **pdf-lib** — fill the AcroForm fields and stamp the two signature PNGs onto the original. This beats every renderer on both effort and fidelity simultaneously, because there's no layout to reconstruct at all. This is a 30-minute email, not a research task, and it should happen before Phase 5 starts.
2. **If no fillable PDF exists (the default assumption), build with @react-pdf/renderer.** It fits the single-Railway-service architecture with no Dockerfile, avoids the Puppeteer OOM/zombie-process risk PITFALLS.md flags for a 512MB-1GB container, and two of the three research dimensions (architecture and pitfalls) converge on avoiding a browser engine for what is fundamentally one fixed tabular template. Validate fidelity by overlaying the render against the real "Reporte 02 - Ivan Cortes.pdf" field-by-field — NIT, localidad, suministro, contrato, the 7-day table, gastos, anticipo, declaracion, dual signatures.
3. **Escalation trigger:** timebox the @react-pdf/renderer fidelity attempt (its layout model is Yoga flexbox, not CSS — no native <table>, manual font registration for ES/IT accents). If after roughly one day of real effort it cannot match the paper form closely enough to satisfy "fiel al formato real" — the hard, client-facing acceptance criterion — switch to Puppeteer + a Dockerfile (Railway publishes a working template to start from) and accept the added deployment complexity as the cost of fidelity. Make this call inside Phase 5 with the real template in hand, not speculatively now.

This keeps the default lightweight and Railway-native while preserving a clear, cheap off-ramp to the higher-fidelity-but-heavier option if the flexbox layout genuinely can't get there.

### Phase Ordering Rationale

- **Identity and RLS come first** because every other module either enforces or depends on them, and retrofitting RLS after services are written means auditing every query already in place.
- **Reference data before capture** because projects carries PDF-header fields (NIT, localidad, suministro, contrato) that exist nowhere else in the domain — this is a hard data dependency, not a preference.
- **Migration can parallelize with the capture/approval core** once the schema is stable, because it's an isolated CLI tool with no HTTP surface, but it must finish before dashboards, since KPIs without 2025-2026 history are commercially meaningless.
- **PDF/signature comes after the approval flow**, not before, because what gets frozen and signed is the approved note's content — building the PDF renderer before the state machine exists risks designing against the wrong data shape.
- **Realtime and dashboards are last among functional phases** because they're additive layers over data that must already be correct; validating SSE against Railway's actual timeout behavior only makes sense once there's something worth streaming.
- **Hardening is explicitly last but its decisions are made in Phase 1** (DB roles, network topology) — this avoids the Anti-Pattern ARCHITECTURE.md calls out directly: deploying to Railway "at the end" means discovering the SSE cutoff and the dual-role requirement with the app already finished.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Prisma 7 + RLS + interactive $transaction() interaction is flagged MEDIUM confidence by STACK.md itself and needs a working prototype of the submit/approve multi-table transition before the pattern is trusted.
- **Phase 5:** PDF approach is contingent on an external answer from FAVA (fillable PDF or not) and a timeboxed fidelity spike — see the decision trigger above.

Phases with standard, well-documented patterns (skip /gsd:research-phase):
- **Phase 2:** Standard CRUD over closed catalogs — no ambiguity.
- **Phase 3:** Weekly grid capture with UNIQUE(technician_id, date) — the date/timezone handling is fully specified in ARCHITECTURE.md and PITFALLS.md with concrete tests.
- **Phase 7:** SSE pattern (native @Sse(), invalidation-only payload, heartbeat) is documented with working code in ARCHITECTURE.md, including the exact Railway limits to test against.
- **Phase 8:** SQL-view-based KPI aggregation is a standard pattern; the risk is a business-rule decision (does MD weigh 0.5? do LR/NR/IL count toward utilization?), not a technical unknown.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH for versions (verified live against npm registry 2026-07-25); MEDIUM for PDF and migration-tooling choices (explicit judgment calls) |
| Features | MEDIUM — strong pattern consistency across 6+ vendor products for approval/lock/reopen; FAVA's day-atomic model has no direct market analog, so several recommendations are derived, not observed |
| Architecture | MEDIUM-HIGH — NestJS/Prisma/RLS/SSE patterns verified against official docs; PDF-storage and PDF-engine choices are opinionated over third-party evidence (DEV.to comparison article, GitHub discussions) |
| Pitfalls | HIGH for auth, RLS, SSE/Railway limits, and transaction handling (official Postgres/Microsoft/Railway/Prisma docs); MEDIUM for PDF/signature evidentiary sufficiency and migration data-quality specifics (ecosystem docs + direct analysis of the real Excel file) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **PDF library final choice** — resolved with a decision trigger above, but execution (the FAVA email + the timeboxed fidelity spike) must happen at the start of Phase 5, not now.
- **Utilization KPI denominator** — do LR/NR/IL (non-billable leave/no-role/idle days) count toward available days? [DECIDIR CON FAVA] — defines whether the headline KPI is credible.
- **PDF multi-project rendering** — when a technician's week spans two projects, does the note for project A show 7 date rows with project B's days blank, or only A's own days? [DECIDIR CON FAVA] — the default recommendation (blank rows, never reveal cross-client work) should be validated before building the template.
- **Half-day (MD) split across two projects** — if this can happen, UNIQUE(technician_id, date) needs to relax to include project_id plus a fraction-sums-to-less-than-or-equal-1 check. Default assumption is no; confirm before Phase 3.
- **Signature absence** — can a note be approved without a client signature, explicitly marked as such, or does it hard-block? Affects the submit validation rules in Phase 4.
- **Conformity declaration legal text** — the current Word document's wording needs legal review for electronic-signature adequacy before Phase 5 ships to production.
- **PDF retention period** — how many years must signed PDFs be kept? Determines storage/backup policy for Phase 9.
- **Azure vs. Railway hosting mandate** — CONTEXTO Section 12 assumes Azure; Railway was a later decision. Every secret should stay in env vars so this remains a configuration change, not a rewrite, but the mandate itself needs FAVA/IT confirmation before Phase 9 locks in Railway-specific hardening.
- **Historical technicians without Entra accounts** — assumed they migrate in without login capability; confirm with FAVA before Phase 6.

## Sources

### Primary (HIGH confidence)
- npm registry (live query, 2026-07-25) — all package versions, peer dependencies, engines, deprecation flags
- PostgreSQL — Row Security Policies (https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — table-owner RLS bypass, FORCE ROW LEVEL SECURITY
- Microsoft Learn — Access tokens in the Microsoft identity platform (https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) — validation rules, confused-deputy guidance
- Prisma — Upgrade to Prisma ORM 7 (https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) and Schema generators reference (https://www.prisma.io/docs/orm/prisma-schema/overview/generators) — breaking changes, moduleFormat
- NestJS docs — Server-Sent Events (https://docs.nestjs.com/techniques/server-sent-events) — @Sse() API
- Railway — SSE vs WebSockets (https://docs.railway.com/guides/sse-vs-websockets) and Volumes reference (https://docs.railway.com/volumes/reference) — SSE timeouts, volume/replica limits
- AzureAD/passport-azure-ad (archived) (https://github.com/AzureAD/passport-azure-ad) — deprecation confirmed

### Secondary (MEDIUM confidence)
- PDF Generation on the Server: Puppeteer vs @react-pdf/renderer — DEV (https://dev.to/iurii_rogulia/pdf-generation-on-the-server-puppeteer-vs-react-pdfrenderer-a-production-comparison-44cg) — render-time and memory comparison
- Field-service/PSA vendor documentation (Replicon, BigTime, ClickTime, QuickBooks Time, Hubstaff, Connecteam, Salesforce Field Service, Dynamics 365 Field Service) — approval workflow, offline sync, and notification patterns
- Ley 527/1999 and Decreto 2364/2012 (Colombia) + eIDAS Art. 25(1) (EU) — electronic signature legal framework
- Prisma prisma-client-extensions/row-level-security GitHub example + Prisma Discussion #20016 — the $transaction interaction warning that shaped the RLS pattern decision

### Tertiary (LOW confidence, flagged for validation)
- PDF size/volume estimate (~120MB/year) — extrapolated from one sample PDF, measure with the first real render
- Railway proxy buffering behavior with SSE — documented timeouts but not buffering; verify in the Phase 1 Railway deploy
- Signature evidence-file legal sufficiency — vendor consensus (commercial e-signature sources), not Colombian case law

---
*Research completed: 2026-07-25*
*Ready for roadmap: yes*
