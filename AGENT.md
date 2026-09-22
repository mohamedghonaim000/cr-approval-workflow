# Change Request Review: Working Reference

This is an Angular 15 take-home application. It is intentionally a frontend-only exercise: `CrApiService` is an in-memory Promise API, and the review UI lives in the standalone list and detail components.

## 1. Project structure

`src/` uses feature-adjacent component folders plus small shared/domain/service folders. It has no NgModule or routing configuration: Angular bootstraps the standalone `AppComponent`, which hosts the two standalone screen components side by side.

| Path | Purpose |
|---|---|
| `src/main.ts` | Calls `bootstrapApplication(AppComponent)`; no application module. |
| `src/polyfills.ts` | Imports `zone.js`. |
| `src/index.html` | Browser document and `<app-root>` host. |
| `src/styles.css` | Small global/demo styles, including diff-row colors and disabled-button styling. |
| `src/app/` | Demo shell, not the main assessment implementation target. `app.component.ts` imports and coordinates the list/detail standalone components; `app.component.html` renders the acting-user switcher and both panes. |
| `src/api/` | In-memory API contract and deterministic fixtures. `cr-api.service.ts` is root-injected; `fixtures.ts` exports seeded users, summaries, and details. |
| `src/common/` | Cross-cutting pure helpers: `view-state.ts`, `money.util.ts`, and currently-unused `permissions.ts`. |
| `src/models/` | `cr.models.ts`, the complete domain/API TypeScript model set. |
| `src/session/` | `session.service.ts`, root-injected current-user holder. |
| `src/components/` | Shared diff utility/test plus the two feature component folders. |
| `src/components/diff.util.ts` | Pure baseline/proposed line-item diff function. |
| `src/components/diff.spec.ts` | Pure Jest tests for the diff utility. |
| `src/components/cr-list/` | Standalone CR list component, template, and DOM-oriented TestBed spec. |
| `src/components/cr-detail/` | Standalone CR detail component, template, and DOM-oriented TestBed spec. |

Architecture/conventions: components are standalone (`standalone: true`) and declare their own `CommonModule`/`ReactiveFormsModule` imports; services use `@Injectable({ providedIn: 'root' })`; templates are external HTML files. There are no routes, HTTP clients, NgRx/store, or feature modules. `AppComponent` owns `selectedId`; its `select` handler receives the list component's emitted CR id. The demo user switcher assigns `SessionService.user` and destroys/recreates both panes so they reload.

## 2. Models & types

All domain/API shapes are in `src/models/cr.models.ts`.

| Type | Shape |
|---|---|
| `CrStatus` | `'DRAFT' \| 'SUBMITTED' \| 'PENDING_APPROVAL' \| 'APPROVED' \| 'APPLIED' \| 'REJECTED' \| 'CANCELLED'`. |
| `ReqUser` | `{ id: string; orgCode: string; policies: string[] }`. Policies are strings such as `cr_r_o` and `cr_a_o`. |
| `LineItem` | `{ sku: string; description: string; quantity: number; unitPrice: number }`. |
| `CrSummary` | `{ id: string; title: string; status: CrStatus; orgCode: string; delta: number; currency: string; updatedAt: string }`; `updatedAt` is ISO text. This is the list response row. |
| `TimelineEntry` | `{ action: string; byUserId: string; at: string; note?: string }`; `at` is ISO text and `note` is optional. |
| `CrDetail` | Extends `CrSummary` with `{ agreementId: string; baselineLineItems: LineItem[]; proposedLineItems: LineItem[]; baselineTotal: number; newTotal: number; audit: TimelineEntry[] }`. This is the detail/action response. |
| `ViewStatus` | In `src/common/view-state.ts`: `'idle' \| 'loading' \| 'loaded' \| 'empty' \| 'error'`. |
| `ViewState<T>` | `{ status: ViewStatus; data: T \| null; error?: string }`. `idle<T>()` and `loading<T>()` return `{ status, data: null }`. |
| `DiffKind` | In `src/components/diff.util.ts`: `'added' \| 'removed' \| 'changed' \| 'unchanged'`. |
| `DiffRow` | `{ sku: string; kind: DiffKind; baseline?: LineItem; proposed?: LineItem }`. Removed rows have only `baseline`; added rows have only `proposed`; matched rows have both. |

There are no generic response-envelope types, error DTOs, or action request interfaces: the mock API returns direct Promise payloads and errors with `Error.message`.

## 3. Mock API service

