import SwiftUI

/// Single source of truth for the board grid's sizing. Every row — column
/// headers, epic bars, card columns — resolves its width through here so they
/// can't drift out of sync with each other the way three separate ad hoc width
/// calculations did.
private struct BoardLayout {
    let columnWidth: CGFloat = 260
    let columnSpacing: CGFloat = 12
    let outerPadding: CGFloat = 16

    func gridWidth(columnCount: Int) -> CGFloat {
        CGFloat(columnCount) * columnWidth + CGFloat(max(columnCount - 1, 0)) * columnSpacing
    }
}

private extension View {
    /// Pins a row to the grid's exact width instead of whatever its parent proposes.
    func boardRowWidth(_ width: CGFloat) -> some View {
        frame(width: width, alignment: .leading)
    }

    /// The shared "bar" treatment for the column-header row and each epic's header —
    /// same fill, padding and corner radius, so neither can visually diverge from
    /// the grid it sits above.
    func boardBar(width: CGFloat) -> some View {
        boardRowWidth(width)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.fill.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }
}

struct BoardView: View {
    let project: JiraProject
    var onChangeProject: () -> Void

    @State private var viewModel = BoardViewModel()
    @State private var retryToken = 0

    private let layout = BoardLayout()

    var body: some View {
        ZStack {
            // One continuous background for the whole window — a second, separately
            // bounded background further down risks a visible seam wherever its
            // bounds don't exactly match the window's.
            boardBackground.ignoresSafeArea()
            content
        }
        .overlay(alignment: .bottom) {
            if let moveError = viewModel.moveError {
                BoardBannerView(message: moveError, onDismiss: viewModel.dismissMoveError)
            }
        }
        .animation(.snappy(duration: 0.25), value: viewModel.moveError)
        .frame(minWidth: 720, minHeight: 520)
        .navigationTitle(project.name)
        .navigationSubtitle(project.key)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Change Project", action: onChangeProject)
            }
        }
        .task(id: "\(project.key)-\(retryToken)") {
            await viewModel.runPollingLoop(project: project.key)
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let errorMessage = viewModel.errorMessage {
            VStack(spacing: 8) {
                Text("Couldn't load the board").font(.headline)
                Text(errorMessage).font(.callout).foregroundStyle(.secondary)
                Button("Retry") { retryToken += 1 }
                    .buttonStyle(.glass)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.boardData.epicGroups.isEmpty {
            Text("No issues to display.")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            board
        }
    }

    private var board: some View {
        // Centers the fixed-width grid using an explicit computed leading inset
        // rather than Spacers — a Spacer inside a scrollable axis is proposed an
        // effectively unbounded width and just collapses to zero instead of
        // centering. Once content overflows the viewport the inset clamps to zero
        // and it scrolls normally from the left edge.
        GeometryReader { proxy in
            let width = layout.gridWidth(columnCount: viewModel.boardData.columns.count)
            let leadingInset = max(0, (proxy.size.width - width - layout.outerPadding * 2) / 2)

            ScrollView([.horizontal, .vertical]) {
                LazyVStack(alignment: .leading, spacing: 12) {
                    columnHeaders(viewModel.boardData.columns, width: width)
                    ForEach(viewModel.boardData.epicGroups) { group in
                        epicSection(group, columns: viewModel.boardData.columns, width: width)
                    }
                }
                .padding(layout.outerPadding)
                .padding(.leading, leadingInset)
            }
        }
        .padding(.horizontal, 20)
    }

    /// A faint top-to-bottom tint over the window gives the glass cards something to
    /// catch — on a perfectly flat fill there's nothing for the material's
    /// highlights/refraction to pick up.
    private var boardBackground: some View {
        LinearGradient(
            colors: [Color.primary.opacity(0.05), .clear, Color.primary.opacity(0.02)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private func columnHeaders(_ columns: [BoardColumn], width: CGFloat) -> some View {
        HStack(spacing: layout.columnSpacing) {
            ForEach(columns) { column in
                HStack(spacing: 6) {
                    Circle().fill(statusColor(for: column.statusCategory)).frame(width: 8, height: 8)
                    Text(column.statusName).font(.system(size: 13, weight: .bold))
                    Text("\(column.count)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(.fill.tertiary, in: Capsule())
                }
                .boardRowWidth(layout.columnWidth)
            }
        }
        .boardBar(width: width)
    }

    private func epicSection(_ group: EpicGroup, columns: [BoardColumn], width: CGFloat) -> some View {
        let isCollapsed = viewModel.collapsedKeys.contains(group.key)

        return VStack(alignment: .leading, spacing: 10) {
            Button {
                viewModel.toggleCollapsed(group.key)
            } label: {
                epicHeaderLabel(group, isCollapsed: isCollapsed)
            }
            .buttonStyle(.plain)
            .boardBar(width: width)

            if !isCollapsed {
                HStack(alignment: .top, spacing: layout.columnSpacing) {
                    ForEach(columns) { column in
                        BoardColumnView(
                            viewModel: viewModel,
                            column: column,
                            issues: group.byStatus[column.statusId] ?? []
                        )
                        .boardRowWidth(layout.columnWidth)
                    }
                }
                .boardRowWidth(width)
                // Scoping the reorder container to one swimlane is what confines a drag
                // to its own epic: an issue's epic comes from its parent link, which a
                // status drop can't change, so a cross-epic drop is never a valid move.
                .reorderContainer(for: JiraIssue.self, itemID: \.key, in: String.self) { difference in
                    moveDroppedCards(difference, epicKey: group.key, columns: columns)
                }
            }
        }
    }

    private func moveDroppedCards(
        _ difference: ReorderDifference<String, String>,
        epicKey: String,
        columns: [BoardColumn]
    ) {
        guard let column = columns.first(where: { $0.statusId == difference.destination.collectionID }) else { return }
        for issueKey in difference.sources {
            Task { await viewModel.move(issueKey: issueKey, toEpic: epicKey, to: column) }
        }
    }

    private func epicHeaderLabel(_ group: EpicGroup, isCollapsed: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "chevron.right")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
                .rotationEffect(.degrees(isCollapsed ? 0 : 90))
            Circle().fill(group.color.accent).frame(width: 8, height: 8)
            if group.key != UnassignedEpic.key {
                Text(group.key)
                    .font(.system(.caption, design: .monospaced).bold())
                    .foregroundStyle(group.color.accent)
            }
            Text(group.summary)
                .font(.system(size: 13, weight: .semibold))
                .strikethrough(group.isDone)
                .foregroundStyle(group.isDone ? .secondary : .primary)
            Spacer()
            Text("\(group.total)")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
    }
}
