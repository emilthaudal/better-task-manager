import AuthenticationServices
import Observation
#if os(macOS)
import AppKit
#else
import UIKit
#endif

@MainActor
@Observable
final class AuthManager: NSObject {
    enum State: Equatable {
        case signedOut
        case authenticating
        case needsSiteSelection
        case signedIn
    }

    private(set) var state: State = .signedOut
    var errorMessage: String?

    private var webAuthSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        if Config.skipAuth {
            state = .signedIn
        } else if KeychainStore.load() != nil {
            state = .authenticating
            Task { await refreshSessionState() }
        }
    }

    func signIn() {
        if Config.skipAuth {
            state = .signedIn
            return
        }

        errorMessage = nil
        state = .authenticating

        var components = URLComponents(url: Config.baseURL.appendingPathComponent("/api/auth/login"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "client", value: "native")]

        let authSession = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: "bettertaskmanager") { [weak self] callbackURL, error in
            Task { @MainActor in
                await self?.handleCallback(callbackURL: callbackURL, error: error)
            }
        }
        authSession.presentationContextProvider = self
        authSession.prefersEphemeralWebBrowserSession = true
        webAuthSession = authSession
        authSession.start()
    }

    private func handleCallback(callbackURL: URL?, error: Error?) async {
        guard
            let callbackURL,
            error == nil,
            let token = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "t" })?.value
        else {
            if let error, (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                errorMessage = "Sign-in failed: \(error.localizedDescription)"
            }
            state = .signedOut
            return
        }

        do {
            let handoff = try await APIClient.shared.exchangeNativeSession(token: token)
            KeychainStore.save(handoff.cookieValue)
            state = handoff.needsSiteSelection ? .needsSiteSelection : .signedIn
        } catch {
            errorMessage = "Sign-in failed: \(error.localizedDescription)"
            state = .signedOut
        }
    }

    func refreshSessionState() async {
        guard KeychainStore.load() != nil else {
            state = .signedOut
            return
        }
        do {
            let me = try await APIClient.shared.fetchMe()
            state = me.cloudId == nil ? .needsSiteSelection : .signedIn
        } catch {
            KeychainStore.clear()
            state = .signedOut
        }
    }

    func selectSite(cloudId: String) async {
        do {
            try await APIClient.shared.selectSite(cloudId: cloudId)
            state = .signedIn
        } catch {
            errorMessage = "Couldn't select that site: \(error.localizedDescription)"
        }
    }

    func signOut() {
        KeychainStore.clear()
        state = .signedOut
        Task { try? await APIClient.shared.logout() }
    }
}

extension AuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #else
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        #endif
    }
}
