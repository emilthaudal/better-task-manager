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

**Milestone viewer (the primary, read-only experience).** Signed in, `RootView` shows
`MilestoneRootView` (Views/Milestones/): a `NavigationSplitView` whose sidebar lists the delivery
space's releases (= milestones, in release order), the teams of the selected milestone, and a
"Boards" section that leads to the old Kanban flow (`ProjectPickerView` → `BoardView`). Content is
the program roadmap, a milestone (tabs: critical path, blockers, team load, increments, ready &
warnings) or a team page; an `.inspector` shows the selected item/epic/increment. Views reach the
selection/inspector through the `milestoneNavigator` environment value rather than bindings.
- Data: `APIClient.fetchProgram` / `fetchMilestone` hit `/api/jira/milestones[/{versionId}]?project=`;
  `Models/MilestoneModels.swift` mirrors `lib/milestoneTypes.ts` by hand — change both together and
  re-run `MilestoneDecodingTests`. Unknown warning kinds decode as `.other`.
- `MilestoneStore` (ViewModels/) polls every 60s; failures only surface while nothing is loaded —
  afterwards they're kept in `backgroundError` for the sidebar's "Updated x ago" indicator.
  JSON is decoded off the main actor (`APIClient.decodeOffMain`, `@concurrent`) and
  `LoadedMilestone.prepare` builds the key indexes and `DependencyGraph` off-main too. A poll whose
  payload only differs in `generatedAt` (`hasSameContent`) is dropped, so unchanged data never
  invalidates views or rebuilds the swimlane layout. Model/layout types are `nonisolated` (the module
  defaults to MainActor isolation) so they can be built in the background.
- All swimlane geometry (lanes, level columns, card stacking, slack bars, bezier edges) lives in the
  pure `buildSwimlaneLayout` (Models/SwimlaneLayout.swift); scroll/reveal/culling math and
  arrow-key neighbours live in Models/SwimlaneViewport.swift; hover/selection chains come from
  `DependencyGraph`. Keep that math there and unit-tested, not in `CriticalPathView`.
- `CriticalPathView` rendering: the canvas is split into layers (backdrop, slack, edges, cards,
  pinned headers). Scroll state lives in the `@Observable SwimlaneScrollState` so only the pinned
  headers re-render per scroll frame; cards and edges render only inside a tile-snapped cull rect,
  and the edge `Canvas` is sized to that rect (a full-size canvas on a big milestone is a huge
  bitmap). Revealing a card uses `ScrollPosition.scrollTo(point:)` with a computed point — cards sit
  inside a `scaleEffect` and are culled, so id-based `ScrollViewReader` scrolling can't target them.
  Arrow keys / Return / Esc navigate cards (`MilestoneNavigator.select`/`clearSelection`).
  Cells with more than `SwimlaneMetrics.cellLimit` cards fold the least important ones (never
  critical) behind a "N more" pill (`SwimlaneLayout.overflows` / `hiddenLaneByKey`); lanes unfold
  per milestone via `expandedLanes`, and selecting a folded card unfolds its lane first.
- Menu bar: `MilestoneCommands` (View: tabs ⌘1–5, lanes, zoom ⌘0/⌘+/⌘−, refresh ⌘R; Go:
  milestones ⌥⌘1–9; Edit: Filter ⌘F) reads the key window through
  `focusedSceneValue(\.milestoneCommands)` and the swimlane's `\.swimlaneZoom` binding. Tab and
  lane options persist per window with `@SceneStorage`.
- Fixtures in BetterTaskManagerTests/Fixtures: `program-overview.json`/`milestone-detail.json` are
  real LAD responses; the `-multi*` and `-large` ones come from
  `bun mac/scripts/generate-milestone-fixtures.ts`, which runs the backend's own `analyzeMilestone`
  on synthetic input (`-large` is a 323-item six-team stress milestone, release 10145, used by
  `LargeMilestoneTests` for timing). The app icon is rendered by `swift mac/scripts/make-app-icon.swift`.
- Config: server URL and delivery space key are Settings (⌘,) backed by UserDefaults
  (`serverBaseURL`, `deliveryProjectKey`, default `localhost:3000` / `LAD`); `BTM_BASE_URL` and
  `BTM_DELIVERY_PROJECT` env vars override them for a launch. Launch args `-BTMSelect milestone:<id>`,
  `-BTMTab <tab>`, `-BTMInspect <key>`, `-BTMLanes epic`, `-BTMShowDone YES`, `-BTMAppearance dark`
  open the window at a given place for screenshots/UI tests.

**Board view hierarchy:** `BoardView` (reached from the sidebar's Boards section).
`BoardView` owns all board layout math in a private `BoardLayout` struct so column widths can't drift
between the header row, epic bars, and card columns; `BoardColumnView`/`BoardCardView` render
individual cells, `BoardBannerView` surfaces `moveError`.

## Conventions

- No comment blocks or restated types; comments in this codebase explain *why* (a hidden constraint, a
  bug being guarded against), never *what*. Follow the existing style in Sync/ and Models/BoardGrouping.swift
  as the model for when a comment earns its place.
- `@Observable` (Observation framework) view models, not `ObservableObject`/`@Published`.
- Prefer localized `Edit`-style changes; this is a small codebase where most files are under 200 lines.
