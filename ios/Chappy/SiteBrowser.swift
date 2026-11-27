import SafariServices
import UIKit
import WebKit

/// One tab's browser, kept for the life of the app. Home's starts loading in
/// `ChappyApp.init`, before SwiftUI draws the first tab.
///
/// On a room page (Home and its shelf stops) a cover hides the web view until
/// the room says it is on screen. The site skips its drawing handoff in this
/// app (`src/app/components/stacks/boot/nativeShell.ts`) and posts
/// `{boot: "live" | "fallback"}` to the `chappyRoom` handler when the boot
/// settles. The cover shows the room as it looked the last time it went live,
/// or the site's background before there is one.
@MainActor
final class SiteBrowser: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler,
    SFSafariViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private static var browsers: [SiteTab: SiteBrowser] = [:]

    static func of(_ tab: SiteTab) -> SiteBrowser {
        if let browser = browsers[tab] { return browser }
        let browser = SiteBrowser(tab: tab)
        browsers[tab] = browser
        return browser
    }

    /// Paths that boot the room (`RoomHomePage`).
    private static let roomPaths: Set<String> = ["/", "/about", "/projects", "/talks", "/golf"]
    /// Past this the page shows its own boot screen or fallback.
    private static let coverLimit: Duration = .seconds(10)

    let tab: SiteTab
    let view: BrowserView
    let webView: WKWebView
    private var started = false
    private var coverTimeout: Task<Void, Never>?
    /// The covered page said it will report (`starting`, from its inline script).
    private var roomAnnounced = false

    private init(tab: SiteTab) {
        self.tab = tab
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "ChappyApp/1"
        webView = WKWebView(frame: .zero, configuration: config)
        view = BrowserView(webView: webView)
        super.init()
        // The content controller holds this handler strongly. Browsers live as
        // long as the app, so the cycle is never collected anyway.
        config.userContentController.add(self, name: "chappyRoom")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
    }

    /// Loads the tab's first page once. Later calls do nothing.
    func start() {
        guard !started else { return }
        started = true
        load(Self.testRoot(for: tab) ?? tab.rootURL)
    }

    /// Debug builds launched with `-ChappyHomeRoot <url>` (devicectl or the
    /// simulator) open Home on that URL, a local build served over the tailnet,
    /// for timing the room boot inside the app.
    private static func testRoot(for tab: SiteTab) -> URL? {
        #if DEBUG
        guard tab == .home,
              let value = UserDefaults.standard.string(forKey: "ChappyHomeRoot") else { return nil }
        return URL(string: value)
        #else
        return nil
        #endif
    }

    func load(_ url: URL) {
        started = true
        if webView.url == url { return }
        coverIfRoom(url)
        webView.load(URLRequest(url: url))
    }

    @objc private func pullToRefresh(_ sender: UIRefreshControl) {
        if let url = webView.url { coverIfRoom(url) }
        webView.reload()
    }

    // MARK: Cover

    private func isRoom(_ url: URL) -> Bool {
        tab == .home && Self.roomPaths.contains(url.path.isEmpty ? "/" : url.path)
    }

    private func coverIfRoom(_ url: URL) {
        guard isRoom(url) else { return }
        roomAnnounced = false
        view.showCover { size, style in RoomSnapshot.image(for: url, size: size, style: style) }
        coverTimeout?.cancel()
        coverTimeout = Task { [weak self] in
            try? await Task.sleep(for: Self.coverLimit)
            guard !Task.isCancelled else { return }
            self?.liftCover()
        }
    }

    private func liftCover() {
        coverTimeout?.cancel()
        coverTimeout = nil
        view.hideCover()
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "chappyRoom",
              let body = message.body as? [String: Any],
              let boot = body["boot"] as? String else { return }
        if boot == "starting" {
            roomAnnounced = true
            return
        }
        if boot == "live", let url = webView.url, isRoom(url) {
            RoomSnapshot.capture(webView, for: url, style: view.traitCollection.userInterfaceStyle)
        }
        liftCover()
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        // A room page announces itself while it parses, long before load. A
        // page that didn't (no room, or a deploy from before the announcement)
        // will never report, so it shows now.
        if !roomAnnounced { liftCover() }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        liftCover()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
        liftCover()
    }

    /// iOS ends a backgrounded page's web process under memory pressure, which
    /// leaves a blank view. Reload it, behind the cover on a room page.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let url = webView.url ?? tab.rootURL
        coverIfRoom(url)
        if webView.url == nil {
            webView.load(URLRequest(url: url))
        } else {
            webView.reload()
        }
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
        let isSite = url.host.map {
            SiteTab.isSiteHost($0.lowercased()) || $0 == Self.testRoot(for: tab)?.host
        } ?? true
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

    // MARK: Safari sheet

    private func present(_ url: URL) {
        guard url.scheme == "https" || url.scheme == "http",
              let presenter = webView.window?.rootViewController else { return }
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
        webView.becomeFirstResponder()
        webView.evaluateJavaScript(
            "window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'));"
        )
    }
}

