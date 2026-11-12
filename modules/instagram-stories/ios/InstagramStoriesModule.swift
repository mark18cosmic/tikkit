import ExpoModulesCore
import UIKit

// Sends an image straight into Instagram's Story composer, without the share
// sheet. Instagram reads the image from the pasteboard under its own key,
// then opens instagram-stories://share. Meta requires a Facebook App ID.
// https://developers.facebook.com/docs/instagram-platform/sharing-to-stories
public class InstagramStoriesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstagramStories")

    AsyncFunction("isAvailable") { () -> Bool in
      guard let url = URL(string: "instagram-stories://share") else { return false }
      return UIApplication.shared.canOpenURL(url)
    }.runOnQueue(.main)

    AsyncFunction("shareBackgroundImage") { (fileUri: String, appId: String, promise: Promise) in
      let source = fileUri.hasPrefix("file://") ? URL(string: fileUri) : URL(fileURLWithPath: fileUri)
      guard let source, let data = try? Data(contentsOf: source) else {
        promise.reject("E_NO_IMAGE", "The story image couldn't be read.")
        return
      }
      guard let target = URL(string: "instagram-stories://share?source_application=\(appId)"),
            UIApplication.shared.canOpenURL(target) else {
        promise.reject("E_NOT_INSTALLED", "Instagram isn't installed.")
        return
      }
      // Instagram asks for a short expiry so the image doesn't linger on the pasteboard.
      UIPasteboard.general.setItems(
        [["com.instagram.sharedSticker.backgroundImage": data]],
        options: [.expirationDate: Date().addingTimeInterval(60 * 5)]
      )
      UIApplication.shared.open(target, options: [:]) { opened in
        promise.resolve(opened)
      }
    }.runOnQueue(.main)
  }
}
