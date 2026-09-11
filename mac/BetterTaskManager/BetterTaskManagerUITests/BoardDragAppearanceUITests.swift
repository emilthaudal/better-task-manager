import XCTest

/// Captures what the board looks like partway through a drag, which no assertion can
/// describe. XCUITest gestures block the main thread for their whole duration and
/// screenshots may only be taken from that thread, so the lifted card is recorded by
/// XCTest's screen capture rather than screenshotted directly.
///
/// XCTest keeps that recording only for a failing test, so a capture run ends in a
/// deliberate failure. Run it with:
///
///     xcodebuild ... -only-testing:BetterTaskManagerUITests/BoardDragAppearanceUITests \
///       TEST_RUNNER_BTM_CAPTURE=1 -resultBundlePath <path> test
///
/// Without that variable the test just asserts the board loads and a drag completes.
final class BoardDragAppearanceUITests: XCTestCase {

    private var isCaptureRun: Bool {
        ProcessInfo.processInfo.environment["BTM_CAPTURE"] == "1"
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func attach(_ screenshot: XCUIScreenshot, named name: String) {
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func waitForElement(
        _ app: XCUIApplication,
        labelled label: String,
        timeout: TimeInterval
    ) -> XCUIElement? {
        let predicate = NSPredicate(format: "label CONTAINS %@ OR title CONTAINS %@ OR value CONTAINS %@", label, label, label)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for query in [app.buttons, app.staticTexts, app.cells, app.descendants(matching: .any)] {
                let match = query.matching(predicate).firstMatch
                if match.exists && match.isHittable { return match }
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return nil
    }

    @MainActor
    func testBoardLoadsAndCardDragCompletes() throws {
        let app = XCUIApplication()
        app.launch()

        guard let project = waitForElement(app, labelled: "DELUX", timeout: 60) else {
            attach(app.screenshot(), named: "00-picker-not-found")
            return XCTFail("project picker row never became hittable")
        }
        project.click()

        guard let card = waitForElement(app, labelled: "DELUX-", timeout: 60) else {
            attach(app.screenshot(), named: "01-no-cards")
            return XCTFail("no board card appeared")
        }
        attach(app.screenshot(), named: "01-board-at-rest")

        let window = app.windows.firstMatch
        let start = card.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        let end = window.coordinate(withNormalizedOffset: CGVector(dx: 0.62, dy: 0.42))

        start.press(forDuration: 1.0, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 2.5)

        Thread.sleep(forTimeInterval: 2.0)
        attach(app.screenshot(), named: "02-after-drop")

        if isCaptureRun {
            XCTFail("capture run: failing deliberately so XCTest keeps the screen recording")
        }
    }
}
