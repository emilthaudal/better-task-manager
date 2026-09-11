import SwiftUI

struct RootView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .signedOut, .authenticating:
                SignInView()
            case .needsSiteSelection:
                SiteSelectView()
            case .signedIn:
                SignedInFlowView()
            }
        }
        .animation(.default, value: auth.state)
    }
}

private struct SignedInFlowView: View {
    @State private var selectedProject: JiraProject?

    var body: some View {
        if let selectedProject {
            BoardView(project: selectedProject) { self.selectedProject = nil }
        } else {
            ProjectPickerView { self.selectedProject = $0 }
        }
    }
}
