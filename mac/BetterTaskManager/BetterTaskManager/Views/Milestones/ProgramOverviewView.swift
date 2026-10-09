import SwiftUI

/// The delivery program as a roadmap: each milestone is a stage, in release order,
/// with the increments (capability slices) that ship in it.
struct ProgramOverviewView: View {
    let program: ProgramOverview
    let searchText: String

    var body: some View {
        let lateBlockers = outOfOrderBlockers(in: program)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                hero
                VStack(alignment: .leading, spacing: 0) {
                    if !program.warnings.isEmpty {
                        programWarnings.padding(.bottom, 22)
                    }
                    ForEach(Array(program.releases.enumerated()), id: \.element.id) { index, release in
                        ReleaseStage(
                            release: release,
                            isLast: index == program.releases.count - 1 && program.unscheduled.isEmpty,
                            lateBlockers: lateBlockers,
                            searchText: searchText
                        )
                    }
                    if !program.unscheduled.isEmpty {
                        unscheduled
                    }
                }
                .padding(.horizontal, 28)
                .padding(.top, 22)
                .padding(.bottom, 32)
                .frame(maxWidth: 1180, alignment: .leading)
            }
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Delivery Program")
        .navigationSubtitle(program.project.name)
    }

    private var hero: some View {
        let increments = program.releases.flatMap(\.increments)
        let epics = program.releases.reduce(WorkProgress.empty) { sum, release in
            WorkProgress(done: sum.done + release.epicProgress.done, inProgress: sum.inProgress + release.epicProgress.inProgress,
                         todo: sum.todo + release.epicProgress.todo, total: sum.total + release.epicProgress.total)
        }
        let next = program.releases.first { !$0.released }
        return VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Text(program.project.key)
                    .font(.caption.monospaced().weight(.semibold))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(.fill.tertiary, in: Capsule())
                Text("Delivery program").font(.callout).foregroundStyle(.secondary)
            }
            Text(program.project.name).font(.largeTitle.weight(.bold))
            HStack(spacing: 10) {
                StatTile(title: "Milestones", value: "\(program.releases.count)",
                         detail: "\(program.releases.filter(\.released).count) released", systemImage: "flag.pattern.checkered")
                StatTile(title: "Increments", value: "\(increments.count)",
                         detail: "\(increments.filter { $0.status.isDone }.count) done", systemImage: "square.stack.3d.up")
                StatTile(title: "Team epics", value: "\(epics.total)", detail: "\(epics.done) done", systemImage: "person.2")
                if let next {
                    StatTile(title: "Up next", value: next.name, detail: releaseStateLabel(next.state),
                             systemImage: next.state.symbol, tint: next.state.tint)
                }
            }
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 6)
        .frame(maxWidth: 1180, alignment: .leading)
    }

    private var programWarnings: some View {
        ContentCard {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title: "Program warnings", systemImage: "exclamationmark.triangle.fill", count: program.warnings.count)
                ForEach(Array(program.warnings.enumerated()), id: \.offset) { _, warning in
                    WarningRow(warning: warning, index: nil)
                }
            }
        }
    }

    private var unscheduled: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "Not in a milestone", systemImage: "tray", count: program.unscheduled.count)
            Text("Increments with no fix version — they won't show up in any milestone's plan.")
                .font(.callout)
                .foregroundStyle(.secondary)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12, alignment: .top)], spacing: 12) {
                ForEach(program.unscheduled) { IncrementTile(increment: $0, lateBlockers: []) }
            }
        }
        .padding(.leading, 52)
        .padding(.top, 8)
    }
}

