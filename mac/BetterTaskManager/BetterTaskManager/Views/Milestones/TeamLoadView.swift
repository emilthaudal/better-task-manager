import Charts
import SwiftUI

/// Per-team load across the schedule — where one team's work piles up on a level
/// while another's is empty is where work can be redistributed.
struct TeamLoadView: View {
    let loaded: LoadedMilestone

    var body: some View {
        if loaded.detail.teams.isEmpty {
            ContentUnavailableView("No teams yet", systemImage: "person.2.slash",
                                   description: Text("No team epics implement this milestone's increments."))
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline, spacing: 16) {
                        Text("Remaining items per step of the schedule, on one scale so teams compare directly. A tall bar next to an idle team is a candidate to rebalance.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 12)
                        TeamLoadLegend()
                    }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 380), spacing: 16)], spacing: 16) {
                        ForEach(sortedTeams) { team in
                            TeamLoadCard(team: team, length: loaded.detail.criticalPath.length, sharedMaximum: sharedMaximum)
                        }
                    }
                }
                .padding(24)
            }
        }
    }

    private var sharedMaximum: Int {
        max(loaded.detail.teams.flatMap(\.loadByLevel).max() ?? 1, 1)
    }

    private var sortedTeams: [TeamSummary] {
        loaded.detail.teams.sorted { a, b in
            if a.criticalItems != b.criticalItems { return a.criticalItems > b.criticalItems }
            return a.remaining > b.remaining
        }
    }
}

struct TeamLoadCard: View {
    let team: TeamSummary
    let length: Int
    var sharedMaximum: Int?
    var chartHeight: CGFloat = 130

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        ContentCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Circle().fill(teamColor(team.name)).frame(width: 10, height: 10)
                    Text(team.name).font(.headline)
                    Text(pluralized(team.epicKeys.count, "epic")).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    ProgressBar(progress: team.progress).frame(width: 90)
                    Text("\(Int((team.progress.fractionDone * 100).rounded()))%")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                TeamLoadChart(team: team, length: length, maximum: sharedMaximum, showsLegend: false)
                    .frame(height: chartHeight)
                TeamMetricsGrid(team: team)
                if let insight = loadInsight(team) {
                    Label(insight, systemImage: "lightbulb")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.primary.opacity(isHovered ? 0.18 : 0), lineWidth: 1))
        .onHover { isHovered = $0 }
        .onTapGesture { navigator.showTeam(team.name) }
        .help("Show \(team.name)")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { navigator.showTeam(team.name) }
    }
}

struct TeamLoadLegend: View {
    var body: some View {
        HStack(spacing: 14) {
            legendItem("Critical path", .red)
            legendItem("Other work", Color.gray.opacity(0.45))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }

    private func legendItem(_ title: String, _ color: some ShapeStyle) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 10, height: 10)
            Text(title)
        }
    }
}

struct TeamLoadChart: View {
    let team: TeamSummary
    let length: Int
    /// Fixed y-domain top so cards side by side share a scale; nil scales to this team.
    var maximum: Int?
    var showsLegend = true

    private struct Bar: Identifiable {
        let level: Int
        let series: String
        let count: Int
        var id: String { "\(level)-\(series)" }
    }

    var body: some View {
        let bars = (0..<max(length, team.loadByLevel.count)).flatMap { level -> [Bar] in
            let load = level < team.loadByLevel.count ? team.loadByLevel[level] : 0
            let critical = level < team.criticalByLevel.count ? team.criticalByLevel[level] : 0
            return [Bar(level: level, series: "Critical", count: critical),
                    Bar(level: level, series: "Other", count: max(load - critical, 0))]
        }
        let top = maximum ?? max(team.loadByLevel.max() ?? 1, 1)
        Chart(bars) { bar in
            // Short tick labels ("Now", "2", "3"…) stay legible at 15+ steps; the
            // axis title says what the numbers are.
            BarMark(x: .value("Step", bar.level == 0 ? "Now" : "\(bar.level + 1)"), y: .value("Items", bar.count))
                .foregroundStyle(by: .value("Kind", bar.series))
                .cornerRadius(3)
                .accessibilityLabel(levelTitle(bar.level))
                .accessibilityValue("\(pluralized(bar.count, "item")), \(bar.series == "Critical" ? "on the critical path" : "with slack")")
        }
        // Red against neutral grey stays distinguishable for every team colour and
        // for red–green colour blindness; team identity lives in the card header.
        .chartForegroundStyleScale(["Critical": Color.red, "Other": Color.gray.opacity(0.45)])
        .chartLegend(showsLegend ? .visible : .hidden)
        .chartLegend(position: .top, alignment: .trailing)
        .chartYScale(domain: 0...top)
        .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) }
        .chartXAxisLabel("Step", alignment: .center)
        .chartYAxisLabel("Items")
        .accessibilityLabel("\(team.name) remaining items by step")
    }
}

