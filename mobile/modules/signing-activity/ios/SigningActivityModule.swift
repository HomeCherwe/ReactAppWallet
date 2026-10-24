import ActivityKit
import ExpoModulesCore

/// The same as in targets/signing-widget, which draws it: ActivityKit matches the two by name and fields
struct SigningActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var expiresAt: Date
    /// Known only to the day (worked out from what SideStore shows)
    var estimated: Bool
  }

  var startedAt: Date
}

/// The live activity on the Lock Screen and in the Dynamic Island while the 7-day signature runs out
/// (utils/signingActivity.ts): it stays above the notifications until the app ends it.
public final class SigningActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SigningActivity")

    AsyncFunction("show") { (expiresAt: Double, estimated: Bool) in
      try await SigningActivity.show(
        expiresAt: Date(timeIntervalSince1970: expiresAt / 1000),
        estimated: estimated
      )
    }

    AsyncFunction("hide") { () in
      await SigningActivity.endAll()
    }
  }
}

enum SigningActivity {
  /// iOS ends a live activity after 8 hours; one older than this is started anew when the app is opened
  static let restartAfter: TimeInterval = 60 * 60

  static func show(expiresAt: Date, estimated: Bool) async throws {
    let state = SigningActivityAttributes.ContentState(expiresAt: expiresAt, estimated: estimated)
    // Past the end it shows that the signature ran out
    let content = ActivityContent(state: state, staleDate: expiresAt)

    let running = Activity<SigningActivityAttributes>.activities.filter {
      $0.activityState == .active || $0.activityState == .stale
    }
    if running.count == 1, let activity = running.first,
       Date().timeIntervalSince(activity.attributes.startedAt) < restartAfter {
      await activity.update(content)
      return
    }

    await endAll()
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    _ = try Activity.request(
      attributes: SigningActivityAttributes(startedAt: Date()),
      content: content,
      pushType: nil
    )
  }

  static func endAll() async {
    for activity in Activity<SigningActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
