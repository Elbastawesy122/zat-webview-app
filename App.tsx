import { SafeAreaProvider } from 'react-native-safe-area-context';

import ErrorBoundary from './src/ErrorBoundary';
import WebAppScreen from './src/WebAppScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <WebAppScreen />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
