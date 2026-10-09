import SwiftUI

/// Transient failure notice for actions that already reverted themselves on screen —
/// the board needs to say what went wrong without a modal interrupting the drag flow.
struct BoardBannerView: View {
    let message: String
    var onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .font(.callout)
                .lineLimit(2)
            Button("Dismiss", systemImage: "xmark", action: onDismiss)
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .glassEffect(.regular, in: .capsule)
        .padding(.bottom, 24)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .task(id: message) {
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            onDismiss()
        }
    }
}
