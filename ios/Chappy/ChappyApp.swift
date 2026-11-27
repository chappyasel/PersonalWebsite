import Observation
import SwiftUI

@main
struct ChappyApp: App {
    init() {
        OwnerToken.importDroppedFile()
        // The room is the slowest page; start it before the first frame.
        SiteBrowser.of(.home).start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Which tab shows, settable from an App Intent.
@MainActor
@Observable
final class AppNavigation {
    static let shared = AppNavigation()

    enum Destination: Hashable {
        case site(SiteTab)
        case weight
    }

    var selection: Destination = .site(.home)

    func showWeight() { selection = .weight }
}

struct RootView: View {
    @State private var navigation = AppNavigation.shared
    /// A link the app was opened with (a widget tap), handed to its tab once.
    @State private var pending: [SiteTab: URL] = [:]

    var body: some View {
        TabView(selection: $navigation.selection) {
            ForEach(SiteTab.allCases) { tab in
                Tab(tab.title, systemImage: tab.symbol, value: AppNavigation.Destination.site(tab)) {
                    SiteWebView(tab: tab, pending: binding(for: tab))
                        .ignoresSafeArea()
                }
            }
            Tab("Weight", systemImage: "scalemass", value: AppNavigation.Destination.weight) {
                WeightLogView()
            }
        }
        .onOpenURL { url in
            if url.scheme == "chappy", url.host == "weight" {
                navigation.showWeight()
                return
            }
            if url.host == "www.chappyasel.com", url.path.hasPrefix("/weight-log/edit") {
                navigation.showWeight()
                return
            }
            guard let tab = SiteTab.owning(url) else { return }
            pending[tab] = url
            navigation.selection = .site(tab)
        }
    }

    private func binding(for tab: SiteTab) -> Binding<URL?> {
        Binding(get: { pending[tab] }, set: { pending[tab] = $0 })
    }
}
