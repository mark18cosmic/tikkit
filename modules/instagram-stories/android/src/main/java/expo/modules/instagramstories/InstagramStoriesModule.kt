package expo.modules.instagramstories

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

private const val ACTION = "com.instagram.share.ADD_TO_STORY"
private const val INSTAGRAM = "com.instagram.android"

// Sends an image straight into Instagram's Story composer, without the share
// sheet, using Instagram's ADD_TO_STORY intent. Meta requires a Facebook App ID.
// https://developers.facebook.com/docs/instagram-platform/sharing-to-stories
class InstagramStoriesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InstagramStories")

    AsyncFunction("isAvailable") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val intent = Intent(ACTION).apply { type = "image/png" }
      context.packageManager.resolveActivity(intent, 0) != null
    }

    AsyncFunction("shareBackgroundImage") { fileUri: String, appId: String ->
      val activity = appContext.currentActivity
        ?: throw CodedException("E_NO_ACTIVITY", "There's no screen to share from.", null)
      val file = File(Uri.parse(fileUri).path ?: fileUri)
      if (!file.exists()) throw CodedException("E_NO_IMAGE", "The story image couldn't be read.", null)

      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.instagramstories", file)
      val intent = Intent(ACTION).apply {
        setDataAndType(uri, "image/png")
        putExtra("source_application", appId)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      if (activity.packageManager.resolveActivity(intent, 0) == null) {
        throw CodedException("E_NOT_INSTALLED", "Instagram isn't installed.", null)
      }
      activity.grantUriPermission(INSTAGRAM, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivity(intent)
      true
    }
  }
}
