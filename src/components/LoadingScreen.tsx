import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Animated, ActivityIndicator, ImageBackground } from 'react-native';
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
  { text: '迷ったら前へ。苦しかったら前に。つらかったら前に。後悔するのはそのあと、そのずっと後でいい。', author: '— 星野仙一' },
  { text: '壁というのは、できる人にしかやってこない。超えられる可能性がある人にしかやってこない。だから、壁がある時はチャンスだと思っている。', author: '— イチロー' },
  { text: '自分でコントロールできないことには関心を持たない。', author: '— 松井秀喜' },
  { text: '失敗と書いて、成長と読む。', author: '— 野村克也' },
  { text: 'ときめきを失った時、人の成長は止まる。', author: '— 王貞治' },
  { text: '挫折してもプライドは失わない、それは常に自分はできるんだという過信に似た自信があるからだ。', author: '— 長嶋茂雄' },
  { text: '欠点ばかり気にしていては、自分の長所が死んでしまう。', author: '— 落合博満' },
  { text: '他人がポイッて捨てた運を拾っているんです。', author: '— 大谷翔平' },
  { text: '練習は嘘をつかないって言葉があるけど、頭を使って練習しないと普通に嘘つくよ。', author: '— ダルビッシュ有' },
  { text: '自分にコントロールできないことは、一切考えない。', author: '— 田中将大' },
  { text: '不安があるからこそ、準備ができる。', author: '— 前田健太' },
  { text: '限界は、自分の心が決めるもの。', author: '— 工藤公康' },
  { text: '代えのきかない選手になれ。', author: '— 古田敦也' },
  { text: '試練はそれを乗り越えられる者にしか与えられない。', author: '— 桑田真澄' },
  { text: '自信が確信に変わりました。', author: '— 松坂大輔' },
  { text: '迷ったときは、一番厳しい道を選べ。', author: '— 原辰徳' },
  { text: 'ケガを言い訳にしたくない。グラウンドに立つ以上は。', author: '— 金本知憲' },
  { text: '記録より記憶に残る選手になりたい。', author: '— 新庄剛志' },
  { text: 'メジャーでやれるかどうかなんて、誰にもわからない。だから自分がやってみるしかない。', author: '— 野茂英雄' },
  { text: 'グラウンドには銭が落ちている。', author: '— 鶴岡一人' },
  { text: 'ボールが止まって見えた。', author: '— 川上哲治' },
  { text: 'できるかどうかじゃない。やるか、やらないかだ。', author: '— 栗山英樹' },
  { text: '絶対大丈夫。', author: '— 高津臣吾' },
  { text: 'いつも私を初めて見るファンがいるかもしれない。だから私は常に全力でプレイする。', author: '— ジョー・ディマジオ' },
  { text: '一人の人生は、他人の人生に影響を与えない限り、全く意味がない。', author: '— ジャッキー・ロビンソン' },
  { text: '昨日のホームランで、今日の試合に勝つことはできない。', author: '— ハンク・アーロン' },
  { text: '自分に限界を設けるな。', author: '— ノーラン・ライアン' },
  { text: '打撃とはタイミングだ。投球とはそのタイミングを狂わせることだ。', author: '— ウォーレン・スパーン' },
  { text: '毎日が新しい日だ。昨日のヒットも昨日のエラーも、今日には関係ない。', author: '— トニー・グウィン' },
  { text: '試合に出続けることが、私の誇りだ。', author: '— カル・リプケン・ジュニア' },
  { text: 'さあ、2試合やろう！', author: '— アーニー・バンクス' },
  { text: '自分を助ける力がありながら何もしない人間は、この世に生きている価値がない。', author: '— ロベルト・クレメンテ' },
  { text: '野球に教本はない。自分で作るものだ。', author: '— ピート・ローズ' },
  { text: 'もし私がこんなに長く生きると分かっていたら、もっと自分を大事にしただろう。', author: '— ミッキー・マントル' },
  { text: '才能は神からの贈り物だが、努力は自分自身への贈り物だ。', author: '— アルバート・プホルス' },
  { text: '雑草魂。', author: '— 上原浩治' },
  { text: '全力疾走は誰にでもできる。', author: '— 稲葉篤紀' },
  { text: '何か持っていると言われ続けてきました。今日何を持っているか確信しました。それは仲間です。', author: '— 斎藤佑樹' },
  { text: '信じて任せる。', author: '— 仰木彬' },
  { text: '準備というのは、言い訳の材料となり得るものを排除していく、そのために考え得るすべてのことをこなしていく。', author: '— イチロー' },
  { text: '守備スランプはない。打撃スランプはあるがね。', author: '— ウィリー・メイズ' },
  { text: '努力できることが才能である。', author: '— 松井秀喜' },
  { text: 'シンジラレナーイ。', author: '— トレイ・ヒルマン' },
  { text: '1点差でマウンドに上がるのがクローザーの仕事。', author: '— 岩瀬仁紀' },
  { text: '練習は裏切らない。', author: '— 宮本慎也' },
  { text: 'キャプテンとは、言葉ではなく姿勢で示すもの。', author: '— 小久保裕紀' },
  { text: 'キャッチャーはグラウンド上の監督だ。', author: '— 城島健司' },
  { text: '苦しまずして勝ちあがれるほど甘い世界ではない。', author: '— 黒田博樹' },
  { text: '最高です。', author: '— 鈴木誠也' },
  { text: 'グラウンドに出たら、年齢は関係ない。', author: '— 鳥谷敬' },
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
        {/* アプリ名 */}
        <View style={styles.logoSection}>
          <Text style={styles.appName}>BaseLedger</Text>
        </View>

        {/* ローディング */}
        <ActivityIndicator size="small" color="#FFFFFF" style={styles.indicator} />

        {/* 名言 */}
        <View style={styles.quoteSection}>
          <Text style={styles.quoteText}>{quote.text}</Text>
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
    height: 80,
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
