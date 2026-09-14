# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the macOS/iOS native SwiftUI client for Better Task Manager. It talks to the sibling Next.js
web app (repo root, one level up) as its backend — the web app owns the Jira/Atlassian OAuth flow and
proxies all Jira API calls; this app never talks to Atlassian directly.

## Build & Test

Scheme: `BetterTaskManager`. No `.xcscheme` is checked in — Xcode autogenerates one on first open, and
`xcodebuild -list` / `-scheme BetterTaskManager` work once it has.

```bash
# Build
xcodebuild build -scheme BetterTaskManager -destination 'platform=macOS'

# Run all unit tests
xcodebuild test -scheme BetterTaskManager -destination 'platform=macOS' -only-testing:BetterTaskManagerTests

# Run a single test (Swift Testing suite/test names, not XCTest method syntax)
xcodebuild test -scheme BetterTaskManager -destination 'platform=macOS' \
  -only-testing:BetterTaskManagerTests/MoveOutboxTests/exponentialBackoffGrowsAndThenCaps

# UI tests (XCTest, not Swift Testing)
xcodebuild test -scheme BetterTaskManager -destination 'platform=macOS' -only-testing:BetterTaskManagerUITests
```

`BetterTaskManagerTests` uses the **Swift Testing** framework (`import Testing`, `@Suite`, `@Test`,
`#expect`) — not XCTest. `BetterTaskManagerUITests` is plain XCTest.

## Architecture

**Data flow is one-directional through a single view model.** `BoardViewModel` (ViewModels/) polls
`APIClient.fetchBoardIssues` every 30s (`runPollingLoop`), keeps the raw poll result in `serverIssues`,
and overlays any queued-but-unconfirmed moves from `MoveOutbox` on top to produce the `issues` the UI
actually renders. `boardData` (grouped/columned form, see below) is only recomputed when `issues`
changes, not on every SwiftUI layout pass.

**Optimistic drag-and-drop via a durable outbox** (Sync/MoveOutbox.swift, Sync/PendingMove.swift):
a drop is applied to the rendered board and queued immediately; the actual Jira transition happens in
the background with retry + exponential backoff (capped at 30s, 5 attempts). The queue is persisted to
`Application Support/pending-moves.json` so it survives a relaunch. Reconciling a background success
against a poll that hasn't caught up yet, and telling "Jira already applied this" apart from "this
write needs to be sent," are both subtle — read the doc comments in `MoveOutbox` and
`BoardViewModel.applyOutboxOverlay`/`onOutcome` before touching this path, and run
`BoardMoveReconciliationTests` / `MoveOutboxTests` after any change here.

**Board grouping mirrors the web app.** `buildBoardData` (Models/BoardGrouping.swift) turns a flat
issue list into columns (one per distinct status found on the board, ordered new → indeterminate →
done, with "parked" statuses like Blocked/On Hold/Waiting sorted after in-progress) and epic swimlanes
(resolved by walking each issue's own embedded `parent` chain — no extra fetch). This logic is a
deliberate port of `KanbanBoard.tsx` in the web app; if the grouping/ordering rules change, they need
to change in both places. Cross-epic drops are rejected because an issue's epic comes from its parent
link, which a status-only Jira transition can't change.

**Auth is a home-rolled session cookie, not a shared cookie jar.** `AuthManager` (Auth/) drives an
`ASWebAuthenticationSession` against the web app's `/api/auth/login`, and `APIClient` uses
`URLSession(configuration: .ephemeral)` — there is no browser cookie store backing it. The resulting
`btm_session` value is stored in Keychain (`Auth/KeychainStore.swift`) and manually attached as a
`Cookie` header on every request; `APIClient.captureRotatedCookie` re-persists it if the server rotates
it via `Set-Cookie` on any response. `Config.skipAuth` mirrors the web app's `JIRA_BYPASS=true` local
dev mode and short-circuits straight to `.signedIn` with no OAuth round trip at all — check this flag
before assuming a real session exists.

**View hierarchy:** `RootView` switches on `AuthManager.state` (signedOut/authenticating →
`SignInView`, needsSiteSelection → `SiteSelectView`, signedIn → project picker → `BoardView`).
`BoardView` owns all board layout math in a private `BoardLayout` struct so column widths can't drift
between the header row, epic bars, and card columns; `BoardColumnView`/`BoardCardView` render
individual cells, `BoardBannerView` surfaces `moveError`.

## Conventions

- No comment blocks or restated types; comments in this codebase explain *why* (a hidden constraint, a
  bug being guarded against), never *what*. Follow the existing style in Sync/ and Models/BoardGrouping.swift
  as the model for when a comment earns its place.
- `@Observable` (Observation framework) view models, not `ObservableObject`/`@Published`.
- Prefer localized `Edit`-style changes; this is a small codebase where most files are under 200 lines.
