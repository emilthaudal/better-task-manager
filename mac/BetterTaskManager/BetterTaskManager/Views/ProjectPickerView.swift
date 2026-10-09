import SwiftUI

struct ProjectPickerView: View {
    let onSelect: (JiraProject) -> Void

    @State private var projects: [JiraProject] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Select a project")
                .font(.title2.bold())

            if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if projects.isEmpty {
                Text("No accessible projects found.").foregroundStyle(.secondary)
            } else {
                List(projects) { project in
                    Button {
                        onSelect(project)
                    } label: {
                        HStack {
                            Text(project.key)
                                .font(.system(.body, design: .monospaced).bold())
                            Text(project.name)
                                .foregroundStyle(.secondary)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.plain)
            }
        }
        .padding(24)
        .frame(minWidth: 420, minHeight: 420)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        do {
            projects = try await APIClient.shared.fetchProjects()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