`src/api/cr-api.service.ts` is the component contract. Its private `detailStore` starts as a deep JSON clone of `fixtureDetails`; thus action mutations persist for the lifetime of that service instance, while list output is reconstructed from the store so changed status/updatedAt values appear in later lists.

| Method/signature | Return and behavior |
|---|---|
| `listChangeRequests(user: ReqUser): Promise<CrSummary[]>` (line 39) | Filters fixture summaries to `user.orgCode`, then projects current matching detail-store data into summaries. It never checks read policies. |
| `getChangeRequest(user: ReqUser, id: string): Promise<CrDetail>` (line 49) | Resolves a shallow copy when the CR exists and matches the user's org; otherwise rejects `Error('Not found')`. |
| `approve(user: ReqUser, id: string, at: string): Promise<CrDetail>` (line 55) | Delegates to `transition` with status `APPROVED`, action `APPROVE`, and supplied timestamp. |
| `reject(user: ReqUser, id: string, at: string, reason: string): Promise<CrDetail>` (line 59) | Delegates to `transition` with status `REJECTED`, action `REJECT`, supplied timestamp, and reason as audit `note`. |
| private `transition(user, id, status, action, at, note?): Promise<CrDetail>` (line 63) | Org-checks existence; otherwise changes `status`/`updatedAt`, appends `{ action, byUserId: user.id, at, note }` to `audit`, stores it, and resolves a shallow copy. It does **not** check a policy or require `PENDING_APPROVAL`; UI code must protect those calls. |

Simulation controls:

- `latencyMs` (public, default `0`, line 18) is passed to every `setTimeout` in both successful `settle` and explicit `fail` paths. Set it above zero before a request to exercise loading/submitting behavior.
- `failNext` (public, default `false`, line 20) is consumed by `settle`: the next otherwise-successful API call rejects `Error('Network error')`, resets `failNext` to `false`, and does not resolve. It applies to list/get/approve/reject success paths. `Not found` uses `fail(...)` and does not consume `failNext`.

## 4. SessionService / current user & permissions

`SessionService` (`src/session/session.service.ts:10-13`) is a mutable root singleton with `user: ReqUser = users.approver`. Production would populate it from auth; tests may override the provider with `{ user }`, and the shell replaces `session.user` directly.

`src/common/permissions.ts` is currently not imported anywhere. It supplies:

- `hasPolicy(user: ReqUser, policy: string): boolean`: true when the non-null user has the exact string.
- `canApprovePolicy(user: ReqUser): boolean`: true for any of `cr_a_u`, `cr_a_w`, or `cr_a_o`.

The README policy convention is `cr_{action}_{scope}`: actions are `r` (read), `a` (approve), and `x` (apply); scopes are `u` (own/user), `w` (workspace), and `o` (org). Seed data uses `cr_r_o` for read access and `cr_a_o` for org-level approval. There is no dedicated reject policy helper, so the intended current scaffold policy is that the same approve-capable policy gates both Approve and Reject, in addition to `detail.status === 'PENDING_APPROVAL'`.

Important boundary: this is UI authorization only. The service enforces org isolation but accepts approve/reject calls regardless of policies or current status. Keep guards in the component action methods as well as in the template, so a programmatic/direct call cannot mutate the store when the control is disabled/hidden.

## 5. Existing components

### `CrListComponent`

`src/components/cr-list/cr-list.component.ts`:

- Implemented: `@Output() select`, explicit `state`, `statusFilter`/all status options, `ngOnInit -> load()`, org-scoped API load, and loaded/empty/error state transitions (lines 20-44).
- TODO: `visibleRows` at lines 47-51 always returns all data; it must return all rows for `ALL`, otherwise only rows whose `status` equals `statusFilter`.

`src/components/cr-list/cr-list.component.html` wires a select's change event to `onFilterChange`, loading text, error alert/retry, empty text, and a loaded-only table. Each rendered row emits its CR id on click. Filtering a nonempty result down to zero has no separate filtered-empty UI; the current `empty` state represents an API result with no rows.

### `CrDetailComponent`

`src/components/cr-detail/cr-detail.component.ts`:

- Implemented: required `@Input() id`, explicit detail `state`, `submitting`, `actionError`, initial `rejectControl`, `ngOnInit -> load()`, get/error state handling, `detail`, `diff`, and `fmt` helpers (lines 23-74).
- TODO: `rejectControl` has no validator (line 29); `timeline` returns fixture order instead of explicitly sorting oldest-first (lines 56-60); `canApprove` and `canReject` only inspect status (lines 62-70); `approve()` and `reject()` throw “not implemented” (lines 76-85).
- The supplied detail HTML already renders loading/error/retry; title/status/totals/delta; a diff table wired to `diff`; timeline rows wired to `timeline`; `actionError`; an Approve button; and a conditional Reject form. It disables Approve based on `canApprove || submitting`, but it always renders the Approve button. Reject's container is conditionally rendered from `canReject`; error markup exists but will not appear until a validator makes the control invalid/touched.

