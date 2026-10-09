import SwiftUI

/// What the menu bar needs from the key window. Published with `focusedSceneValue`
/// so View/Go commands act on whichever milestone window is in front.
struct MilestoneCommandContext {
    /// nil when no milestone is shown — the tab and lane commands disable themselves.
    var tab: Binding<MilestoneTab>?
    var options: Binding<SwimlaneOptions>?
    var milestones: [(id: String, name: String)]
    var selectedMilestoneID: String?
    var isRefreshing: Bool
    var show: (SidebarItem) -> Void
    var refresh: () -> Void
    var focusSearch: () -> Void
}

extension FocusedValues {
    @Entry var milestoneCommands: MilestoneCommandContext?
}

struct MilestoneCommands: Commands {
    @FocusedValue(\.milestoneCommands) private var context

    var body: some Commands {
        CommandGroup(after: .textEditing) {
            Button("Filter…") { context?.focusSearch() }
                .keyboardShortcut("f", modifiers: .command)
                .disabled(context == nil)
        }

        CommandGroup(before: .toolbar) {
            ForEach(Array(MilestoneTab.allCases.enumerated()), id: \.element) { index, tab in
                Toggle(isOn: Binding(
                    get: { context?.tab?.wrappedValue == tab },
                    set: { if $0 { context?.tab?.wrappedValue = tab } }
                )) {
                    Label(tab.title, systemImage: tab.symbol)
                }
                .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
                .disabled(context?.tab == nil)
            }
            Divider()
            Picker("Lanes", selection: Binding(
                get: { context?.options?.wrappedValue.grouping ?? .team },
                set: { context?.options?.wrappedValue.grouping = $0 }
            )) {
                Text("Lanes by Team").tag(SwimlaneGrouping.team)
                Text("Lanes by Epic").tag(SwimlaneGrouping.epic)
            }
            .pickerStyle(.inline)
            .disabled(context?.options == nil)
            Toggle("Show Done Items", isOn: Binding(
                get: { context?.options?.wrappedValue.showDone ?? false },
                set: { context?.options?.wrappedValue.showDone = $0 }
            ))
            .keyboardShortcut("d", modifiers: [.command, .shift])
            .disabled(context?.options == nil)
            Toggle("Show Work Outside Milestone", isOn: Binding(
                get: { context?.options?.wrappedValue.showExternal ?? true },
                set: { context?.options?.wrappedValue.showExternal = $0 }
            ))
            .disabled(context?.options == nil)
            Divider()
            Button("Refresh") { context?.refresh() }
                .keyboardShortcut("r", modifiers: .command)
                .disabled(context == nil || context?.isRefreshing == true)
            Divider()
        }

        CommandMenu("Go") {
            Button("Program Overview") { context?.show(.program) }
                .keyboardShortcut("0", modifiers: [.command, .option])
                .disabled(context == nil)
            Divider()
            if let context {
                ForEach(Array(context.milestones.prefix(9).enumerated()), id: \.element.id) { index, milestone in
                    Button(milestone.name) { context.show(.milestone(milestone.id)) }
                        .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: [.command, .option])
                }
                ForEach(context.milestones.dropFirst(9), id: \.id) { milestone in
                    Button(milestone.name) { context.show(.milestone(milestone.id)) }
                }
            }
            Divider()
            Button("Kanban Boards") { context?.show(.boards) }
                .keyboardShortcut("b", modifiers: [.command, .option])
                .disabled(context == nil)
        }
    }
}

/// Stands in for a milestone while its analysis loads: the shape of the header and
/// a few lanes, redacted, so the window doesn't jump when the real content lands.
struct MilestoneSkeleton: View {
    let title: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        // GeometryReader pins the placeholder lanes to the top-leading corner and lets
        // them run past the edge and clip, instead of their ideal width pushing the
        // header off screen.
        GeometryReader { _ in content }
            .clipped()
            .navigationTitle(title)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Loading \(title)")
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 18) {
                Circle().stroke(.quaternary, lineWidth: 6).frame(width: 54, height: 54)
                VStack(alignment: .leading, spacing: 6) {
                    Text(title).font(.title.weight(.bold))
                    Text("Milestone · 4 increments · 4 teams").font(.callout)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                ForEach(0..<3, id: \.self) { lane in
                    HStack(alignment: .top, spacing: 64) {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(.fill.quaternary)
                            .frame(width: 158, height: 120)
                        ForEach(0..<(4 - lane), id: \.self) { _ in
                            SkeletonCard()
                        }
                    }
                    .padding(.top, 14)
                    .padding(.leading, 6)
                }
            }
            .padding(.top, 40)
            Spacer(minLength: 0)
        }
        .redacted(reason: .placeholder)
        // Scoped to opacity: a repeating withAnimation would also animate the first
        // layout pass, leaving the frame oscillating from zero size.
        .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) { $0.opacity(pulse ? 0.6 : 1) }
        .onAppear { if !reduceMotion { pulse = true } }
    }
}

private struct SkeletonCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("LAD-000").font(.caption.monospaced())
            Text("Placeholder work item title").font(.callout.weight(.medium))
            Spacer(minLength: 0)
            Text("Assignee").font(.caption)
        }
        .padding(10)
        .frame(width: 228, height: 82, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.separator.opacity(0.5), lineWidth: 0.5))
    }
}
