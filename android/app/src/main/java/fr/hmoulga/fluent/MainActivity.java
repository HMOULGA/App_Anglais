package fr.hmoulga.fluent;

import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // En-têtes COOP/COEP : active SharedArrayBuffer, donc llama.cpp multi-thread (réponses plus rapides).
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse res = super.shouldInterceptRequest(view, request);
                if (res != null && request.getUrl() != null && "localhost".equals(request.getUrl().getHost())) {
                    Map<String, String> h = res.getResponseHeaders() == null ? new HashMap<>() : new HashMap<>(res.getResponseHeaders());
                    h.put("Cross-Origin-Opener-Policy", "same-origin");
                    h.put("Cross-Origin-Embedder-Policy", "require-corp");
                    h.put("Cross-Origin-Resource-Policy", "same-origin");
                    res.setResponseHeaders(h);
                }
                return res;
            }
        });
    }
}
