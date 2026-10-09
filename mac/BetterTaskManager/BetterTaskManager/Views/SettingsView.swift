import SwiftUI

struct SettingsView: View {
    @AppStorage(Config.DefaultsKey.baseURL) private var baseURL = ""
    @AppStorage(Config.DefaultsKey.deliveryProjectKey) private var deliveryProjectKey = Config.defaultDeliveryProjectKey

    var body: some View {
        Form {
            Section {
                TextField("Server URL", text: $baseURL, prompt: Text(Config.defaultBaseURL.absoluteString))
                    .textContentType(.URL)
                if !baseURL.isEmpty && Config.url(from: baseURL) == nil {
                    Label("Not a valid http(s) URL — using \(Config.defaultBaseURL.absoluteString).", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                }
                if ProcessInfo.processInfo.environment["BTM_BASE_URL"] != nil {
                    Label("BTM_BASE_URL is set for this launch and overrides this setting.", systemImage: "info.circle")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }
            } header: {
                Text("Backend")
            } footer: {
                Text("The Better Task Manager web app that proxies Jira. Using \(Config.baseURL.absoluteString).")
            }

            Section {
                TextField("Delivery space", text: $deliveryProjectKey, prompt: Text(Config.defaultDeliveryProjectKey))
            } header: {
                Text("Delivery program")
            } footer: {
                Text("The Jira space whose releases are the program's milestones and whose epics are increments.")
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
    }
}
