import { Redirect, useLocalSearchParams } from 'expo-router';

// Where the bank sends people back to (web, or a link opened outside the app's
// browser sheet). The payment screen re-checks the status with the server.
export default function PayReturn() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Redirect href={{ pathname: '/pay/[id]', params: { id } }} /> : <Redirect href="/" />;
}
