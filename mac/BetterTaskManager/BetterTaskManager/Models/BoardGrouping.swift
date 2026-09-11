import SwiftUI

enum UnassignedEpic {
    static let key = "__unassigned__"
}

func isBoardable(_ issuetype: JiraIssueType) -> Bool {
    !issuetype.subtask && issuetype.name != "Epic"
}

private struct EpicRef {
    let key: String
    let summary: String
    let isDone: Bool
}

/// Walks the parent chain via each issue's own embedded parent reference — no extra fetch needed.
private func findEpicRef(for issue: JiraIssue, issueMap: [String: JiraIssue]) -> EpicRef? {
    var currentParent = issue.fields.parent
    while let parent = currentParent {
        if parent.fields.issuetype.name == "Epic" {
            return EpicRef(key: parent.key, summary: parent.fields.summary, isDone: parent.fields.status.statusCategory.key == "done")
        }
        currentParent = issueMap[parent.key]?.fields.parent
    }
    return nil
}

private let categoryOrder: [String: Int] = ["new": 0, "indeterminate": 1, "done": 2]

struct BoardColumn: Identifiable, Hashable {
    let statusId: String
    let statusName: String
    let statusCategory: String
    var count: Int

    var id: String { statusId }
}

struct EpicColor: Hashable {
    let accent: Color
}

private let epicPalette: [Color] = [.blue, .purple, .pink, .orange, .teal, .indigo, .brown]
private let unassignedEpicColor = EpicColor(accent: .gray)

struct EpicGroup: Identifiable {
    let key: String
    var summary: String
    var color: EpicColor
    var total: Int
    var byStatus: [String: [JiraIssue]]
    var isDone: Bool

    var id: String { key }
}

struct BoardData {
    let columns: [BoardColumn]
    let epicGroups: [EpicGroup]
    let issuesByKey: [String: JiraIssue]
    let epicKeyByIssue: [String: String]

    /// Whether dropping an issue on a given swimlane's column is a move Jira could make.
    /// An issue's epic comes from its parent link, which a status drop can't change, so a
    /// cross-swimlane drop is never a valid move — the same rule the web board enforces.
    func canMove(issueKey: String, toEpic epicKey: String, toStatus statusId: String) -> Bool {
        guard epicKeyByIssue[issueKey] == epicKey, let issue = issuesByKey[issueKey] else { return false }
        return issue.fields.status.id != statusId
    }
}

/// Mirrors KanbanBoard.tsx's grouping: every status with at least one issue anywhere
/// on the board becomes a shared column, and issues are bucketed into swimlanes by
/// walking each issue's own parent chain up to its epic (or "no epic").
func buildBoardData(from issues: [JiraIssue]) -> BoardData {
    let boardIssues = issues.filter { isBoardable($0.fields.issuetype) }
    let issueMap = Dictionary(boardIssues.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })

    var columnsByStatus: [String: BoardColumn] = [:]
    for issue in boardIssues {
        let status = issue.fields.status
        if columnsByStatus[status.id] != nil {
            columnsByStatus[status.id]!.count += 1
        } else {
            columnsByStatus[status.id] = BoardColumn(
                statusId: status.id,
                statusName: status.name,
                statusCategory: status.statusCategory.key,
                count: 1
            )
        }
    }
    let columns = columnsByStatus.values.sorted { a, b in
        let catDiff = (categoryOrder[a.statusCategory] ?? 1) - (categoryOrder[b.statusCategory] ?? 1)
        if catDiff != 0 { return catDiff < 0 }
        return a.statusName.localizedCaseInsensitiveCompare(b.statusName) == .orderedAscending
    }

    var groups: [String: EpicGroup] = [:]
    var epicKeyByIssue: [String: String] = [:]
    for issue in boardIssues {
        let epicRef = findEpicRef(for: issue, issueMap: issueMap)
        let key = epicRef?.key ?? UnassignedEpic.key
        epicKeyByIssue[issue.key] = key

        if groups[key] == nil {
            groups[key] = EpicGroup(
                key: key,
                summary: epicRef?.summary ?? "No epic",
                color: unassignedEpicColor,
                total: 0,
                byStatus: [:],
                isDone: epicRef?.isDone ?? false
            )
        }
        groups[key]!.total += 1
        groups[key]!.byStatus[issue.fields.status.id, default: []].append(issue)
    }

    // Stable epic accent colors, assigned by summary order.
    let realEpicKeys = groups.keys
        .filter { $0 != UnassignedEpic.key }
        .sorted { groups[$0]!.summary.localizedCaseInsensitiveCompare(groups[$1]!.summary) == .orderedAscending }
    for (index, key) in realEpicKeys.enumerated() {
        groups[key]?.color = EpicColor(accent: epicPalette[index % epicPalette.count])
    }

    var orderedGroups = realEpicKeys.compactMap { groups[$0] }
    if let unassigned = groups[UnassignedEpic.key] {
        orderedGroups.append(unassigned)
    }

    return BoardData(
        columns: columns,
        epicGroups: orderedGroups,
        issuesByKey: issueMap,
        epicKeyByIssue: epicKeyByIssue
    )
}
