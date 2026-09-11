import Foundation
import Testing

@testable import BetterTaskManager

private func issueJSON(key: String, statusID: String, statusName: String, category: String) -> String {
    """
    {
      "id": "id-\(key)", "key": "\(key)",
      "fields": {
        "summary": "\(key) summary",
        "issuetype": {"id": "1", "name": "Task", "subtask": false},
        "status": {"id": "\(statusID)", "name": "\(statusName)", "statusCategory": {"id": 2, "key": "\(category)", "name": "\(category)"}},
        "assignee": null, "subtasks": [], "created": "2026-01-01T00:00:00.000+0000"
      }
    }
    """
}

private func decodeIssues(_ json: [String]) throws -> [JiraIssue] {
    let data = Data("[\(json.joined(separator: ","))]".utf8)
    return try JSONDecoder().decode([JiraIssue].self, from: data)
}

private func temporaryStore() -> OutboxStore {
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("board-vm-\(UUID().uuidString)")
        .appendingPathComponent("pending-moves.json")
    return OutboxStore(url: url)
}

private let todoColumn = BoardColumn(statusId: "10", statusName: "To Do", statusCategory: "new", count: 1)
private let inProgressColumn = BoardColumn(statusId: "20", statusName: "In Progress", statusCategory: "indeterminate", count: 1)

/// The board's status for an issue, as rendered.
@MainActor
private func renderedStatusID(_ viewModel: BoardViewModel, _ key: String) -> String? {
    viewModel.boardData.issuesByKey[key]?.fields.status.id
}

@Suite("Board move reconciliation")
@MainActor
struct BoardMoveReconciliationTests {
    private func makeViewModel(
        transition: @escaping (String, String) async throws -> Void
    ) throws -> BoardViewModel {
        let issues = try decodeIssues([
            issueJSON(key: "AB-1", statusID: "10", statusName: "To Do", category: "new"),
            issueJSON(key: "AB-2", statusID: "20", statusName: "In Progress", category: "indeterminate"),
        ])
        let outbox = MoveOutbox(store: temporaryStore(), backoff: { _ in 0 }, transition: transition)
        return BoardViewModel(outbox: outbox, fetchIssues: { _ in issues })
    }

    /// The bug this guards: the queue entry was dropped the moment Jira accepted the
    /// write, while the cached poll result still reported the old status — so the card
    /// visibly jumped back to its original column until the next 30s poll landed.
    @Test func keepsTheCardInTheTargetColumnAfterJiraAcceptsTheMove() async throws {
        let viewModel = try makeViewModel(transition: { _, _ in })
        await viewModel.load(project: "AB", silent: false)
        #expect(renderedStatusID(viewModel, "AB-1") == "10")

        viewModel.move(issueKey: "AB-1", toEpic: UnassignedEpic.key, to: inProgressColumn)
        #expect(renderedStatusID(viewModel, "AB-1") == "20")

        await viewModel.outbox.waitUntilIdle()
        #expect(viewModel.outbox.pending.isEmpty)
        #expect(renderedStatusID(viewModel, "AB-1") == "20")
    }

    /// A later poll that has caught up must agree, rather than re-applying a stale status.
    @Test func staysPutWhenTheNextPollCatchesUp() async throws {
        let viewModel = try makeViewModel(transition: { _, _ in })
        await viewModel.load(project: "AB", silent: false)

        viewModel.move(issueKey: "AB-1", toEpic: UnassignedEpic.key, to: inProgressColumn)
        await viewModel.outbox.waitUntilIdle()
        #expect(renderedStatusID(viewModel, "AB-1") == "20")

        // The stub fetch still reports To Do, standing in for a poll that raced ahead
        // of Jira's own view; the card must not flap back once the queue is empty.
        await viewModel.load(project: "AB", silent: true)
        #expect(renderedStatusID(viewModel, "AB-1") == "10")
    }

    @Test func returnsTheCardToItsOriginalColumnWhenTheWriteIsGivenUpOn() async throws {
        let viewModel = try makeViewModel(transition: { _, _ in
            throw APIError(message: "Jira said no")
        })
        await viewModel.load(project: "AB", silent: false)

        viewModel.move(issueKey: "AB-1", toEpic: UnassignedEpic.key, to: inProgressColumn)
        #expect(renderedStatusID(viewModel, "AB-1") == "20")

        await viewModel.outbox.waitUntilIdle()
        #expect(renderedStatusID(viewModel, "AB-1") == "10")
        #expect(viewModel.moveError?.contains("AB-1") == true)
    }

    @Test func ignoresADropOntoTheColumnTheCardAlreadyOccupies() async throws {
        let viewModel = try makeViewModel(transition: { _, _ in })
        await viewModel.load(project: "AB", silent: false)

        viewModel.move(issueKey: "AB-1", toEpic: UnassignedEpic.key, to: todoColumn)

        #expect(viewModel.outbox.pending.isEmpty)
        #expect(renderedStatusID(viewModel, "AB-1") == "10")
    }
}