struct TeamMetricsGrid: View {
    let team: TeamSummary

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
            GridRow {
                metric("Remaining", team.remaining, "circle.dashed", .secondary)
                metric("Critical", team.criticalItems, "flame.fill", .red)
                metric("Ready", team.readyNow, "play.circle.fill", .green)
            }
            GridRow {
                metric("Unassigned", team.unassignedRemaining, "person.crop.circle.badge.questionmark", team.unassignedRemaining > 0 ? .orange : .secondary)
                metric("Waiting on others", team.waitingOnOtherTeams, "hourglass", .secondary)
                metric("Blocking others", team.blockingOtherTeams, "hand.raised.fill", team.blockingOtherTeams > 0 ? .red : .secondary)
            }
        }
    }

    private func metric(_ title: String, _ value: Int, _ symbol: String, _ tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).foregroundStyle(tint).frame(width: 16)
            Text("\(value)").font(.callout.weight(.semibold).monospacedDigit())
            Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        .help(help(title))
    }

    private func help(_ title: String) -> String {
        switch title {
        case "Waiting on others": "Remaining items in \(team.name) blocked by another team's remaining work"
        case "Blocking others": "Remaining items in other teams blocked by \(team.name)'s remaining work"
        case "Ready": "Not started and every blocker is done"
        default: title
        }
    }
}

/// One plain-language observation that points at a redistribution decision.
func loadInsight(_ team: TeamSummary) -> String? {
    guard team.remaining > 0, let peak = team.loadByLevel.max(), let peakLevel = team.loadByLevel.firstIndex(of: peak) else { return nil }
    if team.blockingOtherTeams > 0 {
        return "Holds up \(pluralized(team.blockingOtherTeams, "item")) in other teams — its gating work should go first."
    }
    if peak >= 3 && peak * 2 >= team.remaining {
        return "Load peaks at \(levelTitle(peakLevel)) (\(pluralized(peak, "item"))) — consider spreading it."
    }
    if team.unassignedRemaining > 0 && team.criticalItems > 0 {
        return "Has critical work with no assignee."
    }
    return nil
}

/// Sidebar destination for one team within a milestone.
struct TeamDetailView: View {
    let loaded: LoadedMilestone
    let teamName: String
    let searchText: String

