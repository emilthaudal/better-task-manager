import SwiftUI

struct ReadinessView: View {
    let loaded: LoadedMilestone
    let searchText: String

    var body: some View {
        let ready = loaded.detail.readyNow.compactMap { loaded.index.itemsByKey[$0] }
            .filter { matchesSearch(searchText, $0.key, $0.summary, $0.assignee, $0.team) }
        let warnings = loaded.detail.warnings.filter { warning in
            matchesSearch(searchText, warning.message, warning.kind.title) || warning.keys.contains { matchesSearch(searchText, $0) }
        }
        ScrollView {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 18) {
                    readySection(ready).frame(minWidth: 460)
                    warningsSection(warnings).frame(minWidth: 360, maxWidth: 520)
                }
                VStack(spacing: 18) {
                    readySection(ready)
                    warningsSection(warnings)
                }
            }
            .padding(24)
        }
    }

    private func readySection(_ items: [WorkItem]) -> some View {
        ContentCard {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title: "Ready now", systemImage: "play.circle.fill", count: items.count)
                Text("Every blocker is done. Critical-path work first, then by how much it unblocks.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if items.isEmpty {
                    Text(searchText.isEmpty ? "Nothing is ready to start." : "No matches.")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                        .padding(.vertical, 8)
                } else {
                    ForEach(items) { WorkItemRow(item: $0, index: loaded.index) }
                }
            }
        }
    }

    private func warningsSection(_ warnings: [MilestoneWarning]) -> some View {
        ContentCard {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(title: "Warnings", systemImage: "exclamationmark.triangle.fill", count: warnings.count)
                if warnings.isEmpty {
                    Label("No warnings — the plan is consistent.", systemImage: "checkmark.seal")
                        .font(.callout)
                        .foregroundStyle(.green)
                } else {
                    ForEach(Array(warnings.enumerated()), id: \.offset) { _, warning in
                        WarningRow(warning: warning, index: loaded.index)
                    }
                }
            }
        }
    }
}

struct WarningRow: View {
    let warning: MilestoneWarning
    let index: MilestoneIndex?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: warning.kind.symbol)
                .font(.title3)
                .foregroundStyle(warning.kind.isSevere ? .red : .orange)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 6) {
                Text(warning.kind.title).font(.subheadline.weight(.semibold))
                Text(warning.message).font(.callout).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if !warning.keys.isEmpty {
                    FlowLayout(spacing: 5) {
                        ForEach(Array(Set(warning.keys)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }, id: \.self) { key in
                            MilestoneKeyChip(key: key, index: index)
                        }
                    }
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background((warning.kind.isSevere ? Color.red : Color.orange).opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
    }
}
