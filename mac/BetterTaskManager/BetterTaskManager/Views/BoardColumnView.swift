import SwiftUI

struct BoardColumnView: View {
    let viewModel: BoardViewModel
    let column: BoardColumn
    let issues: [JiraIssue]

    var body: some View {
        // Eager: a lazy stack doesn't materialize the view for an item that has been
        // lifted out of it, so the card being dragged renders as nothing.
        VStack(spacing: 8) {
            // Identified by key rather than Jira's internal id so it matches the
            // `itemID` the enclosing reorder container reports back on a drop.
            ForEach(issues, id: \.key) { issue in
                BoardCardView(issue: issue, isPending: viewModel.pendingKeys.contains(issue.key))
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
