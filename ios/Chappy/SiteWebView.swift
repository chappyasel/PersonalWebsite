import SwiftUI

/// Shows one tab's `SiteBrowser`. The browser outlives this view, so a tab
/// SwiftUI rebuilds keeps its page.
struct SiteWebView: UIViewRepresentable {
    let tab: SiteTab
    @Binding var pending: URL?

    func makeUIView(context: Context) -> BrowserView {
        let browser = SiteBrowser.of(tab)
        if let pending {
            browser.load(pending)
            DispatchQueue.main.async { self.pending = nil }
        } else {
            browser.start()
        }
        return browser.view
    }

    func updateUIView(_ view: BrowserView, context: Context) {
        guard let url = pending else { return }
        SiteBrowser.of(tab).load(url)
        DispatchQueue.main.async { pending = nil }
    }
}
