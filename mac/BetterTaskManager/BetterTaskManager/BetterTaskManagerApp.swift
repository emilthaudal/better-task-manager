//
//  BetterTaskManagerApp.swift
//  BetterTaskManager
//
//  Created by Emil Thaudal Bønnerup on 11/09/2026.
//

import SwiftUI

@main
struct BetterTaskManagerApp: App {
    @State private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
        }
    }
}