/// The web view with the room cover above it.
final class BrowserView: UIView {
    let webView: WKWebView
    private let cover = UIImageView()
    /// Home's cover goes up in `ChappyApp.init`, before this view has a window,
    /// a size or an appearance, so its image is looked up at the first layout.
    private var coverImage: ((CGSize, UIUserInterfaceStyle) -> UIImage?)?

    var isCovered: Bool { !cover.isHidden && cover.alpha > 0 }

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        backgroundColor = UIColor(named: "LaunchBackground")
        addSubview(webView)
        cover.backgroundColor = UIColor(named: "LaunchBackground")
        cover.contentMode = .scaleAspectFill
        cover.clipsToBounds = true
        cover.isHidden = true
        addSubview(cover)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func layoutSubviews() {
        super.layoutSubviews()
        webView.frame = bounds
        cover.frame = bounds
        if let coverImage, window != nil, bounds.size != .zero {
            self.coverImage = nil
            cover.image = coverImage(bounds.size, traitCollection.userInterfaceStyle)
        }
    }

    /// `image` gets this view's size and appearance; a snapshot is stored per
    /// both, so one taken at another size or theme is never used.
    override func didMoveToWindow() {
        super.didMoveToWindow()
        setNeedsLayout()
    }

    func showCover(_ image: @escaping (CGSize, UIUserInterfaceStyle) -> UIImage?) {
        cover.layer.removeAllAnimations()
        cover.image = nil
        coverImage = image
        cover.alpha = 1
        cover.isHidden = false
        setNeedsLayout()
    }

    func hideCover() {
        guard isCovered else { return }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.cover.alpha = 0
        } completion: { finished in
            if finished { self.cover.isHidden = true }
        }
    }
}

/// The last live frame of each room page, per appearance and screen size.
enum RoomSnapshot {
    private static var directory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "room-cover", directoryHint: .isDirectory)
    }

    private static func file(for url: URL, size: CGSize, style: UIUserInterfaceStyle) -> URL {
        let page = url.path == "/" || url.path.isEmpty ? "home" : url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let theme = style == .dark ? "dark" : "light"
        return directory.appending(path: "\(page)-\(theme)-\(Int(size.width))x\(Int(size.height)).jpg")
    }

    @MainActor
    static func image(for url: URL, size: CGSize, style: UIUserInterfaceStyle) -> UIImage? {
        guard size.width > 0,
              let data = try? Data(contentsOf: file(for: url, size: size, style: style)),
              let pixels = UIImage(data: data)?.cgImage else { return nil }
        // Saved at the screen's scale; recover it from the pixel width.
        return UIImage(cgImage: pixels, scale: CGFloat(pixels.width) / size.width, orientation: .up)
    }

    @MainActor
    static func capture(_ webView: WKWebView, for url: URL, style: UIUserInterfaceStyle) {
        let size = webView.bounds.size
        guard size != .zero else { return }
        let target = file(for: url, size: size, style: style)
        webView.takeSnapshot(with: nil) { image, _ in
            guard let data = image?.jpegData(compressionQuality: 0.8) else { return }
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try? data.write(to: target, options: .atomic)
        }
    }
}
