import SwiftUI

struct MilestoneInspector: View {
    let target: InspectorTarget?
    let loaded: LoadedMilestone?

    @Environment(\.jiraSiteURL) private var siteURL
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let target, let loaded {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        switch target {
                        case let .item(key):
                            if let item = loaded.index.itemsByKey[key] { ItemInspector(item: item, loaded: loaded) } else { missing(key) }
                        case let .epic(key):
                            if let epic = loaded.index.epicsByKey[key] { EpicInspector(epic: epic, loaded: loaded) } else { missing(key) }
                        case let .increment(key):
                            if let increment = loaded.index.incrementsByKey[key] { IncrementInspector(increment: increment, loaded: loaded) } else { missing(key) }
                        }
                        Button {
                            openURL(jiraBrowseURL(site: siteURL, key: target.key))
                        } label: {
                            Label("Open \(target.key) in Jira", systemImage: "arrow.up.forward.app")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.glassProminent)
                        .controlSize(.large)
                        .keyboardShortcut("o", modifiers: [.command, .shift])
                        .help("Open in Jira (⇧⌘O)")
                    }
                    .padding(18)
                    .id(target)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(x: 12)))
                }
                .animation(.smooth(duration: 0.25), value: target)
            } else {
                ContentUnavailableView(
                    "Nothing selected",
                    systemImage: "sidebar.right",
                    description: Text("Select an item, epic or increment to see its schedule and dependencies.")
                )
            }
        }
    }

    private func missing(_ key: String) -> some View {
        ContentUnavailableView("\(key) isn't in this milestone", systemImage: "questionmark.square.dashed")
    }
}

private struct InspectorSection<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityAddTraits(.isHeader)
            content
        }
    }
}

private struct InspectorHeader: View {
    let key: String
    let kind: String
    let title: String
    let status: StatusRef

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(kind.uppercased()).font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(.secondary)
                Text(key).font(.callout.monospaced().weight(.medium)).textSelection(.enabled)
                Spacer()
                StatusPill(status: status)
            }
            Text(title)
                .font(.title3.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }
}

private struct KeyList: View {
    let keys: [String]
    let loaded: LoadedMilestone
    var empty = "None"

    var body: some View {
        if keys.isEmpty {
            Text(empty).font(.callout).foregroundStyle(.tertiary)
        } else {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(keys, id: \.self) { key in
                    MilestoneKeyChip(key: key, index: loaded.index, showTitle: true)
                }
            }
        }
    }
}

private struct ItemInspector: View {
    let item: WorkItem
    let loaded: LoadedMilestone

    var body: some View {
        InspectorHeader(key: item.key, kind: item.placeholder ? "Epic (not broken down)" : item.type, title: item.summary, status: item.status)

        FlowLayout(spacing: 6) {
            if item.schedule?.critical == true { CriticalBadge() }
            if item.schedule?.ready == true { Badge(text: "Ready", systemImage: "play.circle.fill", tint: .green) }
            if item.external { Badge(text: "Outside milestone", systemImage: "arrow.up.forward.square") }
            if item.placeholder { Badge(text: "No child items yet", systemImage: "square.dashed", tint: .orange) }
            TeamBadge(team: item.team)
        }

        if let schedule = item.schedule {
            InspectorSection(title: "Schedule") {
                VStack(alignment: .leading, spacing: 10) {
                    Text(scheduleSummary(schedule)).font(.headline)
                    Text(scheduleExplanation(schedule)).font(.callout).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    ScheduleStrip(schedule: schedule, length: loaded.detail.criticalPath.length)
                    Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
                        row("Earliest start", levelTitle(schedule.earliestStart))
                        row("Latest start", levelTitle(schedule.latestStart))
                        row("Slack", steps(schedule.slack))
                        row("Unblocks", pluralized(schedule.downstream, "item"))
                    }
                    .font(.callout)
                    if !schedule.downstreamTeams.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("Other teams waiting on this").font(.caption).foregroundStyle(.secondary)
                            FlowLayout(spacing: 5) {
                                ForEach(schedule.downstreamTeams, id: \.self) { TeamBadge(team: $0) }
                            }
                        }
                    }
                }
            }
        } else if item.status.isDone {
            Label("Done — no longer constrains the plan.", systemImage: "checkmark.circle.fill")
                .font(.callout)
                .foregroundStyle(.green)
        }

        InspectorSection(title: "Blocked by") { KeyList(keys: item.blockedBy, loaded: loaded, empty: "Nothing blocks this") }
        InspectorSection(title: "Blocks") { KeyList(keys: item.blocks, loaded: loaded, empty: "Nothing waits on this") }

        InspectorSection(title: "Details") {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                GridRow {
                    Text("Assignee").foregroundStyle(.secondary)
                    AssigneeLabel(name: item.assignee)
                }
                if let epicKey = item.epicKey {
                    GridRow {
                        Text("Epic").foregroundStyle(.secondary)
                        MilestoneKeyChip(key: epicKey, index: loaded.index, showTitle: true)
                    }
                }
                if let incrementKey = item.incrementKey {
                    GridRow {
                        Text("Increment").foregroundStyle(.secondary)
                        MilestoneKeyChip(key: incrementKey, index: loaded.index, showTitle: true)
                    }
                }
                if let points = item.points {
                    row("Points", points.formatted())
                }
            }
            .font(.callout)
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label).foregroundStyle(.secondary)
            Text(value).monospacedDigit()
        }
    }
}

