import SwiftUI

enum SidebarItem: Hashable {
    case program
    case milestone(String)
    case team(milestone: String, name: String)
    case boards
    case board(JiraProject)

    var milestoneID: String? {
        switch self {
        case let .milestone(id), let .team(id, _): id
        default: nil
        }
    }

    /// Board projects aren't restorable without a fetch, so only the program and
    /// milestone destinations survive a relaunch.
    var storageValue: String {
        switch self {
        case .program: "program"
        case let .milestone(id): "milestone:\(id)"
        case let .team(id, name): "team:\(id):\(name)"
        case .boards, .board: "boards"
        }
    }

    init?(storageValue: String) {
        let parts = storageValue.split(separator: ":", maxSplits: 2).map(String.init)
        switch parts.first {
        case "program": self = .program
        case "milestone" where parts.count == 2: self = .milestone(parts[1])
        case "team" where parts.count == 3: self = .team(milestone: parts[1], name: parts[2])
        case "boards": self = .boards
        default: return nil
        }
    }
}

/// The signed-in window: delivery program navigation in a sidebar, the selected
/// milestone (or program, or board) as content, and an inspector for whatever is
/// selected inside it.
struct MilestoneRootView: View {
    @State private var store = MilestoneStore()
    @State private var selection: SidebarItem?
    @State private var columnVisibility = NavigationSplitViewVisibility.all
    @SceneStorage("milestoneTab") private var tab: MilestoneTab = .criticalPath
    @SceneStorage("laneGrouping") private var laneGrouping: SwimlaneGrouping = .team
    @SceneStorage("showDoneItems") private var showDone = false
    @SceneStorage("showExternalItems") private var showExternal = true
    @State private var inspected: InspectorTarget?
    @State private var showInspector = false
    @State private var searchText = ""
    @FocusState private var isSearchFocused: Bool
    @State private var reloadToken = 0
    @SceneStorage("sidebarSelection") private var storedSelection = ""
    @AppStorage(Config.DefaultsKey.deliveryProjectKey) private var deliveryProjectSetting = Config.defaultDeliveryProjectKey
    @AppStorage(Config.DefaultsKey.baseURL) private var baseURLSetting = ""

    /// Lane options persist per window as separate scene-storage values; this stitches
    /// them back into the one value the swimlane and its menu edit.
    private var swimlaneOptionsBinding: Binding<SwimlaneOptions> {
        Binding {
            SwimlaneOptions(grouping: laneGrouping, showDone: showDone, showExternal: showExternal)
        } set: { options in
            laneGrouping = options.grouping
            showDone = options.showDone
            showExternal = options.showExternal
        }
    }

