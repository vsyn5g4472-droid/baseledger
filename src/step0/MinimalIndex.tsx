import { View, Text, StyleSheet } from 'react-native';

export default function MinimalIndex() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Step 0B: 起動成功</Text>
      <Text style={styles.subtitle}>Auth / Firebase 未ロード</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B3A5C',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
});
