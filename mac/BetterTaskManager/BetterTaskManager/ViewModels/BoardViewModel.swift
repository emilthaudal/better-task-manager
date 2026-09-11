import Observation
import SwiftUI

@MainActor
@Observable
final class BoardViewModel {
    private(set) var issues: [JiraIssue] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var moveError: String?

    private(set) var collapsedKeys: Set<String> = []
    private var userToggledKeys: Set<String> = []

    /// Recomputed only when `issues` changes rather than on every access — the
    /// grouping walk runs over every issue and shouldn't repeat on each SwiftUI
    /// layout pass (e.g. every scroll-driven re-render).
    private(set) var boardData = BoardData(columns: [], epicGroups: [], issuesByKey: [:], epicKeyByIssue: [:])

    /// The last poll result, untouched by queued moves. `issues` is this with the
    /// outbox overlaid, which makes a rollback nothing more than dropping the queue
    /// entry — there's no saved-original bookkeeping to get out of step.
    private var serverIssues: [JiraIssue] = []

    let outbox: MoveOutbox

    init(outbox: MoveOutbox? = nil) {
        self.outbox = outbox ?? MoveOutbox(store: .applicationSupport()) { issueKey, statusID in
            try await APIClient.shared.moveIssue(issueKey: issueKey, toStatusId: statusID)
        }

        self.outbox.serverStatusID = { [weak self] key in
            self?.serverIssues.first { $0.key == key }?.fields.status.id
        }
        self.outbox.onOutcome = { [weak self] outcome in
            guard let self else { return }
            if case let .rolledBack(move, message) = outcome {
                moveError = "Couldn't move \(move.issueKey) to \(move.targetStatus.name): \(message)"
            }
            rederive()
        }
    }

    /// Runs until the enclosing `.task` is cancelled (the view disappearing, or a
    /// retry restarting it under a new task id) — mirrors the web app's 30s poll,
    /// refreshing silently in the background once the first load has succeeded.
    func runPollingLoop(project: String) async {
        var isFirstLoad = true
        while !Task.isCancelled {
            await load(project: project, silent: !isFirstLoad)
            isFirstLoad = false
            guard !Task.isCancelled else { return }
            try? await Task.sleep(for: .seconds(30))
        }
    }

    func toggleCollapsed(_ key: String) {
        userToggledKeys.insert(key)
        if collapsedKeys.contains(key) {
            collapsedKeys.remove(key)
        } else {
            collapsedKeys.insert(key)
        }
    }

    func dismissMoveError() {
        moveError = nil
    }

    func canMove(issueKey: String, toEpic epicKey: String, toStatus statusId: String) -> Bool {
        boardData.canMove(issueKey: issueKey, toEpic: epicKey, toStatus: statusId)
    }

    /// Returns as soon as the board reflects the drop. The Jira write is queued and
    /// reconciled in the background, so a second drag of the same card doesn't have
    /// to wait for the first one's round trip.
    func move(issueKey: String, toEpic epicKey: String, to column: BoardColumn) {
        guard canMove(issueKey: issueKey, toEpic: epicKey, toStatus: column.statusId),
              let onScreen = boardData.issuesByKey[issueKey] else { return }

        outbox.enqueue(
            issueKey: issueKey,
            from: onScreen.fields.status,
            to: column.optimisticStatus
        )
        rederive()
    }

    private func rederive() {
        withAnimation(.snappy(duration: 0.28)) {
            issues = serverIssues.map { issue in
                guard let move = outbox.pending[issue.key] else { return issue }
                var overlaid = issue
                overlaid.fields.status = move.targetStatus
                return overlaid
            }
            boardData = buildBoardData(from: issues)
        }
    }

    private func load(project: String, silent: Bool) async {
        if !silent {
            isLoading = true
            errorMessage = nil
        }
        do {
            serverIssues = try await APIClient.shared.fetchBoardIssues(project: project)
            rederive()
            // Only now can the outbox tell a move Jira already applied from one it
            // never received, so a queue restored from disk waits for this first poll
            // rather than re-transitioning a write that had already landed.
            outbox.startWorker()
            if !silent { errorMessage = nil }
            autoCollapseDoneEpics()
        } catch {
            if !silent { errorMessage = error.localizedDescription }
        }
        if !silent { isLoading = false }
    }

    /// Done epics start collapsed so finished work doesn't crowd the board — once a
    /// user explicitly toggles one, its done-ness no longer drives the collapsed state.
    private func autoCollapseDoneEpics() {
        for group in boardData.epicGroups where group.isDone && !userToggledKeys.contains(group.key) {
            collapsedKeys.insert(group.key)
        }
    }
}

private extension BoardColumn {
    /// Stands in until the next poll returns Jira's own status for the issue — only
    /// `key` drives anything on the board, so the placeholder category id never shows.
    var optimisticStatus: JiraStatus {
        JiraStatus(
            id: statusId,
            name: statusName,
            statusCategory: JiraStatusCategory(id: 0, key: statusCategory, name: statusCategory)
        )
    }
}
