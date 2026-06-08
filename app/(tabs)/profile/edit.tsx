import React, { useState } from 'react';
import { StyleSheet, ScrollView, Alert, TouchableOpacity, View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, Avatar } from 'react-native-paper';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { updateUser } from '../../../src/services/userService';
import { updateAuthorNameInPosts } from '../../../src/services/postService';
import { uploadUserAvatar } from '../../../src/services/storageService';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import {
  AVATAR_COLOR_OPTIONS,
  DEFAULT_AVATAR_COLOR,
  getAvatarColorHex,
  type AvatarColorId,
} from '../../../src/constants/avatarColors';
import type { UserRole } from '../../../src/models/types';

export default function EditProfileScreen() {
  const { currentUser, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [position, setPosition] = useState(currentUser?.position ?? '');
  const [team, setTeam] = useState(currentUser?.team ?? '');
  const [role, setRole] = useState<UserRole>(currentUser?.role ?? 'player');
  const [loading, setLoading] = useState(false);
  const [photoURL, setPhotoURL] = useState<string | null>(currentUser?.photoURL ?? null);
  const [avatarColor, setAvatarColor] = useState<AvatarColorId>(
    currentUser?.avatarColor ?? DEFAULT_AVATAR_COLOR,
  );
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const avatarBg = getAvatarColorHex(avatarColor);

  const uploadPhoto = async (uri: string) => {
    if (!currentUser) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadUserAvatar(currentUser.uid, uri);
      setPhotoURL(url);
      await updateUser(currentUser.uid, { photoURL: url });
      await updateAuthorNameInPosts(
        currentUser.uid,
        displayName || currentUser.displayName,
        url,
        currentUser.plan,
      );
      await refreshUser({ photoURL: url });
    } catch (e: unknown) {
      console.error('uploadPhoto error:', e);
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert('エラー', `写真のアップロードに失敗しました: ${message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePhotoPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセスを許可してください');
      return;
    }
    Alert.alert(
      'プロフィール写真',
      '変更方法を選択してください',
      [
        {
          text: 'カメラで撮影',
          onPress: async () => {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (cam.status !== 'granted') {
              Alert.alert('権限エラー', 'カメラへのアクセスを許可してください');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled) await uploadPhoto(result.assets[0].uri);
          },
        },
        {
          text: 'アルバムから選択',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled) await uploadPhoto(result.assets[0].uri);
          },
        },
        { text: 'キャンセル', style: 'cancel' },
      ],
    );
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      await updateUser(currentUser.uid, {
        displayName,
        bio,
        position,
        team,
        role,
        photoURL,
        avatarColor,
      });
      const nameChanged = displayName !== currentUser.displayName;
      const photoChanged = photoURL !== currentUser.photoURL;
      if (nameChanged || photoChanged) {
        await updateAuthorNameInPosts(
          currentUser.uid,
          displayName,
          photoURL,
          currentUser.plan,
        );
      }
      await refreshUser({ displayName, bio, position, team, role, photoURL, avatarColor });
      Alert.alert('保存完了', 'プロフィールを更新しました', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('エラー', 'プロフィールの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>プロフィール編集</Text>

      <TouchableOpacity style={styles.avatarContainer} onPress={handlePhotoPress} disabled={uploadingPhoto}>
        {photoURL ? (
          <Avatar.Image size={80} source={{ uri: photoURL }} />
        ) : (
          <Avatar.Text
            size={80}
            label={displayName.charAt(0) || currentUser?.displayName?.charAt(0) || '?'}
            style={[styles.avatarText, { backgroundColor: avatarBg }]}
          />
        )}
        {uploadingPhoto ? (
          <ActivityIndicator style={styles.cameraIcon} color={Colors.white} />
        ) : (
          <View style={styles.cameraIcon}>
            <MaterialCommunityIcons name="camera" size={16} color={Colors.white} />
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>アイコンのテーマカラー</Text>
      <Text style={styles.sectionHint}>画像未設定時の頭文字アイコンに適用されます</Text>
      <View style={styles.colorRow}>
        {AVATAR_COLOR_OPTIONS.map((option) => {
          const selected = avatarColor === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.colorSwatch,
                { backgroundColor: option.hex },
                selected && styles.colorSwatchSelected,
              ]}
              onPress={() => setAvatarColor(option.id)}
              accessibilityLabel={option.label}
            >
              {selected && (
                <MaterialCommunityIcons name="check" size={18} color={Colors.white} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput label="表示名" value={displayName} onChangeText={setDisplayName} mode="outlined" style={styles.input} />
      <TextInput label="自己紹介" value={bio} onChangeText={setBio} mode="outlined" style={styles.input} multiline numberOfLines={3} />
      <TextInput label="ポジション" value={position} onChangeText={setPosition} mode="outlined" style={styles.input} placeholder="例: 投手、遊撃手" />
      <TextInput label="チーム" value={team} onChangeText={setTeam} mode="outlined" style={styles.input} placeholder="例: 東京ジャイアンツ" />

      <Text style={styles.label}>役割</Text>
      <View style={styles.roleSelector}>
        {(
          [
            ['player', '選手'],
            ['manager', 'マネージャー'],
            ['coach', 'コーチ'],
            ['scout', 'スカウト'],
          ] as [UserRole, string][]
        ).map(([value, label], index) => {
          const isSelected = role === value;
          const isLeft = index % 2 === 0;
          const isTop = index < 2;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setRole(value)}
              style={[
                styles.roleButton,
                isSelected && styles.roleButtonSelected,
                isLeft ? styles.roleButtonLeft : styles.roleButtonRight,
                isTop ? styles.roleButtonTop : styles.roleButtonBottom,
              ]}
            >
              <Text
                style={[
                  styles.roleButtonLabel,
                  isSelected && styles.roleButtonLabelSelected,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button mode="contained" onPress={handleSave} loading={loading} disabled={loading || uploadingPhoto} style={styles.saveButton} buttonColor={Colors.primary}>
        変更を保存
      </Button>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, alignItems: 'center' },
  title: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  avatarText: { backgroundColor: Colors.primary },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 4,
  },
  sectionLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    alignSelf: 'flex-start',
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: Colors.text,
  },
  input: { marginBottom: Spacing.md, backgroundColor: Colors.card, width: '100%' },
  label: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  roleSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
    width: '100%',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  roleButton: {
    width: '50%',
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  roleButtonSelected: {
    backgroundColor: Colors.primary,
  },
  roleButtonLeft: {
    borderRightWidth: 0.5,
    borderRightColor: Colors.primary,
  },
  roleButtonRight: {
    borderLeftWidth: 0.5,
    borderLeftColor: Colors.primary,
  },
  roleButtonTop: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.primary,
  },
  roleButtonBottom: {},
  roleButtonLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  roleButtonLabelSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: { borderRadius: BorderRadius.lg, paddingVertical: 4, width: '100%' },
});
