import SwiftUI

struct MilestoneSidebar: View {
    let store: MilestoneStore
    @Binding var selection: SidebarItem?

    var body: some View {
        List(selection: $selection) {
            Section {
                NavigationLink(value: SidebarItem.program) {
                    Label {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Program Overview")
                            if let program = store.program {
                                Text(program.project.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                    } icon: {
                        Image(systemName: "map")
                    }
                }
            }

            Section("Milestones") {
                if let program = store.program {
                    ForEach(program.releases) { release in
                        NavigationLink(value: SidebarItem.milestone(release.id)) {
                            MilestoneSidebarRow(release: release, loaded: store.milestone(release.id))
                        }
                    }
                    if program.releases.isEmpty {
                        Text("No releases in \(program.project.key)").foregroundStyle(.secondary)
                    }
                } else if case .failed = store.programState {
                    Label("Unavailable", systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
                } else {
                    ProgressView().controlSize(.small).frame(maxWidth: .infinity)
                }
            }

            if let milestoneID = selection?.milestoneID, let loaded = store.milestone(milestoneID), !loaded.detail.teams.isEmpty {
                Section("Teams · \(loaded.detail.release.name)") {
                    ForEach(loaded.detail.teams) { team in
                        NavigationLink(value: SidebarItem.team(milestone: milestoneID, name: team.name)) {
                            TeamSidebarRow(team: team)
                        }
                    }
                }
            }

            Section("Boards") {
                NavigationLink(value: SidebarItem.boards) {
                    Label("Kanban Boards", systemImage: "rectangle.split.3x1")
                }
                if case let .board(project) = selection {
                    NavigationLink(value: SidebarItem.board(project)) {
                        Label(project.name, systemImage: "square.grid.3x1.below.line.grid.1x2")
                    }
                }
            }
        }
        .listStyle(.sidebar)
        .animation(.smooth, value: selection?.milestoneID)
        .safeAreaInset(edge: .bottom) {
            RefreshStatus(store: store)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
        }
    }
}

private struct MilestoneSidebarRow: View {
    let release: ProgramRelease
    let loaded: LoadedMilestone?

    var body: some View {
        let state = release.state
        // Item-level progress once the milestone is loaded; until then the team-epic
        // rollup from the overview is the best available signal.
        let progress = loaded?.detail.progress ?? release.epicProgress
        HStack(spacing: 10) {
            ZStack {
                ProgressRing(progress: progress, size: 26, lineWidth: 3, tint: state == .overdue ? .orange : .green)
                Text("\(release.sequence + 1)")
                    .font(.system(size: 10, weight: .bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(release.name).lineLimit(1)
                HStack(spacing: 4) {
                    if state == .overdue || state == .released {
                        Image(systemName: state.symbol).foregroundStyle(state.tint)
                    }
                    Text(releaseStateLabel(state))
                    if !release.increments.isEmpty {
                        Text("· \(pluralized(release.increments.count, "increment"))")
                    }
                }
                .font(.caption)
                .foregroundStyle(state == .overdue ? Color.red : Color.secondary)
            }
            Spacer(minLength: 0)
            if let loaded, !loaded.detail.warnings.isEmpty {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .help(pluralized(loaded.detail.warnings.count, "warning"))
            }
        }
        .padding(.vertical, 2)
        .help("\(release.name) — \(Int((progress.fractionDone * 100).rounded()))% done")
    }
}

private struct TeamSidebarRow: View {
    let team: TeamSummary

    var body: some View {
        Label {
            HStack(spacing: 6) {
                Text(team.name).lineLimit(1)
                Spacer(minLength: 4)
                if team.criticalItems > 0 {
                    Image(systemName: "flame.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .help("\(pluralized(team.criticalItems, "item")) on the critical path")
                }
                Text("\(team.remaining)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .help("\(team.remaining) remaining")
            }
        } icon: {
            Image(systemName: "person.2.fill").foregroundStyle(teamColor(team.name))
        }
    }
}

/// "Updated 2 min ago", re-rendered on a slow timer — it only needs minute precision.
private struct RefreshStatus: View {
    let store: MilestoneStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 20)) { context in
            HStack(spacing: 6) {
                if store.isRefreshing {
                    ProgressView().controlSize(.mini)
                    Text("Updating…")
                } else if let error = store.backgroundError {
                    Image(systemName: "exclamationmark.icloud").foregroundStyle(.orange)
                    Text(updatedText(now: context.date))
                        .help("Last refresh failed: \(error). Showing the previous data.")
                } else if store.lastUpdated != nil {
                    Image(systemName: "checkmark.icloud").foregroundStyle(.secondary)
                    Text(updatedText(now: context.date))
                }
                Spacer(minLength: 0)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .animation(.smooth, value: store.isRefreshing)
        }
    }

    private func updatedText(now: Date) -> String {
        guard let last = store.lastUpdated else { return "Not updated yet" }
        if now.timeIntervalSince(last) < 45 { return "Updated just now" }
        return "Updated \(last.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)))"
    }
}
