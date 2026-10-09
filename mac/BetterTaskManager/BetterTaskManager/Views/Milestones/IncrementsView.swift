import SwiftUI

/// How a link between two increments is known: declared on the increments in Jira,
/// derived from team-level item links, or both. A mismatch either way is something
/// the program lead should reconcile.
enum IncrementLinkEvidence: Hashable {
    case declaredAndBacked, declaredOnly, derivedOnly

    var label: String {
        switch self {
        case .declaredAndBacked: "Declared & backed"
        case .declaredOnly: "Declared, no team link"
        case .derivedOnly: "Undeclared"
        }
    }

    var symbol: String {
        switch self {
        case .declaredAndBacked: "checkmark.circle.fill"
        case .declaredOnly: "link"
        case .derivedOnly: "link.badge.plus"
        }
    }

    var tint: Color {
        switch self {
        case .declaredAndBacked: .green
        case .declaredOnly: .secondary
        case .derivedOnly: .orange
        }
    }
}

func incrementLinks(declared: [String], derived: [String]) -> [(key: String, evidence: IncrementLinkEvidence)] {
    let keys = (declared + derived).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
    return keys.map { key in
        switch (declared.contains(key), derived.contains(key)) {
        case (true, true): (key, .declaredAndBacked)
        case (true, false): (key, .declaredOnly)
        default: (key, .derivedOnly)
        }
    }
}

struct IncrementsView: View {
    let loaded: LoadedMilestone
    let searchText: String

    var body: some View {
        let increments = loaded.detail.increments.filter { inc in
            matchesSearch(searchText, inc.key, inc.summary) || inc.capabilities.contains { matchesSearch(searchText, $0.key, $0.summary) }
        }
        if loaded.detail.increments.isEmpty {
            ContentUnavailableView("No increments", systemImage: "square.stack.3d.up.slash",
                                   description: Text("No delivery epics have this milestone as their fix version."))
        } else if increments.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 420), spacing: 14, alignment: .top)], spacing: 14) {
                    ForEach(increments) { increment in
                        IncrementDetailCard(increment: increment, loaded: loaded)
                    }
                }
                .padding(24)
            }
        }
    }
}

private struct IncrementDetailCard: View {
    let increment: Increment
    let loaded: LoadedMilestone

    @Environment(\.milestoneNavigator) private var navigator

    var body: some View {
        let selected = navigator.inspected == .increment(increment.key)
        ContentCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(increment.key).font(.callout.monospaced()).foregroundStyle(.secondary)
                    Spacer()
                    if increment.criticalItems > 0 {
                        Badge(text: "\(increment.criticalItems) critical", systemImage: "flame.fill", tint: .red)
                    }
                    StatusPill(status: increment.status)
                }
                Text(increment.capabilities.map(\.summary).joined(separator: " + ").nonEmpty ?? increment.summary)
                    .font(.title3.weight(.semibold))
                Text(increment.summary).font(.callout).foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    ProgressBar(progress: increment.progress)
                    Text("\(increment.progress.done)/\(increment.progress.total)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    if let finish = increment.earliestFinish {
                        Text("· done after \(steps(finish))").font(.caption).foregroundStyle(.secondary)
                            .help("If every team works the plan, its last remaining item finishes at this step")
                    }
                }

                if !increment.teamEpics.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Team epics").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        FlowLayout {
                            ForEach(increment.teamEpics) { epic in
                                MilestoneKeyChip(key: epic.key, index: loaded.index, showTitle: true)
                            }
                        }
                    }
                } else {
                    Label("No team epics implement this yet", systemImage: "person.2.slash")
                        .font(.callout)
                        .foregroundStyle(.orange)
                }

                let blocks = incrementLinks(declared: increment.blocks, derived: increment.derivedBlocks)
                let blockedBy = incrementLinks(declared: increment.blockedBy, derived: increment.derivedBlockedBy)
                if !blocks.isEmpty || !blockedBy.isEmpty {
                    Divider()
                    Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 6) {
                        linkRows("Blocks", blocks)
                        linkRows("Blocked by", blockedBy)
                    }
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(selected ? Color.accentColor : .clear, lineWidth: 2))
        .onTapGesture { navigator.inspect(.increment(increment.key)) }
    }

    @ViewBuilder
    private func linkRows(_ title: String, _ links: [(key: String, evidence: IncrementLinkEvidence)]) -> some View {
        ForEach(Array(links.enumerated()), id: \.element.key) { offset, link in
            GridRow {
                Text(offset == 0 ? title : "").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                MilestoneKeyChip(key: link.key, index: loaded.index, showTitle: true)
                Label(link.evidence.label, systemImage: link.evidence.symbol)
                    .font(.caption)
                    .foregroundStyle(link.evidence.tint)
                    .help(link.evidence == .declaredAndBacked ? "Declared on the increments and backed by team-level blocking links"
                          : link.evidence == .declaredOnly ? "Declared on the increments, but no team-level link backs it"
                          : "Team-level links create this dependency, but the increments don't declare it")
            }
        }
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
