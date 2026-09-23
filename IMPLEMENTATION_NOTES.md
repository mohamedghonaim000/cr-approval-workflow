# Implementation Notes

## 1. What I changed

- Fixed the line-item diff classification so matched items are marked `changed` when their description, quantity, or unit price changes. Added and removed SKUs continue to be classified by their presence in the baseline and proposed lists.
- Fixed approval permission handling. Approve and Reject now require both a `PENDING_APPROVAL` Change Request and an approval policy on the current user.
- Implemented the Change Request list status filter without changing the originally loaded list data.
- Completed the detail review flow: chronological audit timeline, required rejection reason, safe Approve/Reject actions, action error handling, and prevention of duplicate submissions while a request is in progress.
- Added tests for list states/filtering, diff classifications, timeline ordering, permission behavior, diff/totals rendering, validation, successful actions, API errors, and slow responses.

## 2. Component & state model

Both screen components use `ViewState<T>` to make their asynchronous request states explicit. `CrListComponent` moves from `idle` to `loading`, then to `loaded`, `empty`, or `error` after `listChangeRequests`. It keeps the API response in `state.data`; `visibleRows` derives the filtered display list and never mutates that source data.

`CrDetailComponent` follows the same loading/loaded/error pattern for a selected CR. The template renders its diff and totals from the loaded detail. The `timeline` getter creates and sorts a copy of the audit entries so rendering does not mutate component state. Action-specific state is separate: `submitting` prevents concurrent submissions, `actionError` retains an actionable error while keeping the reviewed CR visible, and `rejectControl` owns the rejection-reason validation state.

## 3. Invariants I keep

| Invariant | How / where |
|---|---|
| A user can review a CR only when it is pending and they have an approval policy. | `canApprove` and `canReject` require `PENDING_APPROVAL` and `canApprovePolicy(session.user)`. |
| A disabled/hidden control is not the only protection against an unauthorized action. | `approve()` and `reject()` repeat the policy/status and `submitting` guards before calling the API. |
| A rejection must have an audit reason. | `Validators.required` on `rejectControl`; `reject()` marks the field touched and returns if invalid. |
| A slow request cannot create duplicate decisions. | `submitting` is set before awaiting the API; templates disable action buttons and methods guard against another call. |
| Failed actions do not discard the CR being reviewed. | Action failures set `actionError`; they do not overwrite the loaded `state.data`. |
| Timeline rendering does not mutate API/state data. | `timeline` sorts a spread copy of `detail.audit`. |
| Filtering does not destroy the loaded list. | `visibleRows` returns a filtered copy for display only. |

## 4. Testing strategy

I used pure Jest tests for `computeDiff`, because it is a deterministic utility with no Angular rendering concerns. Those tests cover added, removed, quantity-only changed, description-only changed, and unchanged line items.

For list and detail behavior, I used Angular TestBed and asserted rendered DOM output. This covers list loading, empty, error/retry, filtering, chronological timeline order, totals/diff output, read-only permissions, rejection validation, successful Approve/Reject flows, and audit updates. `CrApiService.failNext` creates deterministic error cases, while `latencyMs` exercises loading/submitting UI and the duplicate-submit guard.

I did not add a separate Reject failure test because Approve and Reject use the same `submitting`/`actionError`/`try-catch-finally` action pattern. I covered Reject's distinct concerns—validation, status transition, and reason audit entry—and covered the shared failure path through Approve.

## 5. Assumptions

- The existing policy model contains approval policies but no separate reject policy. I treated rejection as part of the approval workflow, so the same approval policy gates both actions.
- The supplied detail test expects the Approve button to exist and be disabled for a read-only viewer. I preserve that DOM contract: Approve is visible but disabled for viewers, while Reject is not offered. Both component methods still enforce authorization.
- The mock API is in-memory and deliberately does not persist changes after a browser refresh. In a production application, the API/backend would persist the decision and the list would be refreshed or updated after a successful action.
- ISO timestamps are generated with `new Date().toISOString()` so audit events have a consistent UTC format.

## 6. Where I used AI

I used an AI coding assistant to investigate the scaffold, explain Angular concepts and the business workflow, identify the original defects, propose implementation/test approaches, and help draft several tests and this documentation. I reviewed the resulting code, ran the validation commands locally, and can explain the state, permission, and test decisions.

## 7. What I'd improve with more time

- Persist CR transitions in a real backend and refresh or synchronize the list immediately after an action succeeds.
- Add a dedicated Reject failure test and broader accessibility coverage, including focus management and clearer disabled-action explanations.
- Add a filtered-empty message when a loaded list has no rows for the selected filter.
- Replace the demo user switcher with authentication/token-derived session data and enforce authorization on the server as well as in the UI.
