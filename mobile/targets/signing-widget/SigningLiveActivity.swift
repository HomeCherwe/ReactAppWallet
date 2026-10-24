import ActivityKit
import SwiftUI
import WidgetKit

/// The same as in modules/signing-activity, which starts it: ActivityKit matches the two by name and fields
struct SigningActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var expiresAt: Date
    /// Known only to the day (worked out from what SideStore shows)
    var estimated: Bool
  }

  var startedAt: Date
}

@main
struct SigningWidgetBundle: WidgetBundle {
  var body: some Widget {
    SigningLiveActivity()
  }
}

private let orange = Color(red: 1, green: 149 / 255, blue: 0)
// Opens the app on the sheet that says how to refresh it
private let signingURL = URL(string: "walletapp://signing")
private let ukrainian = Locale(identifier: "uk_UA")

/// Lock Screen and Dynamic Island while the 7-day signature runs out: a countdown to the end
struct SigningLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SigningActivityAttributes.self) { context in
      LockScreenView(state: context.state, ended: context.isStale)
        .environment(\.locale, ukrainian)
        .activityBackgroundTint(Color.black.opacity(0.8))
        .activitySystemActionForegroundColor(orange)
        .widgetURL(signingURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HourglassIcon(size: 40)
        }
        DynamicIslandExpandedRegion(.center) {
          Text(context.isStale ? "Підпис MyWallet закінчився" : "Оновіть підпис MyWallet")
            .font(.headline)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          TimeLeft(state: context.state, ended: context.isStale)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .environment(\.locale, ukrainian)
        }
      } compactLeading: {
        Image(systemName: "hourglass")
          .foregroundStyle(orange)
      } compactTrailing: {
        if context.isStale {
          Image(systemName: "exclamationmark.triangle.fill")
            .foregroundStyle(orange)
        } else {
          Text(context.state.expiresAt, style: .timer)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 64)
            .foregroundStyle(orange)
        }
      } minimal: {
        Image(systemName: "hourglass")
          .foregroundStyle(orange)
      }
      .widgetURL(signingURL)
      .keylineTint(orange)
    }
  }
}

private struct HourglassIcon: View {
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle().fill(orange)
      Image(systemName: "hourglass")
        .font(.system(size: size * 0.45, weight: .bold))
        .foregroundStyle(.white)
    }
    .frame(width: size, height: size)
  }
}

private struct LockScreenView: View {
  let state: SigningActivityAttributes.ContentState
  let ended: Bool

  var body: some View {
    HStack(spacing: 12) {
      HourglassIcon(size: 44)
      VStack(alignment: .leading, spacing: 3) {
        Text(ended ? "Підпис MyWallet закінчився" : "Оновіть підпис MyWallet")
          .font(.headline)
          .foregroundStyle(.white)
        TimeLeft(state: state, ended: ended)
          .font(.subheadline)
          .foregroundStyle(orange)
        Text("LocalDevVPN → SideStore → My Apps → MyWallet")
          .font(.caption)
          .foregroundStyle(.white.opacity(0.6))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .padding(16)
  }
}

private struct TimeLeft: View {
  let state: SigningActivityAttributes.ContentState
  let ended: Bool

  var body: some View {
    if ended {
      Text("Оновіть у SideStore, і він знову відкриється")
    } else if state.estimated {
      Text("Закінчується приблизно ") + Text(state.expiresAt, format: .dateTime.day().month(.wide))
    } else {
      Text("Лишилось ") + Text(state.expiresAt, style: .relative)
        + Text(" · до ") + Text(state.expiresAt, format: .dateTime.day().month().hour().minute())
    }
  }
}
