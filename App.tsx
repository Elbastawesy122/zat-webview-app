import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Linking, Platform,
  Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const HOME = 'https://zat-ksa.com/';

export default function App() {
  const ref = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { ref.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const shouldLoad = ({ url }: { url: string }) => {
    if (url.startsWith(HOME) || url.startsWith('about:')) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  };

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.msg}>تعذر الاتصال بالإنترنت</Text>
        <Pressable style={s.btn} onPress={() => { setError(false); setLoading(true); }}>
          <Text style={s.btnTxt}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.flex}>
      <StatusBar barStyle="dark-content" />
      <WebView
        ref={ref}
        source={{ uri: HOME }}
        onShouldStartLoadWithRequest={shouldLoad}
        onNavigationStateChange={(n) => setCanGoBack(n.canGoBack)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setError(true)}
        onHttpError={() => setError(true)}
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
      />
      {loading && <ActivityIndicator style={StyleSheet.absoluteFill} size="large" />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  msg: { fontSize: 18 },
  btn: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnTxt: { color: '#fff', fontSize: 16 },
});