    var body: some View {
        if let team = loaded.index.teamsByName[teamName] {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 12) {
                        Circle().fill(teamColor(team.name).gradient).frame(width: 18, height: 18)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(team.name).font(.largeTitle.weight(.bold))
                            Text("\(loaded.detail.release.name) · \(pluralized(team.epicKeys.count, "epic")) · \(team.remaining) remaining")
                                .foregroundStyle(.secondary)
                        }
                    }
                    ContentCard {
                        VStack(alignment: .leading, spacing: 14) {
                            SectionTitle(title: "Load by step", systemImage: "chart.bar.xaxis")
                            TeamLoadChart(team: team, length: loaded.detail.criticalPath.length).frame(height: 200)
                            TeamMetricsGrid(team: team)
                            if let insight = loadInsight(team) {
                                Label(insight, systemImage: "lightbulb").font(.callout).foregroundStyle(.secondary)
                            }
                        }
                    }
                    itemSection("Blocking other teams", "hand.raised.fill", blockingOthers(team))
                    itemSection("Waiting on other teams", "hourglass", waitingOnOthers(team))
                    epicsSection(team)
                    itemSection("Ready now", "play.circle.fill", loaded.detail.readyNow.compactMap { loaded.index.itemsByKey[$0] }.filter { $0.team == team.name })
                }
                .padding(24)
            }
            .navigationTitle(team.name)
            .navigationSubtitle(loaded.detail.release.name)
        } else {
            ContentUnavailableView("Team not in this milestone", systemImage: "person.2.slash")
        }
    }

    private func remaining(_ key: String) -> WorkItem? {
        guard let item = loaded.index.itemsByKey[key], !item.status.isDone else { return nil }
        return item
    }

    private func blockingOthers(_ team: TeamSummary) -> [WorkItem] {
        loaded.detail.items.filter { item in
            item.team == team.name && !item.status.isDone && item.blocks.contains { remaining($0).map { $0.team != team.name } ?? false }
        }
    }

    private func waitingOnOthers(_ team: TeamSummary) -> [WorkItem] {
        loaded.detail.items.filter { item in
            item.team == team.name && !item.status.isDone && item.blockedBy.contains { remaining($0).map { $0.team != team.name } ?? false }
        }
    }

    private func itemSection(_ title: String, _ symbol: String, _ items: [WorkItem]) -> some View {
        let filtered = items.filter { matchesSearch(searchText, $0.key, $0.summary, $0.assignee) }
        return ContentCard {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title: title, systemImage: symbol, count: filtered.count)
                if filtered.isEmpty {
                    Text("None").font(.callout).foregroundStyle(.tertiary)
                } else {
                    ForEach(filtered) { item in WorkItemRow(item: item, index: loaded.index, showTeam: false, crossTeamContext: true) }
                }
            }
        }
    }

    private func epicsSection(_ team: TeamSummary) -> some View {
        let epics = team.epicKeys.compactMap { loaded.index.epicsByKey[$0] }
            .sorted { ($0.onCriticalPath ? 0 : 1, $0.earliestStart ?? .max) < ($1.onCriticalPath ? 0 : 1, $1.earliestStart ?? .max) }
        return ContentCard {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title: "Epics", systemImage: "square.stack.3d.up", count: epics.count)
                ForEach(epics) { epic in EpicRow(epic: epic, index: loaded.index) }
            }
        }
    }
}

struct EpicRow: View {
    let epic: TeamEpic
    let index: MilestoneIndex

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 10) {
            StatusDot(status: epic.status)
            Text(epic.key).font(.callout.monospaced()).foregroundStyle(.secondary)
            Text(epic.summary).lineLimit(1)
            Spacer(minLength: 8)
            if epic.onCriticalPath { Image(systemName: "flame.fill").foregroundStyle(.red).help("On the critical path") }
            if let start = epic.earliestStart, let finish = epic.earliestFinish {
                Text("\(levelTitle(start)) → \(levelTitle(finish - 1))")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .help("Remaining work spans these steps")
            }
            ProgressBar(progress: epic.progress).frame(width: 90)
        }
        .padding(.vertical, 5)
        .padding(.horizontal, 8)
        .background(isHovered ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
        .onTapGesture { navigator.inspect(.epic(epic.key)) }
    }
}

struct WorkItemRow: View {
    let item: WorkItem
    let index: MilestoneIndex
    var showTeam = true
    /// Show which other teams the item is linked to — the point of the cross-team lists.
    var crossTeamContext = false

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        let selected = navigator.inspected == .item(item.key)
        HStack(spacing: 10) {
            Image(systemName: item.schedule?.critical == true ? "flame.fill" : "circle.fill")
                .font(item.schedule?.critical == true ? .callout : .system(size: 6))
                .foregroundStyle(item.schedule?.critical == true ? Color.red : statusTint(item.status.category))
                .frame(width: 16)
            Text(item.key).font(.callout.monospaced()).foregroundStyle(.secondary)
            Text(item.summary).lineLimit(1)
            Spacer(minLength: 8)
            if crossTeamContext {
                let teams = Set((item.blocks + item.blockedBy).compactMap { index.itemsByKey[$0]?.team }.filter { $0 != item.team })
                ForEach(teams.sorted(), id: \.self) { TeamBadge(team: $0) }
            }
            if showTeam { TeamBadge(team: item.team) }
            if let schedule = item.schedule, schedule.downstream > 0 {
                Label("\(schedule.downstream)", systemImage: "arrow.turn.down.right")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .help("Unblocks \(pluralized(schedule.downstream, "item"))")
            }
            AssigneeLabel(name: item.assignee).frame(minWidth: 80, alignment: .trailing)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 8)
        .background(selected ? AnyShapeStyle(Color.accentColor.opacity(0.15)) : isHovered ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(.clear),
                    in: RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
        .onTapGesture { navigator.inspect(.item(item.key)) }
        .help(item.schedule.map(scheduleSummary) ?? item.status.name)
    }
}
