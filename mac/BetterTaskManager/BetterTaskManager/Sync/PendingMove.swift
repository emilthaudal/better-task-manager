import Foundation

/// A status change the board already shows but Jira hasn't accepted yet.
struct PendingMove: Codable, Identifiable, Equatable {
    let issueKey: String
    var targetStatus: JiraStatus
    /// Where the card sat before the first queued move for this issue, so giving up
    /// rolls back past any intermediate target the user never saw settle.
    let originalStatus: JiraStatus
    var attempts: Int = 0
    var nextAttemptAt: Date = .now
    var lastErrorMessage: String?

    var id: String { issueKey }
}

/// JSON file behind the outbox. Queued moves have to outlive the process, not just
/// the 30s poll, so a relaunch picks up a write the app never got to make.
struct OutboxStore {
    let url: URL

    static func applicationSupport(filename: String = "pending-moves.json") -> OutboxStore {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return OutboxStore(url: base.appendingPathComponent(filename))
    }

    func load() -> [PendingMove] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([PendingMove].self, from: data)) ?? []
    }

    func save(_ moves: [PendingMove]) {
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        guard let data = try? JSONEncoder().encode(moves) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
