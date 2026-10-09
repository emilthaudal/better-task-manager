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
                MilestoneRootView()
            }
        }
        .animation(.default, value: auth.state)
    }
}