/// Where the item sits on the milestone's step axis: the solid block is when it can
/// start, the tail is how far it could slip before it delays the finish.
private struct ScheduleStrip: View {
    let schedule: ItemSchedule
    let length: Int

    var body: some View {
        let count = max(length, schedule.latestStart + 1, 1)
        HStack(spacing: 2) {
            ForEach(0..<count, id: \.self) { level in
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(fill(level))
                    .frame(height: 12)
                    .help(levelTitle(level))
            }
        }
        .accessibilityLabel(scheduleSummary(schedule))
    }

    private func fill(_ level: Int) -> AnyShapeStyle {
        if level == schedule.earliestStart {
            return AnyShapeStyle(schedule.critical ? Color.red : Color.accentColor)
        }
        if level > schedule.earliestStart && level <= schedule.latestStart {
            return AnyShapeStyle(Color.accentColor.opacity(0.28))
        }
        return AnyShapeStyle(.quaternary)
    }
}

private struct EpicInspector: View {
    let epic: TeamEpic
    let loaded: LoadedMilestone

    var body: some View {
        let blocker = loaded.detail.blockerEpics.first { $0.epicKey == epic.key }
        InspectorHeader(key: epic.key, kind: "Team epic", title: epic.summary, status: epic.status)
        FlowLayout(spacing: 6) {
            if epic.onCriticalPath { CriticalBadge() }
            TeamBadge(team: epic.team)
        }
        InspectorSection(title: "Progress") {
            VStack(alignment: .leading, spacing: 6) {
                ProgressBar(progress: epic.progress, height: 8)
                Text("\(epic.progress.done) of \(epic.progress.total) done · \(epic.progress.inProgress) in progress")
                    .font(.callout).foregroundStyle(.secondary)
                if let start = epic.earliestStart, let finish = epic.earliestFinish {
                    Text("Remaining work spans \(levelTitle(start)) → \(levelTitle(finish - 1))" + (epic.criticalItems > 0 ? " · \(pluralized(epic.criticalItems, "critical item"))" : ""))
                        .font(.callout)
                }
            }
        }
        if let blocker {
            InspectorSection(title: "Gating work") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(pluralized(blocker.downstreamItems, "item")) elsewhere wait on this epic" + (blocker.blockedTeams.isEmpty ? "." : ", across \(blocker.blockedTeams.joined(separator: ", ")).") )
                        .font(.callout)
                    KeyList(keys: blocker.gatingItems, loaded: loaded)
                }
            }
        }
        InspectorSection(title: "Blocks epics") { KeyList(keys: epic.blocksEpics, loaded: loaded, empty: "No other epic waits on this") }
        InspectorSection(title: "Blocked by epics") { KeyList(keys: epic.blockedByEpics, loaded: loaded, empty: "Not waiting on another epic") }
        InspectorSection(title: "Implements") { KeyList(keys: epic.incrementKeys, loaded: loaded) }
        InspectorSection(title: "Remaining items") {
            KeyList(keys: epic.itemKeys.filter { loaded.index.itemsByKey[$0]?.status.isDone == false }, loaded: loaded, empty: "All done")
        }
    }
}

private struct IncrementInspector: View {
    let increment: Increment
    let loaded: LoadedMilestone

    @Environment(\.jiraSiteURL) private var siteURL
    @Environment(\.openURL) private var openURL

    var body: some View {
        InspectorHeader(key: increment.key, kind: "Increment", title: increment.summary, status: increment.status)
        InspectorSection(title: "Capabilities") {
            VStack(alignment: .leading, spacing: 5) {
                ForEach(increment.capabilities) { capability in
                    Button {
                        openURL(jiraBrowseURL(site: siteURL, key: capability.key))
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "lightbulb").foregroundStyle(.yellow)
                            Text(capability.key).font(.caption.monospaced())
                            Text(capability.summary).font(.callout).lineLimit(2)
                            Image(systemName: "arrow.up.forward").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .help("Open \(capability.key) in Jira Product Discovery")
                }
                if increment.capabilities.isEmpty {
                    Text("Not linked to a capability").font(.callout).foregroundStyle(.tertiary)
                }
            }
        }
        InspectorSection(title: "Progress") {
            VStack(alignment: .leading, spacing: 6) {
                ProgressBar(progress: increment.progress, height: 8)
                Text("\(increment.progress.done) of \(increment.progress.total) items done" + (increment.criticalItems > 0 ? " · \(pluralized(increment.criticalItems, "critical item"))" : ""))
                    .font(.callout).foregroundStyle(.secondary)
            }
        }
        InspectorSection(title: "Team epics") { KeyList(keys: increment.teamEpics.map(\.key), loaded: loaded, empty: "No team epics yet") }
        InspectorSection(title: "Dependencies") {
            let links = incrementLinks(declared: increment.blocks, derived: increment.derivedBlocks).map { ("Blocks", $0) }
                + incrementLinks(declared: increment.blockedBy, derived: increment.derivedBlockedBy).map { ("After", $0) }
            if links.isEmpty {
                Text("None declared or derived").font(.callout).foregroundStyle(.tertiary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(links, id: \.1.key) { direction, link in
                        HStack(spacing: 6) {
                            Text(direction).font(.caption).foregroundStyle(.secondary).frame(width: 40, alignment: .leading)
                            MilestoneKeyChip(key: link.key, index: loaded.index)
                            Image(systemName: link.evidence.symbol).foregroundStyle(link.evidence.tint).help(link.evidence.label)
                        }
                    }
                }
            }
        }
    }
}
