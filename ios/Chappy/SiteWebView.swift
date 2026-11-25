import SafariServices
import SwiftUI
import WebKit

/// One tab's browser. Stays on the site's hosts and sends every other link
/// to an in-app Safari sheet.
struct SiteWebView: UIViewRepresentable {
    let root: URL
    @Binding var pending: URL?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "ChappyApp/1"
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.reload(_:)),
                          for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        context.coordinator.webView = webView
        webView.load(URLRequest(url: pending ?? root))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let url = pending else { return }
        if webView.url != url { webView.load(URLRequest(url: url)) }
        DispatchQueue.main.async { pending = nil }
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate,
        SFSafariViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
        weak var webView: WKWebView?

        @objc func reload(_ sender: UIRefreshControl) {
            webView?.reload()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor action: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            let scheme = url.scheme?.lowercased()
            if scheme == "mailto" || scheme == "tel" || scheme == "sms" {
                await UIApplication.shared.open(url)
                return .cancel
            }
            let isSite = url.host.map { SiteTab.isSiteHost($0.lowercased()) } ?? true
            if isSite || action.targetFrame?.isMainFrame == false { return .allow }
            present(url)
            return .cancel
        }

        /// target=_blank links arrive here; open them in this view or Safari.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url {
                if let host = url.host, SiteTab.isSiteHost(host.lowercased()) {
                    webView.load(URLRequest(url: url))
                } else {
                    present(url)
                }
            }
            return nil
        }

        private func present(_ url: URL) {
            guard url.scheme == "https" || url.scheme == "http",
                  let presenter = webView?.window?.rootViewController else { return }
            var top = presenter
            while let next = top.presentedViewController { top = next }
            let safari = SFSafariViewController(url: url)
            safari.delegate = self
            top.present(safari, animated: true)
            safari.presentationController?.delegate = self
        }

        nonisolated func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
            MainActor.assumeIsolated { refocus() }
        }

        func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
            refocus()
        }

        /// The room pauses its render loop while the page lacks focus
        /// (StacksCanvas's foreground check), and WKWebView doesn't take focus
        /// back when a sheet over it closes. Without this the scene stays
        /// frozen on the frame it left.
        private func refocus() {
            guard let webView else { return }
            webView.becomeFirstResponder()
            webView.evaluateJavaScript(
                "window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));"
            )
        }
    }
}
