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

    /// Issues with a transition in flight. Their optimistic status has to survive the
    /// poll below until the request resolves, or a refresh landing mid-move snaps the
    /// card back to where it started and then forward again.
    private(set) var pendingKeys: Set<String> = []

    /// Recomputed only when `issues` changes rather than on every access — the
    /// grouping walk runs over every issue and shouldn't repeat on each SwiftUI
    /// layout pass (e.g. every scroll-driven re-render).
    private(set) var boardData = BoardData(columns: [], epicGroups: [], issuesByKey: [:], epicKeyByIssue: [:])

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
        !pendingKeys.contains(issueKey)
            && boardData.canMove(issueKey: issueKey, toEpic: epicKey, toStatus: statusId)
    }

    func move(issueKey: String, toEpic epicKey: String, to column: BoardColumn) async {
        guard canMove(issueKey: issueKey, toEpic: epicKey, toStatus: column.statusId),
              let original = boardData.issuesByKey[issueKey] else { return }

        pendingKeys.insert(issueKey)
        applyStatus(column.optimisticStatus, to: issueKey)

        do {
            try await APIClient.shared.moveIssue(issueKey: issueKey, toStatusId: column.statusId)
        } catch {
            applyStatus(original.fields.status, to: issueKey)
            moveError = error.localizedDescription
        }

        pendingKeys.remove(issueKey)
    }

    private func applyStatus(_ status: JiraStatus, to issueKey: String) {
        guard let index = issues.firstIndex(where: { $0.key == issueKey }) else { return }
        withAnimation(.snappy(duration: 0.28)) {
            issues[index].fields.status = status
            boardData = buildBoardData(from: issues)
        }
    }

    private func load(project: String, silent: Bool) async {
        if !silent {
            isLoading = true
            errorMessage = nil
        }
        do {
            issues = merge(incoming: try await APIClient.shared.fetchBoardIssues(project: project))
            boardData = buildBoardData(from: issues)
            if !silent { errorMessage = nil }
            autoCollapseDoneEpics()
        } catch {
            if !silent { errorMessage = error.localizedDescription }
        }
        if !silent { isLoading = false }
    }

    private func merge(incoming: [JiraIssue]) -> [JiraIssue] {
        guard !pendingKeys.isEmpty else { return incoming }
        return incoming.map { pendingKeys.contains($0.key) ? (boardData.issuesByKey[$0.key] ?? $0) : $0 }
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
