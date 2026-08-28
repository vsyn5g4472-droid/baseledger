import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { TextInput, IconButton, Menu } from 'react-native-paper';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import TeamPlayerAssignmentModal from '../../../../src/components/TeamPlayerAssignmentModal';
import { useTeamDetail } from '../../../../src/hooks/useTeam';
import { updateTeamIcon } from '../../../../src/services/teamService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ChatBubble from '../../../../src/components/ChatBubble';
import GameAnalyticsCard from '../../../../src/components/GameAnalyticsCard';
import { useTeamChat } from '../../../../src/hooks/useTeam';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { Colors, Spacing } from '../../../../src/constants/theme';

export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { messages, sendMessage } = useTeamChat(teamId ?? '');
  const { team, isOwner, refresh } = useTeamDetail(teamId ?? '');
  const { currentUser } = useAuth();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [text, setText] = useState('');
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      scrollToBottom();
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (text.trim()) {
      await sendMessage(text.trim());
      setText('');
    }
  };

  const navigateTo = useCallback((path: string) => {
    setMenuVisible(false);
    router.push(path as any);
  }, []);

  const handleChangeIcon = useCallback(async () => {
    setMenuVisible(false);
    if (!currentUser || !teamId || !isOwner) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセスを許可してください');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    setUploadingIcon(true);
    try {
      await updateTeamIcon(teamId, currentUser.uid, result.assets[0].uri);
      await refresh();
      Alert.alert('完了', 'チームアイコンを更新しました');
    } catch (err) {
      if (__DEV__) console.error('[handleChangeIcon] failed:', err);
      Alert.alert('エラー', 'アイコンの更新に失敗しました');
    } finally {
      setUploadingIcon(false);
    }
  }, [currentUser, teamId, isOwner, refresh]);

  const headerMenu = (
    <View style={styles.headerActions}>
      <TouchableOpacity
        onPress={() => setShowAssignmentModal(true)}
        style={styles.headerBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="account-switch" size={22} color={Colors.primary} />
      </TouchableOpacity>
      <Menu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        anchor={
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="dots-vertical" size={22} color={Colors.primary} />
          </TouchableOpacity>
        }
      >
        <Menu.Item
          leadingIcon="information-outline"
          onPress={() => navigateTo(`/(tabs)/teams/${teamId}`)}
          title="チーム情報"
        />
        <Menu.Item
          leadingIcon="chart-bar"
          onPress={() => navigateTo(`/(tabs)/teams/${teamId}/scores`)}
          title="スコア"
        />
        {isOwner && (
          <Menu.Item
            leadingIcon="account-plus"
            onPress={() => navigateTo(`/(tabs)/teams/${teamId}?openInvite=1`)}
            title="メンバーを招待"
          />
        )}
        {isOwner && (
          <Menu.Item
            leadingIcon="image-edit"
            onPress={handleChangeIcon}
            title="アイコンを変更"
            disabled={uploadingIcon}
          />
        )}
      </Menu>
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: team?.name ?? 'チームチャット',
          headerRight: () => headerMenu,
        }}
      />
      <TeamPlayerAssignmentModal
        visible={showAssignmentModal}
        onClose={() => setShowAssignmentModal(false)}
        teamId={teamId ?? ''}
        teamName={team?.name}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight + tabBarHeight + 12}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.type === 'game_analytics' && item.gameId) {
              const isSent = item.senderId === currentUser?.uid;
              return (
                <GameAnalyticsCard
                  content={item.content}
                  gameId={item.gameId}
                  senderName={item.senderName}
                  timestamp={
                    item.createdAt?.toDate?.()?.toLocaleTimeString?.('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) ?? ''
                  }
                  isSent={isSent}
                />
              );
            }
            return (
              <ChatBubble
                message={item.content}
                isSent={item.senderId === currentUser?.uid}
                senderName={item.senderName}
                timestamp={item.createdAt?.toDate?.()?.toLocaleTimeString?.() ?? ''}
              />
            );
          }}
          contentContainerStyle={styles.messagesList}
          inverted={false}
        />
        <View
          style={[
            styles.inputRow,
            {
              paddingBottom: keyboardVisible
                ? Spacing.sm
                : Math.max(insets.bottom, Spacing.sm),
            },
          ]}
        >
          <TextInput
            placeholder="メッセージを入力..."
            value={text}
            onChangeText={setText}
            mode="outlined"
            style={styles.input}
            dense
            multiline
            blurOnSubmit={false}
            onFocus={scrollToBottom}
          />
          <IconButton
            icon="send"
            iconColor={Colors.primary}
            onPress={handleSend}
            disabled={!text.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  headerBtn: {
    padding: 8,
  },
  messagesList: { padding: Spacing.md, flexGrow: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: { flex: 1, backgroundColor: Colors.card, maxHeight: 100 },
});
