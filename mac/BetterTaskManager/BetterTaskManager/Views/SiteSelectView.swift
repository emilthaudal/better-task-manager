import SwiftUI

struct SiteSelectView: View {
    @Environment(AuthManager.self) private var auth
    @State private var sites: [AtlassianSite] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectingID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Select a Jira site")
                .font(.title2.bold())
            Text("Choose the Jira site you want to work with.")
                .foregroundStyle(.secondary)

            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            } else if sites.isEmpty {
                Text("No accessible Jira sites found.")
                    .foregroundStyle(.secondary)
            } else {
                List(sites) { site in
                    Button {
                        Task {
                            selectingID = site.id
                            await auth.selectSite(cloudId: site.id)
                            selectingID = nil
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(site.name).font(.headline)
                                Text(site.url).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if selectingID == site.id {
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(selectingID != nil)
                }
                .listStyle(.plain)
            }

            Button("Sign out and use a different account") {
                auth.signOut()
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .font(.footnote)
        }
        .padding(24)
        .frame(minWidth: 420, minHeight: 380)
        .task { await loadSites() }
    }

    private func loadSites() async {
        isLoading = true
        do {
            sites = try await APIClient.shared.fetchSites()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