private struct ReleaseStage: View {
    let release: ProgramRelease
    let isLast: Bool
    let lateBlockers: [String: [String]]
    let searchText: String

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        let state = release.state
        let increments = release.increments.filter { inc in
            matchesSearch(searchText, inc.key, inc.summary) || inc.capabilities.contains { matchesSearch(searchText, $0.summary) }
        }
        HStack(alignment: .top, spacing: 18) {
            // Timeline spine: stage marker plus a connector down to the next stage.
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .fill(state == .released ? AnyShapeStyle(Color.green.gradient) : AnyShapeStyle(.background))
                        .overlay(Circle().strokeBorder(state.tint, lineWidth: 2))
                    if state == .released {
                        Image(systemName: "checkmark").font(.callout.weight(.bold)).foregroundStyle(.white)
                    } else {
                        Text("\(release.sequence + 1)").font(.callout.weight(.bold).monospacedDigit()).foregroundStyle(state.tint)
                    }
                }
                .frame(width: 34, height: 34)
                if !isLast {
                    Rectangle()
                        .fill(LinearGradient(colors: [state.tint.opacity(0.5), .secondary.opacity(0.2)], startPoint: .top, endPoint: .bottom))
                        .frame(width: 2)
                        .frame(maxHeight: .infinity)
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(release.name).font(.title2.weight(.semibold))
                    Badge(text: releaseStateLabel(state), systemImage: state.symbol, tint: state.tint)
                    Spacer()
                    Button {
                        navigator.showMilestone(release.id)
                    } label: {
                        Label("Open Milestone", systemImage: "arrow.right")
                            .labelStyle(.titleAndIcon)
                    }
                    .buttonStyle(.glass)
                    .help("Show the critical path for \(release.name)")
                }
                if let description = release.description, !description.isEmpty {
                    Text(description).font(.callout).foregroundStyle(.secondary)
                }
                HStack(spacing: 18) {
                    progressLabel("Increments", release.progress)
                    progressLabel("Team epics", release.epicProgress)
                }
                if release.increments.isEmpty {
                    Text("No increments planned yet.")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                        .padding(.vertical, 6)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12, alignment: .top)], spacing: 12) {
                        ForEach(increments) { IncrementTile(increment: $0, lateBlockers: lateBlockers[$0.key] ?? []) }
                    }
                }
            }
            .padding(.bottom, 30)
        }
        .contentShape(Rectangle())
    }

    private func progressLabel(_ title: String, _ progress: WorkProgress) -> some View {
        HStack(spacing: 8) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ProgressBar(progress: progress).frame(width: 140)
            Text("\(progress.done)/\(progress.total)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
        }
    }
}

private struct IncrementTile: View {
    let increment: IncrementSummary
    let lateBlockers: [String]

    @State private var isHovered = false
    @Environment(\.openURL) private var openURL
    @Environment(\.jiraSiteURL) private var siteURL

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                StatusDot(status: increment.status)
                Text(increment.key).font(.caption.monospaced()).foregroundStyle(.secondary)
                Spacer()
                StatusPill(status: increment.status)
            }
            Text(increment.capabilities.map(\.summary).joined(separator: " + ").nonEmpty ?? increment.summary)
                .font(.headline)
                .lineLimit(2)
            Text(increment.summary).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            HStack(spacing: 10) {
                Label(pluralized(increment.teamEpics.count, "team epic"), systemImage: "person.2")
                let done = increment.teamEpics.filter { $0.status.isDone }.count
                if !increment.teamEpics.isEmpty {
                    Text("\(done) done").foregroundStyle(.secondary)
                }
            }
            .font(.caption)
            .foregroundStyle(increment.teamEpics.isEmpty ? .orange : .primary)
            if !increment.blockedBy.isEmpty || !increment.blocks.isEmpty {
                FlowLayout(spacing: 5) {
                    ForEach(increment.blockedBy, id: \.self) { key in
                        Badge(text: "after \(key)", systemImage: lateBlockers.contains(key) ? "arrow.uturn.backward" : "arrow.left",
                              tint: lateBlockers.contains(key) ? .red : .secondary)
                            .help(lateBlockers.contains(key) ? "\(key) ships in a later milestone (or none) — this increment can't ship on time" : "Blocked by \(key)")
                    }
                    ForEach(increment.blocks, id: \.self) { key in
                        Badge(text: "before \(key)", systemImage: "arrow.right", tint: .secondary)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(lateBlockers.isEmpty ? Color.primary.opacity(isHovered ? 0.2 : 0.08) : Color.red.opacity(0.6), lineWidth: lateBlockers.isEmpty ? 0.75 : 1.5)
        )
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Open \(increment.key) in Jira", systemImage: "arrow.up.forward.app") {
                openURL(jiraBrowseURL(site: siteURL, key: increment.key))
            }
            ForEach(increment.capabilities) { capability in
                Button("Open \(capability.key) in Jira", systemImage: "lightbulb") {
                    openURL(jiraBrowseURL(site: siteURL, key: capability.key))
                }
            }
        }
        .help(increment.capabilities.map { "\($0.key) · \($0.summary)" }.joined(separator: "\n"))
    }
}

extension EnvironmentValues {
    @Entry var jiraSiteURL: URL = MilestoneStore.fallbackSiteURL
}
