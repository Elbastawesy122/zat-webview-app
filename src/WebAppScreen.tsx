import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { ALLOWED_HOSTS, WEB_URL } from './config';
import { decideNavigation } from './navigationPolicy';

type LoadError = 'offline' | 'server';

const MESSAGES: Record<LoadError, string> = {
  offline: 'تعذر الاتصال بالإنترنت',
  server: 'تعذر تحميل الصفحة، حاول مرة أخرى',
};

export default function WebAppScreen() {
  // `WebView<object>`: the library's default generic (`undefined`) collapses every prop to `never` under TS 6.
  const webViewRef = useRef<WebView<object>>(null);
  const canGoBackRef = useRef(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError | null>(null);

  const retry = useCallback(() => {
    setLoadError(null);
    webViewRef.current?.reload();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBackRef.current) return false;
      webViewRef.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loadError !== 'offline') return;
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) retry();
    });
  }, [loadError, retry]);

  const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
    const decision = decideNavigation(request, ALLOWED_HOSTS);
    if (decision === 'external') {
      Linking.openURL(request.url).catch(() => {});
    }
    return decision === 'allow';
  }, []);

  const onError = useCallback(async () => {
    const state = await NetInfo.fetch();
    setLoadError(state.isConnected === false || state.isInternetReachable === false ? 'offline' : 'server');
  }, []);

  const onNavigationStateChange = useCallback((nav: WebViewNavigation) => {
    canGoBackRef.current = nav.canGoBack;
  }, []);

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <WebView
        key={webViewKey}
        ref={webViewRef}
        style={styles.flex}
        source={{ uri: WEB_URL }}
        // Route every URL through decideNavigation; a narrower whitelist makes the library
        // hand non-matching URLs (tel:, intent:, ...) to Linking itself, bypassing our checks.
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onLoadEnd={() => setInitialLoading(false)}
        onError={onError}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setLoadError('server');
        }}
        onContentProcessDidTerminate={() => webViewRef.current?.reload()}
        onRenderProcessGone={() => setWebViewKey((key) => key + 1)}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        webviewDebuggingEnabled={__DEV__}
      />
      {initialLoading && !loadError && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator size="large" color="#000" />
        </View>
      )}
      {loadError && (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.overlay]}>
          <Text style={styles.msg}>{MESSAGES[loadError]}</Text>
          <Pressable style={styles.btn} onPress={retry} accessibilityRole="button">
            <Text style={styles.btnTxt}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  overlay: { backgroundColor: '#fff', paddingHorizontal: 24 },
  msg: { fontSize: 18, color: '#000', textAlign: 'center' },
  btn: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnTxt: { color: '#fff', fontSize: 16 },
});
