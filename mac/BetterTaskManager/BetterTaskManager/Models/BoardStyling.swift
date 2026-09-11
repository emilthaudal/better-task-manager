import SwiftUI

func statusColor(for category: String) -> Color {
    switch category {
    case "new": return .gray
    case "indeterminate": return .blue
    case "done": return .green
    default: return .gray
    }
}

func issueTypeColor(for name: String) -> Color {
    switch name {
    case "Story": return .green
    case "Bug": return .red
    case "Task", "Subtask": return .blue
    case "Epic": return .purple
    default: return .secondary
    }
}

private let avatarPalette: [Color] = [.blue, .purple, .pink, .orange, .teal, .indigo, .brown, .green]

func avatarColor(for name: String) -> Color {
    let hash = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
    return avatarPalette[hash % avatarPalette.count]
}

func initials(for name: String) -> String {
    let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
    return String(letters).uppercased()
}