    private var commandContext: MilestoneCommandContext {
        // Tabs and lanes only exist on a milestone page, not on its team pages.
        let onMilestone = if case .milestone = selection { true } else { false }
        return MilestoneCommandContext(
            tab: onMilestone ? $tab : nil,
            options: onMilestone ? swimlaneOptionsBinding : nil,
            milestones: store.program?.releases.map { ($0.id, $0.name) } ?? [],
            selectedMilestoneID: selection?.milestoneID,
            isRefreshing: store.isRefreshing,
            show: { selection = $0 },
            refresh: { Task { await store.refresh(milestoneID: selection?.milestoneID) } },
            focusSearch: { isSearchFocused = true }
        )
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            MilestoneSidebar(store: store, selection: $selection)
                .navigationSplitViewColumnWidth(min: 230, ideal: 270, max: 340)
        } detail: {
            detail
                .inspector(isPresented: $showInspector) {
                    MilestoneInspector(target: inspected, loaded: selection?.milestoneID.flatMap { store.milestone($0) })
                        .inspectorColumnWidth(min: 300, ideal: 350, max: 480)
                }
        }
        .searchable(text: $searchText, placement: .toolbar, prompt: "Filter items, epics, people")
        .searchFocused($isSearchFocused)
        .onSubmit(of: .search) { jumpToFirstSearchMatch() }
        .toolbar { toolbarContent }
        .environment(\.milestoneNavigator, navigator)
        .environment(\.jiraSiteURL, store.siteURL)
        .focusedSceneValue(\.milestoneCommands, commandContext)
        .frame(minWidth: 900, minHeight: 600)
        .task(id: PollKey(milestoneID: selection?.milestoneID, token: reloadToken, project: deliveryProjectSetting, server: baseURLSetting)) {
            await store.runPollingLoop(milestoneID: selection?.milestoneID)
        }
        .onAppear {
            // `-BTMSelect milestone:<id>` / `-BTMTab blockers` / `-BTMInspect <key>` launch
            // arguments open the window at a given place — used for UI tests and
            // screenshot runs, where clicking through the sidebar isn't possible.
            let defaults = UserDefaults.standard
            if let launch = defaults.string(forKey: "BTMSelect").flatMap(SidebarItem.init(storageValue:)) {
                selection = launch
            } else if selection == nil {
                selection = SidebarItem(storageValue: storedSelection)
            }
            if let launchTab = defaults.string(forKey: "BTMTab").flatMap(MilestoneTab.init(rawValue:)) { tab = launchTab }
            if let key = defaults.string(forKey: "BTMInspect") {
                inspected = key.hasPrefix("epic:") ? .epic(String(key.dropFirst(5)))
                    : key.hasPrefix("increment:") ? .increment(String(key.dropFirst(10))) : .item(key)
                showInspector = true
            }
            if defaults.bool(forKey: "BTMShowDone") { showDone = true }
            if let appearance = defaults.string(forKey: "BTMAppearance") {
                NSApp.appearance = NSAppearance(named: appearance == "dark" ? .darkAqua : .aqua)
            }
            if let lanes = defaults.string(forKey: "BTMLanes").flatMap(SwimlaneGrouping.init(rawValue:)) { laneGrouping = lanes }
        }
        .onChange(of: selection) { old, new in
            storedSelection = new?.storageValue ?? ""
            if old != nil, old?.milestoneID != new?.milestoneID { inspected = nil }
        }
        .onChange(of: store.program?.releases.map(\.id)) {
            // First launch lands on the next milestone to ship — that's the one being planned.
            guard selection == nil, let program = store.program else { return }
            let next = program.releases.first { !$0.released } ?? program.releases.first
            selection = next.map { .milestone($0.id) } ?? .program
        }
        .onChange(of: deliveryProjectSetting) { _, _ in
            store.reset()
            selection = .program
        }
        .onChange(of: baseURLSetting) { _, _ in store.reset() }
    }

    private struct PollKey: Hashable {
        let milestoneID: String?
        let token: Int
        let project: String
        let server: String
    }

    private var navigator: MilestoneNavigator {
        MilestoneNavigator(
            inspect: { target in
                withAnimation(.smooth) {
                    inspected = target
                    showInspector = true
                }
            },
            select: { target in inspected = target },
            clearSelection: { withAnimation(.smooth) { inspected = nil } },
            showTeam: { name in
                guard let id = selection?.milestoneID else { return }
                selection = .team(milestone: id, name: name)
            },
            showMilestone: { id in selection = .milestone(id) },
            inspected: inspected
        )
    }

    @ViewBuilder
    private var detail: some View {
        switch selection {
        case .program, nil:
            if let program = store.program {
                ProgramOverviewView(program: program, searchText: searchText)
            } else {
                loadingOrError(store.programState, what: "the delivery program")
            }
        case let .milestone(id):
            if let loaded = store.milestone(id) {
                MilestoneDetailView(loaded: loaded, tab: $tab, options: swimlaneOptionsBinding, searchText: searchText)
            } else {
                loadingOrError(store.state(ofMilestone: id), what: milestoneName(id))
            }
        case let .team(id, name):
            if let loaded = store.milestone(id) {
                TeamDetailView(loaded: loaded, teamName: name, searchText: searchText)
            } else {
                loadingOrError(store.state(ofMilestone: id), what: milestoneName(id))
            }
        case .boards:
            ProjectPickerView { selection = .board($0) }
                .navigationTitle("Boards")
        case let .board(project):
            BoardView(project: project) { selection = .boards }
                .id(project.key)
        }
    }

    /// Return in the filter field selects the most important matching card — the
    /// swimlane then scrolls to it — so search works as "go to", not only as a dimmer.
    private func jumpToFirstSearchMatch() {
        guard case let .milestone(id) = selection, tab == .criticalPath, !searchText.isEmpty,
              let loaded = store.milestone(id) else { return }
        let matches = loaded.detail.items.filter { item in
            (item.schedule != nil || showDone) && (showExternal || !item.external)
                && matchesSearch(searchText, item.key, item.summary, item.assignee, item.team, item.epicKey,
                                 item.epicKey.flatMap { loaded.index.epicsByKey[$0]?.summary })
        }
        let best = matches.min { a, b in
            let critA = a.schedule?.critical == true, critB = b.schedule?.critical == true
            if critA != critB { return critA }
            return (a.schedule?.earliestStart ?? .max) < (b.schedule?.earliestStart ?? .max)
        }
        guard let best else { return }
        withAnimation(.smooth) {
            inspected = .item(best.key)
            showInspector = true
        }
    }

    private func milestoneName(_ id: String) -> String {
        store.program?.releases.first { $0.id == id }?.name ?? "the milestone"
    }

    @ViewBuilder
    private func loadingOrError(_ state: LoadState, what: String) -> some View {
        if case let .failed(message) = state {
            ContentUnavailableView {
                Label("Couldn't load \(what)", systemImage: "wifi.exclamationmark")
            } description: {
                Text(message)
                Text("Server: \(Config.baseURL.absoluteString) · Space: \(Config.deliveryProjectKey)")
                    .font(.caption)
            } actions: {
                Button("Try Again") { reloadToken += 1 }
                    .buttonStyle(.glassProminent)
                SettingsLink { Text("Settings…") }
                    .buttonStyle(.glass)
            }
        } else {
            MilestoneSkeleton(title: what)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button {
                Task { await store.refresh(milestoneID: selection?.milestoneID) }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .help("Refresh from Jira (⌘R)")
            .disabled(store.isRefreshing)
            .symbolEffect(.rotate, isActive: store.isRefreshing)
        }
        ToolbarSpacer(.fixed, placement: .primaryAction)
        ToolbarItem(placement: .primaryAction) {
            Button {
                withAnimation(.smooth) { showInspector.toggle() }
            } label: {
                Label("Inspector", systemImage: "sidebar.trailing")
            }
            .keyboardShortcut("i", modifiers: [.command, .option])
            .help("Show or hide the inspector (⌥⌘I)")
        }
    }
}
