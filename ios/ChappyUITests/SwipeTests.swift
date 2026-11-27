import XCTest

/// A web view created before iOS set up the window crashed on the first swipe
/// (build 7's first cut). Swipe every way, early and once the room is up.
final class SwipeTests: XCTestCase {
    func testSwipesAfterLaunch() {
        let app = XCUIApplication()
        app.launch()
        for delay in [0.5, 5.0] {
            Thread.sleep(forTimeInterval: delay)
            app.swipeLeft()
            app.swipeRight()
            app.swipeUp()
            app.swipeDown()
            XCTAssertEqual(app.state, .runningForeground, "crashed swiping \(delay) s after launch")
        }
    }
}
