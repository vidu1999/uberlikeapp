package __PKG__

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.view.Gravity
import android.view.View
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
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject
import java.util.HashSet

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var root: FrameLayout
    private lateinit var popupHost: FrameLayout
    private var popupView: WebView? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var googleBusy = false

    companion object {
        private const val START = "__URL__"
        private const val BG = __BG__
        private const val CLIENT = "__CLIENT__"
        private const val GOOGLE_RC = 9001
        private const val FILE_RC = 9002
        private const val CHROME_UA =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG.toInt()
        try {
            WebView.setWebContentsDebuggingEnabled(false)
        } catch (_: Exception) {
        }

        root = FrameLayout(this)
        root.setBackgroundColor(BG.toInt())
        webView = WebView(this)
        webView.setBackgroundColor(BG.toInt())
        tuneWebView(webView, multipleWindows = true)
        webView.addJavascriptInterface(JsBridge(), "QuickBiteNative")
        webView.webViewClient = MainClient()
        webView.webChromeClient = MainChrome()

        popupHost = FrameLayout(this)
        popupHost.visibility = View.GONE
        popupHost.setBackgroundColor(Color.WHITE)

        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        root.addView(
            popupHost,
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

    private fun tuneWebView(view: WebView, multipleWindows: Boolean) {
        val s = view.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.javaScriptCanOpenWindowsAutomatically = true
        s.setSupportMultipleWindows(multipleWindows)
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
        s.userAgentString = CHROME_UA
        try {
            s.setGeolocationEnabled(true)
        } catch (_: Exception) {
        }
        hideWebViewHeader(s)
        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(view, true)
        }
    }

    private fun hideWebViewHeader(s: WebSettings) {
        try {
            val featCl = Class.forName("androidx.webkit.WebViewFeature")
            val supported = featCl.getMethod("isFeatureSupported", String::class.java)
            val compat = Class.forName("androidx.webkit.WebSettingsCompat")
            val names = arrayOf("REQUESTED_WITH_HEADER_ALLOW_LIST", "REQUESTED_WITH_HEADER_CONTROL")
            for (n in names) {
                try {
                    val token = featCl.getField(n).get(null) as String
                    if (supported.invoke(null, token) == true) {
                        try {
                            compat.getMethod(
                                "setRequestedWithHeaderOriginAllowList",
                                WebSettings::class.java,
                                MutableSet::class.java
                            ).invoke(null, s, HashSet<String>())
                        } catch (_: Exception) {
                        }
                    }
                } catch (_: Exception) {
                }
            }
        } catch (_: Exception) {
        }
    }

    inner class JsBridge {
        @JavascriptInterface
        fun postMessage(msg: String) {
            if (msg == "google") {
                runOnUiThread { startGoogle() }
            }
        }
    }

    inner class MainClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            return handleNav(request.url)
        }

        @Deprecated("Deprecated in Java")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
            return handleNav(Uri.parse(url))
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) showRetry()
        }
    }

    inner class MainChrome : WebChromeClient() {
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
            openPopup(resultMsg)
            return true
        }

        override fun onCloseWindow(window: WebView) {
            closePopup()
        }
    }

    private fun openPopup(resultMsg: Message) {
        closePopup()
        val popup = WebView(this)
        tuneWebView(popup, multipleWindows = false)
        popup.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                return handlePopupNav(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(v: WebView, url: String): Boolean {
                return handlePopupNav(Uri.parse(url))
            }
        }
        popup.webChromeClient = object : WebChromeClient() {
            override fun onCloseWindow(window: WebView) {
                closePopup()
            }
        }

        val wrap = LinearLayout(this)
        wrap.orientation = LinearLayout.VERTICAL
        wrap.setBackgroundColor(Color.WHITE)
        val bar = FrameLayout(this)
        bar.setBackgroundColor(0xFF111827.toInt())
        bar.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(48)
        )
        val close = TextView(this)
        close.text = "Close"
        close.setTextColor(Color.WHITE)
        close.textSize = 16f
        close.setPadding(dp(16), dp(12), dp(16), dp(12))
        close.setOnClickListener { closePopup() }
        val lp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        lp.gravity = Gravity.END or Gravity.CENTER_VERTICAL
        bar.addView(close, lp)
        wrap.addView(bar)
        wrap.addView(
            popup,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )
        popupHost.removeAllViews()
        popupHost.addView(
            wrap,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        popupHost.visibility = View.VISIBLE
        popupView = popup
        val transport = resultMsg.obj as WebView.WebViewTransport
        transport.webView = popup
        resultMsg.sendToTarget()
    }

    private fun closePopup(destroy: Boolean = true) {
        val old = popupView
        popupView = null
        popupHost.visibility = View.GONE
        popupHost.removeAllViews()
        if (destroy) {
            try {
                old?.destroy()
            } catch (_: Exception) {
            }
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun handleNav(uri: Uri): Boolean {
        if (handleExternal(uri)) return true
        if (isBlockedGoogleRedirect(uri) || isGoogleOauthError(uri)) {
            startGoogle()
            return true
        }
        return false
    }

    private fun handlePopupNav(uri: Uri): Boolean {
        if (handleExternal(uri)) return true
        if (isBlockedGoogleRedirect(uri) || isGoogleOauthError(uri)) {
            closePopup()
            startGoogleFromNative()
            return true
        }
        if (isAppPage(uri) && hasGoogleTokens(uri)) {
            val js = "location.replace(" + JSONObject.quote(uri.toString()) + ")"
            webView.evaluateJavascript(js, null)
            closePopup()
            return true
        }
        return false
    }

    private fun isAppPage(uri: Uri): Boolean {
        val host = (uri.host ?: "").lowercase()
        return host == "quickbite-2ao.pages.dev"
    }

    private fun hasGoogleTokens(uri: Uri): Boolean {
        val hay = ((uri.fragment ?: "") + "&" + (uri.query ?: "")).lowercase()
        return hay.contains("access_token=") || hay.contains("id_token=") || hay.contains("credential=")
    }

    private fun isBlockedGoogleRedirect(uri: Uri): Boolean {
        val host = (uri.host ?: "").lowercase()
        if (host != "accounts.google.com") return false
        val path = (uri.path ?: "").lowercase()
        if (!path.contains("oauth") && !path.contains("authorize")) return false
        val redir = uri.getQueryParameter("redirect_uri") ?: return false
        if (!redir.startsWith("https://quickbite-2ao.pages.dev")) return false
        if (redir.startsWith("storagerelay:")) return false
        val rest = redir.removePrefix("https://quickbite-2ao.pages.dev")
        return rest.contains(".html") || rest.contains("index")
    }

    private fun isGoogleOauthError(uri: Uri): Boolean {
        val host = (uri.host ?: "").lowercase()
        if (host != "accounts.google.com") return false
        val path = (uri.path ?: "").lowercase()
        val q = (uri.query ?: "").lowercase()
        return path.contains("/error") || q.contains("redirect_uri_mismatch")
    }

    private fun handleExternal(uri: Uri): Boolean {
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

    private fun startGoogle() {
        startGoogleFromNative()
    }

    private fun startGoogleFromNative() {
        if (googleBusy) return
        googleBusy = true
        try {
            val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestEmail()
                .requestProfile()
                .build()
            val client = GoogleSignIn.getClient(this, gso)
            client.signOut().addOnCompleteListener {
                try {
                    startActivityForResult(client.signInIntent, GOOGLE_RC)
                } catch (e: Exception) {
                    googleBusy = false
                    runGisInPage()
                }
            }
        } catch (e: Exception) {
            googleBusy = false
            runGisInPage()
        }
    }

    private fun runGisInPage() {
        val js = """
            (function(){
              var id = ${JSONObject.quote(CLIENT)};
              function fail(m){
                if (window._qbGoogleDone) { window._qbGoogleDone(String(m||'Try Continue with Google again.')); return; }
                var el = document.querySelector('[data-err]');
                if (el) el.textContent = String(m||'Could not finish Google sign-in. Try again.');
              }
              function ok(p){
                if (window._qbGoogleDone) { window._qbGoogleDone(null, p); return; }
                if (window.API && API.signInGoogle) {
                  API.signInGoogle(p).then(function(){ location.reload(); }).catch(function(){ location.reload(); });
                }
              }
              function start(){
                try {
                  var tc = google.accounts.oauth2.initTokenClient({
                    client_id: id,
                    scope: 'openid email profile',
                    callback: function(resp){
                      if (!resp || !resp.access_token) { fail(resp && (resp.error_description||resp.error)); return; }
                      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {headers:{Authorization:'Bearer '+resp.access_token}})
                        .then(function(r){ return r.json(); }).then(ok).catch(function(e){ fail(e && e.message); });
                    },
                    error_callback: function(err){ fail(err && (err.type||err.message)); }
                  });
                  tc.requestAccessToken({prompt:'select_account'});
                } catch(e) { fail(e && e.message); }
              }
              if (window.google && google.accounts && google.accounts.oauth2) start();
              else {
                var s = document.createElement('script');
                s.src = 'https://accounts.google.com/gsi/client';
                s.onload = start;
                s.onerror = function(){ fail('Could not load Google Sign-In.'); };
                document.head.appendChild(s);
              }
            })();
        """.trimIndent()
        if (::webView.isInitialized) webView.evaluateJavascript(js, null)
    }

    private fun profileJson(acc: GoogleSignInAccount): JSONObject {
        val o = JSONObject()
        o.put("email", acc.email ?: "")
        o.put("name", acc.displayName ?: acc.email ?: "")
        o.put("sub", acc.id ?: "")
        o.put("id", acc.id ?: "")
        o.put("photo", acc.photoUrl?.toString() ?: "")
        o.put("picture", acc.photoUrl?.toString() ?: "")
        return o
    }

    private fun deliverGoogle(err: String?, profile: JSONObject?) {
        val js = if (err != null) {
            "(function(){ var m = " + JSONObject.quote(err) + ";" +
                "if (window._qbGoogleDone) { window._qbGoogleDone(m); return; }" +
                "var el = document.querySelector('[data-err]'); if (el) el.textContent = m; })();"
        } else {
            "(function(){ var p = $profile;" +
                "if (window._qbGoogleDone) { window._qbGoogleDone(null, p); return; }" +
                "if (window.API && API.signInGoogle) {" +
                "API.signInGoogle(p).then(function(){ location.reload(); }).catch(function(){ location.reload(); });" +
                "} })();"
        }
        if (::webView.isInitialized) webView.evaluateJavascript(js, null)
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
        if (requestCode != GOOGLE_RC) return
        googleBusy = false
        try {
            val acc = GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException::class.java)
            if (acc != null && !acc.email.isNullOrBlank()) {
                deliverGoogle(null, profileJson(acc))
                return
            }
        } catch (e: ApiException) {
            if (e.statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED) {
                runGisInPage()
                return
            }
        } catch (_: Exception) {
        }
        runGisInPage()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (popupHost.visibility == View.VISIBLE) {
            closePopup()
            return
        }
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
