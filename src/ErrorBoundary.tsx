import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches render errors in the native shell; errors inside the web page never reach here.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>حدث خطأ غير متوقع</Text>
        <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.btnTxt}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  msg: { fontSize: 18, color: '#000' },
  btn: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  btnTxt: { color: '#fff', fontSize: 16 },
});
