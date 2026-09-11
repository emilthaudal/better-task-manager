import SwiftUI

struct BoardColumnView: View {
    let column: BoardColumn
    let issues: [JiraIssue]

    /// `reorderable` is only available on a ForEach's dynamic content, so a column
    /// with no cards registers no reorder collection and refuses every drop. One
    /// invisible row keeps the collection alive and gives the drop a target.
    private var rows: [JiraIssue] {
        issues.isEmpty ? [.emptyColumnDropTarget(for: column)] : issues
    }

    var body: some View {
        // Eager: a lazy stack doesn't materialize the view for an item that has been
        // lifted out of it, so the card being dragged renders as nothing.
        VStack(spacing: 8) {
            // Identified by key rather than Jira's internal id so it matches the
            // `itemID` the enclosing reorder container reports back on a drop.
            ForEach(rows, id: \.key) { issue in
                if issue.key == JiraIssue.emptyColumnDropTargetKey {
                    Color.clear
                        .frame(maxWidth: .infinity, minHeight: 72, maxHeight: .infinity)
                        .contentShape(.rect)
                } else {
                    BoardCardView(issue: issue)
                }
            }
            .reorderable(collectionID: column.statusId)
        }
        // Fills the row's height (matching the tallest sibling column) and keeps a
        // faint boxed background even when empty, so the grid stays legible instead
        // of looking like columns "expand" unevenly based on how full they are.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(8)
        .background(.fill.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }
}

private extension JiraIssue {
    static let emptyColumnDropTargetKey = "__empty-column-drop-target__"

    /// Never reaches the board or a mutation: BoardData.canMove rejects any key it
    /// doesn't know, so dragging or dropping this row is a no-op.
    static func emptyColumnDropTarget(for column: BoardColumn) -> JiraIssue {
        JiraIssue(
            id: emptyColumnDropTargetKey,
            key: emptyColumnDropTargetKey,
            fields: Fields(
                summary: "",
                status: JiraStatus(
                    id: column.statusId,
                    name: column.statusName,
                    statusCategory: JiraStatusCategory(id: 0, key: column.statusCategory, name: column.statusCategory)
                ),
                issuetype: JiraIssueType(id: "", name: "", subtask: false),
                assignee: nil,
                parent: nil,
                subtasks: nil,
                created: nil
            )
        )
    }
}
