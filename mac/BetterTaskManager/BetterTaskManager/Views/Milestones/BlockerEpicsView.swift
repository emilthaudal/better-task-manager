import SwiftUI

/// Epics whose remaining work gates other epics, ranked the way the backend ranks
/// them: on the critical path first, then by how many teams and items they hold up.
struct BlockerEpicsView: View {
    let loaded: LoadedMilestone
    let searchText: String

    var body: some View {
        let rows = loaded.detail.blockerEpics.enumerated().filter { _, blocker in
            let epic = loaded.index.epicsByKey[blocker.epicKey]
            return matchesSearch(searchText, blocker.epicKey, epic?.summary, blocker.team, epic?.assignee)
        }
        if loaded.detail.blockerEpics.isEmpty {
            ContentUnavailableView(
                "No epic is blocking another",
                systemImage: "checkmark.seal",
                description: Text("None of the remaining work in this milestone gates an epic outside its own.")
            )
        } else if rows.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    Text("Epics whose unfinished work holds up other epics. Finish their gating items first — or move them to a team with capacity.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .padding(.bottom, 4)
                    ForEach(rows, id: \.element.epicKey) { rank, blocker in
                        BlockerEpicRow(rank: rank + 1, blocker: blocker, loaded: loaded)
                    }
                }
                .padding(24)
                .frame(maxWidth: 1100, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

private struct BlockerEpicRow: View {
    let rank: Int
    let blocker: BlockerEpic
    let loaded: LoadedMilestone

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        let epic = loaded.index.epicsByKey[blocker.epicKey]
        let selected = navigator.inspected == .epic(blocker.epicKey)
        ContentCard {
            HStack(alignment: .top, spacing: 16) {
                Text("\(rank)")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(blocker.onCriticalPath ? Color.red : Color.secondary)
                    .frame(width: 30, height: 30)
                    .background(blocker.onCriticalPath ? AnyShapeStyle(Color.red.opacity(0.12)) : AnyShapeStyle(.fill.tertiary), in: Circle())
                    .accessibilityLabel("Rank \(rank)")

                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(blocker.epicKey).font(.callout.monospaced()).foregroundStyle(.secondary)
                        Text(epic?.summary ?? blocker.epicKey).font(.headline).lineLimit(2)
                        Spacer(minLength: 8)
                        if blocker.onCriticalPath { CriticalBadge() }
                        TeamBadge(team: blocker.team)
                    }

                    HStack(spacing: 22) {
                        metric("\(blocker.remaining)", "remaining", "circle.dashed")
                        metric("\(blocker.downstreamItems)", blocker.downstreamItems == 1 ? "item waiting" : "items waiting", "arrow.turn.down.right")
                        metric("\(blocker.blockedEpics.count)", blocker.blockedEpics.count == 1 ? "epic blocked" : "epics blocked", "square.stack.3d.up.slash")
                        if !blocker.blockedTeams.isEmpty {
                            metric("\(blocker.blockedTeams.count)", blocker.blockedTeams.count == 1 ? "other team" : "other teams", "person.2.slash")
                        }
                        if let epic { ProgressBar(progress: epic.progress).frame(maxWidth: 180) }
                    }

                    Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 8) {
                        GridRow {
                            Text("Blocks").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            FlowLayout {
                                ForEach(blocker.blockedEpics, id: \.self) { key in
                                    MilestoneKeyChip(key: key, index: loaded.index, showTitle: true)
                                }
                                ForEach(blocker.blockedTeams, id: \.self) { TeamBadge(team: $0) }
                            }
                        }
                        if !blocker.gatingItems.isEmpty {
                            GridRow {
                                Text("Unblock first").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                FlowLayout {
                                    ForEach(blocker.gatingItems, id: \.self) { key in
                                        MilestoneKeyChip(key: key, index: loaded.index, showTitle: true)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(selected ? Color.accentColor : Color.primary.opacity(isHovered ? 0.16 : 0), lineWidth: selected ? 2 : 1)
        }
        .onHover { hovering in withAnimation(.easeOut(duration: 0.15)) { isHovered = hovering } }
        .onTapGesture { navigator.inspect(.epic(blocker.epicKey)) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(blocker.epicKey), \(epic?.summary ?? ""), holds up \(pluralized(blocker.downstreamItems, "item"))")
        .accessibilityAction { navigator.inspect(.epic(blocker.epicKey)) }
    }

    private func metric(_ value: String, _ label: String, _ symbol: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol).foregroundStyle(.secondary)
            Text(value).font(.body.weight(.semibold).monospacedDigit())
            Text(label).font(.callout).foregroundStyle(.secondary)
        }
    }
}
