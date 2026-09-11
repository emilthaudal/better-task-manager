import SwiftUI

struct SignInView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "square.stack.3d.up.fill")
                .font(.system(size: 48))
                .foregroundStyle(.tint)

            Text("Better Task Manager")
                .font(.title2.bold())

            Text("Sign in with your Atlassian account to continue.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if let errorMessage = auth.errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button {
                auth.signIn()
            } label: {
                Text(auth.state == .authenticating ? "Signing in…" : "Sign in with Atlassian")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(auth.state == .authenticating)
        }
        .padding(40)
        .frame(minWidth: 360, minHeight: 320)
    }
}