Known bugs and exact causes:

1. Diff/preview: `src/components/diff.util.ts:30` defines a match as changed only if `unitPrice` differs. It ignores `quantity` (and, if line-item fields are fully significant, `description`), so CR-1's SKU-A 10 -> 11 quantity change is emitted as `unchanged`. `src/components/diff.spec.ts:19-22` asserts that this must be `changed`.
2. Detail permission: `src/components/cr-detail/cr-detail.component.ts:63-66` returns true solely for a pending CR. Therefore its template binding at `cr-detail.component.html:54` enables Approve for `users.viewer`, whose only policy is `cr_r_o`. The failing spec is `cr-detail.component.spec.ts:29-32`; it expects the button's DOM `disabled` property to be true. Use the unused policy helper (and apply equivalent protection to reject/action methods).

## 6. Existing tests

Jest discovers `src/**/*.spec.ts` (`package.json`), uses `jest-preset-angular`, and TestBed component specs wait for the Promise/timer API with a zero-timeout `flush` helper.

Baseline run: `node node_modules/jest/bin/jest.js --runInBand --no-cache` produced **3 suites, 7 tests: 5 passed, 2 failed**.

| Test file | Current result | Assertions/coverage |
|---|---|---|
| `src/components/diff.spec.ts` | 2 pass, 1 fail | Passes removed SKU-B and added SKU-C classifications. Failing `detects a quantity-only change as changed` expects SKU-A to be `changed` for quantity 10 -> 11 with unchanged unit price (line 22); actual is `unchanged`. |
| `src/components/cr-list/cr-list.component.spec.ts` | 2 pass | Approver sees exactly 3 `org-alpha` rows; an `org-empty` user sees `.cr-list__empty` and no table. It does not yet test filter, loading/error, selection, or retry. |
| `src/components/cr-detail/cr-detail.component.spec.ts` | 1 pass, 1 fail | Passes title rendering for approver/CR-1. Failing viewer test expects `.cr-actions__approve.disabled === true` for pending CR-1 (line 32); actual is `false`. It does not yet test diff DOM, chronology, reject visibility/validation, actions, latency, or errors. |

## 7. Fixtures

`src/api/fixtures.ts` exports deterministic data:

| User | Identity / org | Policies |
|---|---|---|
| `users.approver` | `mona`, `org-alpha` | `cr_r_o`, `cr_a_o` |
| `users.viewer` | `val`, `org-alpha` | `cr_r_o` |
| `users.otherOrg` | `bob`, `org-beta` | `cr_r_o`, `cr_a_o` |

| CR | Org / status / monetary data | Useful detail fixture facts |
|---|---|---|
| `CR-1` | alpha, `PENDING_APPROVAL`, USD, delta 500; baseline/new totals 8000/8500 | SKU-A quantity changes 10 -> 11 at the same 500 price; SKU-B unchanged. Audit is newest-first: SEND_FOR_APPROVAL 10:00, SUBMIT 09:30, CREATE 09:00 on 2026-03-02. |
| `CR-2` | alpha, `APPLIED`, USD, delta 0; totals 3000/3000 | SKU-B description changes to “Widget B (new supplier)” with same quantity/price. Audit is already oldest-first: CREATE, APPROVE, APPLY. |
| `CR-3` | alpha, `DRAFT`, USD, delta 0; totals 1000/1000 | Identical single SKU-C baseline/proposed item; one CREATE audit entry. |
| `CR-9` | beta, `PENDING_APPROVAL`, USD, delta 200; totals 1000/1200 | SKU-Z quantity changes 5 -> 6; one CREATE audit entry. It must be absent to alpha users via API org filtering. |

Summaries include CR-1, CR-2, CR-3, and CR-9. Detail records spread those summaries and add agreement/line-item/audit fields. The service's per-instance clone means action tests should use a fresh TestBed/service or account for mutation persistence.

## 8. Code style & conventions

