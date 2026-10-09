import SwiftUI

struct ProjectPickerView: View {
    let onSelect: (JiraProject) -> Void

    @State private var projects: [JiraProject] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        // A ZStack, not a Group: modifiers on a Group apply to each branch, so the
        // .task below would re-run (and loop) every time loading swaps the branch.
        ZStack {
            if isLoading {
                ProgressView("Loading Projects…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Couldn't Load Projects", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Try Again") { Task { await load() } }
                }
            } else if projects.isEmpty {
                ContentUnavailableView("No Projects", systemImage: "rectangle.split.3x1",
                                       description: Text("Your Jira account can't see any projects."))
            } else {
                List(projects) { project in
                    Button {
                        onSelect(project)
                    } label: {
                        HStack(spacing: 12) {
                            Text(project.key.prefix(2))
                                .font(.callout.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(width: 32, height: 32)
                                .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            VStack(alignment: .leading, spacing: 1) {
                                Text(project.name)
                                Text(project.key).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.forward").font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(.vertical, 3)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(project.name), \(project.key)")
                }
                .listStyle(.inset(alternatesRowBackgrounds: true))
            }
        }
        .navigationSubtitle("Choose a project to open its board")
        .frame(minWidth: 420, minHeight: 420)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            projects = try await APIClient.shared.fetchProjects()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
