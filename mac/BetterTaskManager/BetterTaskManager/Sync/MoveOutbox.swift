import Foundation

enum MoveOutcome {
    case succeeded(issueKey: String)
    case rolledBack(PendingMove, message: String)
}

/// Durable queue of status changes. A drop is recorded here and reported done
/// immediately; the Jira write happens in the background and is retried, so a slow
/// or failing transition never holds up the drag that caused it.
@MainActor
final class MoveOutbox {
    private(set) var pending: [String: PendingMove] = [:]

    var onOutcome: ((MoveOutcome) -> Void)?

    /// The status Jira last reported for an issue, ignoring anything this outbox has
    /// optimistically applied. Set by the owner so a write that landed before the app
    /// died isn't attempted a second time.
    var serverStatusID: ((String) -> String?)?

    private let store: OutboxStore
    private let transition: (String, String) async throws -> Void
    private let maxAttempts: Int
    private let backoff: (Int) -> TimeInterval
    private var worker: Task<Void, Never>?

    init(
        store: OutboxStore,
        maxAttempts: Int = 5,
        backoff: @escaping (Int) -> TimeInterval = MoveOutbox.exponentialBackoff,
        transition: @escaping (String, String) async throws -> Void
    ) {
        self.store = store
        self.maxAttempts = maxAttempts
        self.backoff = backoff
        self.transition = transition
        pending = Dictionary(
            store.load().map { ($0.issueKey, $0) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// 1s, 2s, 4s, 8s … capped so one long outage doesn't push the next try out of the session.
    static func exponentialBackoff(forAttempt attempt: Int) -> TimeInterval {
        min(pow(2, Double(attempt - 1)), 30)
    }

    /// Records a move, collapsing it into whatever is already queued for the same issue.
    func enqueue(issueKey: String, from currentStatus: JiraStatus, to targetStatus: JiraStatus) {
        if var existing = pending[issueKey] {
            // Dragged back where it started: the queued write has nothing left to say.
            if existing.originalStatus.id == targetStatus.id {
                pending[issueKey] = nil
                persist()
                return
            }
            existing.targetStatus = targetStatus
            existing.attempts = 0
            existing.nextAttemptAt = .now
            existing.lastErrorMessage = nil
            pending[issueKey] = existing
        } else {
            guard currentStatus.id != targetStatus.id else { return }
            pending[issueKey] = PendingMove(
                issueKey: issueKey,
                targetStatus: targetStatus,
                originalStatus: currentStatus
            )
        }
        persist()
        startWorker()
    }

    /// Starts draining if anything is queued — call it after a relaunch to resume
    /// moves left over from the previous run.
    func startWorker() {
        guard worker == nil, !pending.isEmpty else { return }
        worker = Task { [weak self] in
            await self?.drain()
        }
    }

    /// Waits for the queue to empty. Everything here is main-actor confined, so a
    /// caller that has just enqueued is guaranteed to await the run that picks it up.
    func waitUntilIdle() async {
        await worker?.value
    }

    private func drain() async {
        while !Task.isCancelled {
            guard let next = pending.values.min(by: { $0.nextAttemptAt < $1.nextAttemptAt }) else { break }
            let wait = next.nextAttemptAt.timeIntervalSinceNow
            if wait > 0 {
                // Sliced rather than one long sleep, so a move queued mid-backoff
                // still gets picked up promptly.
                try? await Task.sleep(for: .seconds(min(wait, 1)))
                continue
            }
            await attempt(next)
        }
        worker = nil
    }

    private func attempt(_ move: PendingMove) async {
        // A write that landed just before the app died comes back from the poll
        // already applied, and Jira offers no transition into the status an issue is
        // already in — so re-attempting it would look like a permission failure.
        if serverStatusID?(move.issueKey) == move.targetStatus.id {
            settle(move.issueKey, .succeeded(issueKey: move.issueKey))
            return
        }

        do {
            try await transition(move.issueKey, move.targetStatus.id)
            guard isCurrent(move) else { return }
            settle(move.issueKey, .succeeded(issueKey: move.issueKey))
        } catch {
            guard isCurrent(move), var current = pending[move.issueKey] else { return }
            current.attempts += 1
            current.lastErrorMessage = error.localizedDescription
            if current.attempts >= maxAttempts {
                settle(move.issueKey, .rolledBack(current, message: error.localizedDescription))
                return
            }
            current.nextAttemptAt = .now.addingTimeInterval(backoff(current.attempts))
            pending[move.issueKey] = current
            persist()
        }
    }

    /// Whether the attempt that just finished still reflects what's queued — a move
    /// enqueued while it was in flight supersedes both its success and its failure.
    private func isCurrent(_ move: PendingMove) -> Bool {
        pending[move.issueKey]?.targetStatus.id == move.targetStatus.id
    }

    private func settle(_ issueKey: String, _ outcome: MoveOutcome) {
        pending[issueKey] = nil
        persist()
        onOutcome?(outcome)
    }

    private func persist() {
        store.save(Array(pending.values))
    }
}