- Angular version is 15.2.x; TypeScript is 4.9.5. Use standalone components and external templates, matching the existing constructor injection and async/await Promise pattern.
- Prettier (`.prettierrc`): tabs, single quotes, semicolons, trailing commas, `printWidth: 140`.
- ESLint (`.eslintrc.js`): recommended ESLint plus `@typescript-eslint/recommended`; browser/node/ES2022/Jest environments. Explicit module return types and `any` are deliberately allowed.
- Naming: PascalCase interfaces/classes/components (`CrDetailComponent`); camelCase variables/methods; type aliases/fields reflect backend terms; component selectors/classes use `app-` and `cr-` kebab-case. `readonly` is used for injected dependencies and static option lists.
- State pattern: write a whole `ViewState` object via `idle()`/`loading()` then loaded/empty/error result; surface errors with `Error.message`. Templates use structural `*ngIf`/`*ngFor`, CSS class hooks, and `data-status`/`data-kind` attributes.
- Tests are async TestBed DOM tests for components; pure utilities use direct Jest assertions. Existing tests favor actual rendered selectors and waiting for the mock API timer.

## 9. Gaps checklist

### Task 1 — fix the two root bugs

- [ ] `src/components/diff.util.ts`: compare all relevant matched `LineItem` fields, at minimum `quantity` as well as `unitPrice`, so a quantity-only difference is `changed`; preserve SKU-based added/removed behavior. Covered by the existing failing `src/components/diff.spec.ts` assertion.
- [ ] `src/components/cr-detail/cr-detail.component.ts`: make `canApprove` require pending status and a real approval policy via `canApprovePolicy(this.session.user)`. Apply the same policy/status invariant to rejection and method-level action guards. Existing `cr-detail.component.spec.ts` then passes.

### Task 2 — list filter

- [ ] `src/components/cr-list/cr-list.component.ts`: implement `visibleRows` filtering against `statusFilter`, preserving `ALL` behavior and not mutating `state.data`.
- [ ] `src/components/cr-list/cr-list.component.spec.ts`: add DOM/state coverage for filter behavior; ideally also loading/error/retry since those branches are scaffolded but untested.
- [ ] `src/components/cr-list/cr-list.component.html`: no required structural change for the stated filter; its select and `*ngFor` are already wired.

### Task 3 — detail data and safe actions

- [ ] `src/components/cr-detail/cr-detail.component.ts`: sort a copy of `audit` ascending by ISO `at` in `timeline` (do not mutate fixture/state audit); configure required reject-reason validation; implement approve/reject calls with an ISO timestamp, `submitting` lifecycle, error capture, and replacing loaded detail with the returned `CrDetail` on success.
- [ ] `src/components/cr-detail/cr-detail.component.html`: ensure action visibility/enabled state reflects the component's permission-aware getters. Decide whether an unauthorized user sees no action controls (the acceptance text says cannot see/enable actions) rather than only disabled Approve; retain the error/validation class hooks.
- [ ] `src/common/permissions.ts`: reuse `canApprovePolicy` rather than duplicating policy string checks; add only a narrowly justified helper if final policy semantics need it.
- [ ] `src/api/cr-api.service.ts`: consume it as-is; do not rely on it for policy/status protection. Use `latencyMs`/`failNext` to prove coherent submitting/error behavior.

### Task 4 — permission-aware UX states

- [ ] `src/components/cr-detail/cr-detail.component.ts` and `.html`: enforce policy + `PENDING_APPROVAL` for both offered actions; guards must prevent direct method calls too. Loading/error detail branches already exist; make action errors visible through `actionError` without destroying existing loaded data.
- [ ] `src/components/cr-list/cr-list.component.ts` and `.html`: retain explicit loading/loaded/empty/error behavior while adding the filter. The list already has all four presentation branches except its initial `idle` state intentionally renders nothing before `ngOnInit` loads.

### Task 5 — tests

- [ ] Extend `src/components/diff.spec.ts` for every relevant matched-field change and unchanged behavior, plus existing added/removed cases.
- [ ] Extend `src/components/cr-list/cr-list.component.spec.ts` with rendered filter and state/error/retry coverage.
- [ ] Extend `src/components/cr-detail/cr-detail.component.spec.ts` with chronological timeline DOM order, diff rows/totals, policy-based visibility/disabled state, required reason validation, successful approve/reject state/audit updates, slow-request double-submit prevention, and `failNext` error recovery.
- [ ] Keep `npm test`, `npm run typecheck`, `npm run lint`, and (when ready) `npm run build` green. `npm` may be blocked by PowerShell execution policy in this environment; `npm.cmd` or direct `node node_modules/jest/bin/jest.js` works here.

No implementation has been performed beyond documenting the investigation in this file.
