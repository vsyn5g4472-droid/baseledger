import React, { useEffect, useRef, useMemo } from 'react';
import { View, Image, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';

const QUOTES = [
  {
    text: '努力は必ず報われる。もし報われない努力があるなら、それはまだ努力とは言えない。',
    author: '— 王貞治',
  },
  {
    text: '野球は人生そのものだ。',
    author: '— 長嶋茂雄',
  },
  {
    text: 'どんな時でも全力を尽くす。それが野球選手の使命だ。',
    author: '— イチロー',
  },
];

export default function LoadingScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* ロゴ + アプリ名 */}
      <View style={styles.logoSection}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>BaseLedger</Text>
      </View>

      {/* ローディング */}
      <ActivityIndicator size="small" color="#A0B4C8" style={styles.indicator} />

      {/* 名言 */}
      <View style={styles.quoteSection}>
        <Text style={styles.quoteText}>「{quote.text}」</Text>
        <Text style={styles.quoteAuthor}>{quote.author}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B3A5C',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logo: {
    width: 160,
    height: 160,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 16,
  },
  indicator: {
    marginVertical: 8,
  },
  quoteSection: {
    paddingHorizontal: 32,
    alignItems: 'flex-end',
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 8,
  },
  quoteAuthor: {
    color: '#A0B4C8',
    fontSize: 13,
    textAlign: 'right',
  },
});
