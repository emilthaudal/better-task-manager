import Foundation
import Testing

@testable import BetterTaskManager

private func status(_ id: String, _ name: String, category: String = "indeterminate") -> JiraStatus {
    JiraStatus(id: id, name: name, statusCategory: JiraStatusCategory(id: 2, key: category, name: category))
}

private let todo = status("10", "To Do", category: "new")
private let inProgress = status("20", "In Progress")
private let done = status("30", "Done", category: "done")

/// Each test gets its own file so a leftover queue can't leak between them.
private func temporaryStore() -> OutboxStore {
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("outbox-\(UUID().uuidString)")
        .appendingPathComponent("pending-moves.json")
    return OutboxStore(url: url)
}

/// Records what the outbox asked Jira to do, and can be told to fail.
@MainActor
private final class TransitionRecorder {
    var calls: [(issueKey: String, statusID: String)] = []
    var failure: Error?

    func perform(_ issueKey: String, _ statusID: String) throws {
        calls.append((issueKey, statusID))
        if let failure { throw failure }
    }
}

@Suite("Move outbox")
@MainActor
struct MoveOutboxTests {
    private func makeOutbox(
        store: OutboxStore,
        recorder: TransitionRecorder,
        maxAttempts: Int = 5
    ) -> MoveOutbox {
        MoveOutbox(
            store: store,
            maxAttempts: maxAttempts,
            backoff: { _ in 0 },
            transition: { key, statusID in try recorder.perform(key, statusID) }
        )
    }

    @Test func clearsTheQueueOnceJiraAcceptsTheMove() async {
        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder)
        var outcomes: [String] = []
        outbox.onOutcome = { if case let .succeeded(move) = $0 { outcomes.append(move.issueKey) } }

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        #expect(outbox.pending["AB-1"]?.targetStatus.id == "20")

