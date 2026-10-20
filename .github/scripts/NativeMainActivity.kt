package __PKG__

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    companion object {
        private const val START = "__URL__"
        private const val BG = __BG__
        private const val GOOGLE_RC = 9001
        private const val FILE_RC = 9002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG.toInt()
        try {
            WebView.setWebContentsDebuggingEnabled(false)
        } catch (_: Exception) {
        }

        webView = WebView(this)
        webView.setBackgroundColor(BG.toInt())
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.javaScriptCanOpenWindowsAutomatically = true
        s.setSupportMultipleWindows(true)
        s.loadsImagesAutomatically = true
        s.useWideViewPort = true
        s.loadWithOverviewMode = true
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = true
        s.allowContentAccess = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        try {
            s.setGeolocationEnabled(true)
        } catch (_: Exception) {
        }
        try {
            val ua = s.userAgentString ?: ""
            s.userAgentString = ua.replace("; wv", "") + " QuickBiteApp"
        } catch (_: Exception) {
        }

        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }

        webView.addJavascriptInterface(JsBridge(), "QuickBiteNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleUrl(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleUrl(Uri.parse(url))
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showRetry()
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                callback.invoke(origin, true, true)
            }

            override fun onShowFileChooser(
                view: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = Intent(Intent.ACTION_GET_CONTENT)
                intent.addCategory(Intent.CATEGORY_OPENABLE)
                intent.type = "image/*"
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                return try {
                    startActivityForResult(Intent.createChooser(intent, "Photo"), FILE_RC)
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    filePathCallback.onReceiveValue(null)
                    false
                }
            }

            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message
            ): Boolean {
                val extra = WebView(this@MainActivity)
                extra.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        val u = request.url
                        if (handleUrl(u)) return true
                        webView.loadUrl(u.toString())
                        return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = extra
                resultMsg.sendToTarget()
                return true
            }
        }

        val root = FrameLayout(this)
        root.setBackgroundColor(BG.toInt())
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)

        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ),
                7
            )
        }
        webView.loadUrl(START)
    }

    inner class JsBridge {
        @JavascriptInterface
        fun postMessage(msg: String) {
            if (msg == "google") {
                runOnUiThread { startGoogle() }
            }
        }
    }

    private fun startGoogle() {
        try {
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestProfile()
                .build()
            val client = GoogleSignIn.getClient(this, gso)
            startActivityForResult(client.signInIntent, GOOGLE_RC)
        } catch (e: Exception) {
            googleDone(e.message ?: "Google sign-in failed", null)
        }
    }

    private fun googleDone(err: String?, profile: JSONObject?) {
        val js = if (err != null) {
            "window._qbGoogleDone && window._qbGoogleDone(${JSONObject.quote(err)})"
        } else {
            "window._qbGoogleDone && window._qbGoogleDone(null, $profile)"
        }
        if (::webView.isInitialized) webView.evaluateJavascript(js, null)
    }

    private fun handleUrl(uri: Uri): Boolean {
        val scheme = (uri.scheme ?: "").lowercase()
        val host = (uri.host ?: "").lowercase()
        val path = (uri.path ?: "").lowercase()
        val raw = uri.toString().lowercase()
        if (scheme == "tel" || scheme == "mailto" || scheme == "sms" || scheme == "geo" ||
            scheme == "whatsapp" || scheme == "intent" || scheme == "waze"
        ) {
            openExternal(uri)
            return true
        }
        if (scheme == "http" || scheme == "https") {
            if (raw.contains(".apk") ||
                host.contains("waze.com") ||
                host.contains("maps.google") ||
                (host.contains("google.com") && path.contains("/maps"))
            ) {
                openExternal(uri)
                return true
            }
        }
        return false
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
        } catch (_: Exception) {
        }
    }

    private fun showRetry() {
        if (!::webView.isInitialized) return
        val html = (
            "<html><body style='font-family:sans-serif;background:#ffffff;color:#111;padding:40px;text-align:center'>" +
                "<h2>QuickBite</h2><p>Check internet, then retry.</p>" +
                "<p><a href='" + START + "' style='color:#00C853;font-size:18px'>Retry</a></p></body></html>"
            )
        webView.loadDataWithBaseURL(START, html, "text/html", "utf-8", START)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_RC) {
            val uris = WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            fileCallback?.onReceiveValue(uris)
            fileCallback = null
            return
        }
        if (requestCode == GOOGLE_RC) {
            if (resultCode != RESULT_OK) {
                googleDone("Google sign-in cancelled", null)
                return
            }
            try {
                val acc = GoogleSignIn.getSignedInAccountFromIntent(data).result
                val o = JSONObject()
                o.put("email", acc.email ?: "")
                o.put("name", acc.displayName ?: acc.email ?: "")
                o.put("sub", acc.id ?: "")
                o.put("id", acc.id ?: "")
                o.put("photo", acc.photoUrl?.toString() ?: "")
                o.put("picture", acc.photoUrl?.toString() ?: "")
                googleDone(null, o)
            } catch (e: Exception) {
                googleDone(e.message ?: "Google sign-in failed", null)
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    override fun onPause() {
        if (::webView.isInitialized) {
            webView.onPause()
            CookieManager.getInstance().flush()
        }
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }
}
