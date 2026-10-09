import SwiftUI

enum MilestoneTab: String, CaseIterable, Identifiable {
    case criticalPath, blockers, teams, increments, readiness

    var id: Self { self }

    var title: String {
        switch self {
        case .criticalPath: "Critical Path"
        case .blockers: "Blockers"
        case .teams: "Team Load"
        case .increments: "Increments"
        case .readiness: "Ready & Warnings"
        }
    }

    var symbol: String {
        switch self {
        case .criticalPath: "point.topleft.down.to.point.bottomright.curvepath.fill"
        case .blockers: "exclamationmark.octagon"
        case .teams: "chart.bar.xaxis"
        case .increments: "square.stack.3d.up"
        case .readiness: "checklist"
        }
    }
}

struct MilestoneDetailView: View {
    let loaded: LoadedMilestone
    @Binding var tab: MilestoneTab
    @Binding var options: SwimlaneOptions
    let searchText: String

    var body: some View {
        VStack(spacing: 0) {
            MilestoneHeader(detail: loaded.detail, tab: $tab)
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .padding(.bottom, 14)
            Divider()
            Group {
                switch tab {
                case .criticalPath:
                    CriticalPathView(loaded: loaded, options: $options, searchText: searchText)
                        // Fresh zoom, scroll and unfolded lanes per milestone: lane ids are
                        // team names, so another milestone's unfolded lanes would carry over.
                        .id(loaded.detail.release.id)
                case .blockers:
                    BlockerEpicsView(loaded: loaded, searchText: searchText)
                case .teams:
                    TeamLoadView(loaded: loaded)
                case .increments:
                    IncrementsView(loaded: loaded, searchText: searchText)
                case .readiness:
                    ReadinessView(loaded: loaded, searchText: searchText)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .transition(.opacity)
            .id(tab)
        }
        .animation(.smooth(duration: 0.25), value: tab)
        .navigationTitle(loaded.detail.release.name)
        .navigationSubtitle(loaded.detail.project.name)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("View", selection: $tab) {
                    ForEach(MilestoneTab.allCases) { tab in
                        Label(tab.title, systemImage: tab.symbol).tag(tab)
                    }
                }
                .pickerStyle(.segmented)
                .labelStyle(.titleOnly)
                .help("Switch milestone view (⌘1–⌘5)")
            }
            if tab == .criticalPath {
                ToolbarItem(placement: .primaryAction) {
                    SwimlaneOptionsMenu(options: $options)
                }
            }
        }
    }
}

struct SwimlaneOptionsMenu: View {
    @Binding var options: SwimlaneOptions

    var body: some View {
        Menu {
            Picker("Lanes", selection: $options.grouping.animation(.snappy)) {
                Label("Teams", systemImage: "person.2").tag(SwimlaneGrouping.team)
                Label("Epics", systemImage: "square.stack.3d.up").tag(SwimlaneGrouping.epic)
            }
            .pickerStyle(.inline)
            Divider()
            Toggle("Show Done Items", systemImage: "checkmark.circle", isOn: $options.showDone)
            Toggle("Show Work Outside Milestone", systemImage: "arrow.up.forward.square", isOn: $options.showExternal)
        } label: {
            Label("Lanes", systemImage: options.grouping == .team ? "person.2" : "square.stack.3d.up")
        }
        .help("Group lanes by team or epic, and choose which items to show")
    }
}

private struct MilestoneHeader: View {
    let detail: MilestoneDetail
    @Binding var tab: MilestoneTab

    var body: some View {
        let state = detail.release.state
        let remaining = detail.items.filter { !$0.external && !$0.status.isDone }.count
        let percent = Int((detail.progress.fractionDone * 100).rounded())
        HStack(alignment: .center, spacing: 18) {
            ZStack {
                ProgressRing(progress: detail.progress, size: 54, lineWidth: 6)
                Text("\(percent)%")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .contentTransition(.numericText())
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(detail.release.name)
                    .font(.title.weight(.bold))
                    .lineLimit(1)
                HStack(spacing: 8) {
                    Badge(text: releaseStateLabel(state), systemImage: state.symbol, tint: state.tint)
                        .fixedSize()
                    Text("Milestone \(detail.release.sequence + 1) · \(pluralized(detail.increments.count, "increment")) · \(pluralized(detail.teams.count, "team"))")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if let description = detail.release.description, !description.isEmpty {
                    Text(description).font(.callout).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            // The title block claims its width first; the stat tiles shrink, then
            // drop out, as the window narrows — never the other way round.
            .layoutPriority(1)
            Spacer(minLength: 12)
            ViewThatFits(in: .horizontal) {
                tiles(remaining: remaining, compact: false)
                tiles(remaining: remaining, compact: true)
                Color.clear.frame(width: 0, height: 0)
            }
        }
    }

    private func tiles(remaining: Int, compact: Bool) -> some View {
        HStack(spacing: 10) {
            Button { tab = .criticalPath } label: {
                StatTile(title: "Critical path", value: steps(detail.criticalPath.length),
                         detail: compact ? nil : "\(detail.criticalPath.criticalKeys.count) items with no slack",
                         systemImage: "flame.fill", tint: .red)
            }
            .help("The longest chain of remaining work, one step per item")
            StatTile(title: "Remaining", value: "\(remaining)", detail: compact ? nil : "of \(detail.progress.total) items",
                     systemImage: "circle.dashed", tint: .blue)
            Button { tab = .readiness } label: {
                StatTile(title: "Ready now", value: "\(detail.readyNow.count)", detail: compact ? nil : "unblocked, not started",
                         systemImage: "play.circle.fill", tint: .green)
            }
            Button { tab = .readiness } label: {
                StatTile(title: "Warnings", value: "\(detail.warnings.count)", detail: compact ? nil : warningDetail,
                         systemImage: "exclamationmark.triangle.fill", tint: detail.warnings.isEmpty ? .secondary : .orange)
            }
        }
        .buttonStyle(StatTileButtonStyle())
    }

    private var warningDetail: String {
        let severe = detail.warnings.filter(\.kind.isSevere).count
        return severe == 0 ? "nothing severe" : "\(severe) need attention"
    }
}

/// The header tiles that jump to a tab: a hover wash and a press dip, so they read
/// as controls without dressing them up as buttons.
private struct StatTileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        StatTileButton(configuration: configuration)
    }

    private struct StatTileButton: View {
        let configuration: Configuration
        @State private var isHovered = false

        var body: some View {
            configuration.label
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.primary.opacity(configuration.isPressed ? 0.08 : (isHovered ? 0.04 : 0)))
                }
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .onHover { isHovered = $0 }
                .animation(.easeOut(duration: 0.12), value: isHovered)
        }
    }
}
