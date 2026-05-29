import React, { useEffect, useRef, useMemo } from 'react';
import { View, Image, StyleSheet, Animated, ActivityIndicator, ImageBackground } from 'react-native';
import { Text } from 'react-native-paper';

const QUOTES = [
  { text: '努力は必ず報われる。もし報われない努力があるのならば、それはまだ努力とは呼べない。', author: '— 王貞治' },
  { text: '勝ちに不思議の勝ちあり、負けに不思議の負けなし。', author: '— 野村克也' },
  { text: '小さいことを重ねることが、とんでもないところに行くただひとつの道。', author: '— イチロー' },
  { text: '勝つことが最大のファンサービス。', author: '— 落合博満' },
  { text: '憧れるのをやめましょう。憧れてしまっては超えられないので。', author: '— 大谷翔平' },
  { text: '我が巨人軍は永久に不滅です。', author: '— 長嶋茂雄' },
  { text: '自分の意志で、運命を切り拓いていく。私はそうありたい。', author: '— 松井秀喜' },
  { text: '次の1球で野球人生が終わってもいいという覚悟でマウンドに上がっている。', author: '— 黒田博樹' },
  { text: '終わるまで、終わらない。', author: '— ヨギ・ベラ' },
  { text: '今日、私は自分を地球上で最も幸運な男だと思っています。', author: '— ルー・ゲーリック' },
  { text: '決して諦めない奴を負かすことだけは、絶対にできない。', author: '— ベーブ・ルース' },
  { text: '自分より努力する人がいると言い訳することは、私には絶対にできない。', author: '— デレク・ジーター' },
  { text: '野球は、10回のうち3回成功すれば偉大とされる、唯一のスポーツだ。', author: '— テッド・ウィリアムズ' },
  { text: '後ろを振り返るな。何かが追いついてくるかもしれないからな。', author: '— サチェル・ペイジ' },
  { text: '私の身体を切り開いてみろ、ドジャースのブルーの血が流れているはずだ。', author: '— トミー・ラソーダ' },
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
    <ImageBackground
      source={require('../../assets/stadium-bg.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* 暗めのオーバーレイ */}
      <View style={styles.overlay} />

      {/* Geminiロゴ隠し（下部） */}
      <View style={styles.bottomCover} />

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
        <ActivityIndicator size="small" color="#FFFFFF" style={styles.indicator} />

        {/* 名言 */}
        <View style={styles.quoteSection}>
          <Text style={styles.quoteText}>「{quote.text}」</Text>
          <Text style={styles.quoteAuthor}>{quote.author}</Text>
        </View>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomCover: {
    position: 'absolute',
    bottom: 0,
    height: 40,
    width: '100%',
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 80,
  },
  logoSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logo: {
    width: 120,
    height: 120,
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
    paddingVertical: 16,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
    width: '100%',
  },
  quoteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 8,
    width: '100%',
  },
  quoteAuthor: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'right',
  },
});