        await outbox.waitUntilIdle()
        #expect(recorder.calls.map(\.statusID) == ["20"])
        #expect(outbox.pending.isEmpty)
        #expect(outcomes == ["AB-1"])
    }

    /// The drop has to be recorded without waiting on the network, which is the whole
    /// point — enqueue returns before any transition has been attempted.
    @Test func recordsTheMoveBeforeTalkingToJira() {
        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder)

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)

        #expect(outbox.pending["AB-1"] != nil)
        #expect(recorder.calls.isEmpty)
    }

    @Test func ignoresADropBackOntoTheColumnTheCardIsAlreadyIn() {
        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder)

        outbox.enqueue(issueKey: "AB-1", from: todo, to: todo)

        #expect(outbox.pending.isEmpty)
    }

    /// Two drags before the queue is drained cost one write, not two.
    @Test func coalescesRepeatedMovesOfTheSameIssueIntoOneWrite() async {
        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder)

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        outbox.enqueue(issueKey: "AB-1", from: inProgress, to: done)

        #expect(outbox.pending.count == 1)
        #expect(outbox.pending["AB-1"]?.targetStatus.id == "30")
        // Rollback still targets where the card started, not the intermediate column.
        #expect(outbox.pending["AB-1"]?.originalStatus.id == "10")

        await outbox.waitUntilIdle()
        #expect(outbox.pending.isEmpty)
        #expect(recorder.calls.map(\.statusID) == ["30"])
    }

    /// A drop that lands while an earlier write is still open must not be settled by
    /// that write finishing — the queue still owes Jira the newer status.
    @Test func supersedesAnAttemptThatWasInFlightWhenANewDropLanded() async {
        let recorder = TransitionRecorder()
        var outbox: MoveOutbox!
        outbox = MoveOutbox(store: temporaryStore(), backoff: { _ in 0 }) { key, statusID in
            try recorder.perform(key, statusID)
            if statusID == inProgress.id {
                outbox.enqueue(issueKey: "AB-1", from: inProgress, to: done)
            }
        }

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        await outbox.waitUntilIdle()

        #expect(recorder.calls.map(\.statusID) == ["20", "30"])
        #expect(outbox.pending.isEmpty)
    }

    /// Dragging a card out and back while a write is queued should leave nothing behind.
    @Test func cancelsTheQueuedWriteWhenTheCardReturnsToItsOriginalColumn() {
        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder)

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        outbox.enqueue(issueKey: "AB-1", from: inProgress, to: todo)

        #expect(outbox.pending.isEmpty)
    }

    @Test func retriesAndThenRollsBackAfterTheAttemptLimit() async {
        let recorder = TransitionRecorder()
        recorder.failure = APIError(message: "Jira said no")
        let outbox = makeOutbox(store: temporaryStore(), recorder: recorder, maxAttempts: 3)
        var rolledBack: [PendingMove] = []
        var message: String?
        outbox.onOutcome = {
            if case let .rolledBack(move, text) = $0 {
                rolledBack.append(move)
                message = text
            }
        }

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        await outbox.waitUntilIdle()

        #expect(recorder.calls.count == 3)
        #expect(outbox.pending.isEmpty)
        #expect(rolledBack.map(\.issueKey) == ["AB-1"])
        #expect(rolledBack.first?.originalStatus.id == "10")
        #expect(message == "Jira said no")
    }

    @Test func keepsRetryingWhileAttemptsRemain() async {
        let recorder = TransitionRecorder()
        recorder.failure = APIError(message: "offline")
        let store = temporaryStore()
        let outbox = makeOutbox(store: store, recorder: recorder, maxAttempts: 2)

        outbox.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        await outbox.waitUntilIdle()

        #expect(recorder.calls.count == 2)
        #expect(store.load().isEmpty)
    }

    @Test func survivesRelaunchByReloadingTheQueueFromDisk() async {
        let store = temporaryStore()
        let first = TransitionRecorder()
        first.failure = APIError(message: "offline")
        let original = makeOutbox(store: store, recorder: first, maxAttempts: 1)

        original.enqueue(issueKey: "AB-1", from: todo, to: inProgress)
        await original.waitUntilIdle()
        // maxAttempts 1 rolls back immediately, so queue a second move and leave it
        // unattempted to stand in for a write the app died before making.
        store.save([PendingMove(issueKey: "AB-2", targetStatus: done, originalStatus: todo)])

        let second = TransitionRecorder()
        let relaunched = makeOutbox(store: store, recorder: second)
        #expect(relaunched.pending["AB-2"]?.targetStatus.id == "30")

        relaunched.startWorker()
        await relaunched.waitUntilIdle()
        #expect(second.calls.map(\.issueKey) == ["AB-2"])
        #expect(relaunched.pending.isEmpty)
    }

    /// A write that landed just before the app died comes back from the poll already
    /// applied. Jira offers no transition into the status an issue already occupies, so
    /// re-attempting it would surface as a bogus permission failure and roll the card back.
    @Test func treatsAMoveJiraAlreadyAppliedAsDone() async {
        let store = temporaryStore()
        store.save([PendingMove(issueKey: "AB-1", targetStatus: inProgress, originalStatus: todo)])

        let recorder = TransitionRecorder()
        let outbox = makeOutbox(store: store, recorder: recorder)
        outbox.serverStatusID = { _ in "20" }
        var outcomes: [String] = []
        outbox.onOutcome = { if case let .succeeded(move) = $0 { outcomes.append(move.issueKey) } }

        outbox.startWorker()
        await outbox.waitUntilIdle()

        #expect(recorder.calls.isEmpty)
        #expect(outbox.pending.isEmpty)
        #expect(outcomes == ["AB-1"])
    }

    @Test func exponentialBackoffGrowsAndThenCaps() {
        #expect(MoveOutbox.exponentialBackoff(forAttempt: 1) == 1)
        #expect(MoveOutbox.exponentialBackoff(forAttempt: 2) == 2)
        #expect(MoveOutbox.exponentialBackoff(forAttempt: 3) == 4)
        #expect(MoveOutbox.exponentialBackoff(forAttempt: 10) == 30)
    }
}
