import React, { useState } from 'react';
import { StyleSheet, ScrollView, Alert, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons, Avatar } from 'react-native-paper';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { updateUser } from '../../../src/services/userService';
import { updateAuthorNameInPosts } from '../../../src/services/postService';
import { uploadImage } from '../../../src/services/storageService';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const uploadPhoto = async (uri: string) => {
    if (!currentUser) return;
    setUploadingPhoto(true);
    try {
      const path = `users/${currentUser.uid}/avatar.jpg`;
      const url = await uploadImage(uri, path);
      setPhotoURL(url);
    } catch {
      Alert.alert('エラー', '写真のアップロードに失敗しました');
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
      await updateUser(currentUser.uid, { displayName, bio, position, team, role, photoURL });
      if (displayName !== currentUser.displayName || photoURL !== currentUser.photoURL) {
        await updateAuthorNameInPosts(currentUser.uid, displayName, photoURL);
      }
      await refreshUser({ displayName, bio, position, team, role, photoURL });
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>プロフィール編集</Text>

      <TouchableOpacity style={styles.avatarContainer} onPress={handlePhotoPress} disabled={uploadingPhoto}>
        {photoURL ? (
          <Avatar.Image size={80} source={{ uri: photoURL }} />
        ) : (
          <Avatar.Text size={80} label={currentUser?.displayName?.charAt(0) ?? '?'} style={styles.avatarText} />
        )}
        {uploadingPhoto ? (
          <ActivityIndicator style={styles.cameraIcon} color={Colors.white} />
        ) : (
          <View style={styles.cameraIcon}>
            <MaterialCommunityIcons name="camera" size={16} color={Colors.white} />
          </View>
        )}
      </TouchableOpacity>

      <TextInput label="表示名" value={displayName} onChangeText={setDisplayName} mode="outlined" style={styles.input} />
      <TextInput label="自己紹介" value={bio} onChangeText={setBio} mode="outlined" style={styles.input} multiline numberOfLines={3} />
      <TextInput label="ポジション" value={position} onChangeText={setPosition} mode="outlined" style={styles.input} placeholder="例: 投手、遊撃手" />
      <TextInput label="チーム" value={team} onChangeText={setTeam} mode="outlined" style={styles.input} placeholder="例: 東京ジャイアンツ" />

      <Text style={styles.label}>役割</Text>
      <SegmentedButtons
        value={role}
        onValueChange={(v) => setRole(v as UserRole)}
        buttons={[
          { value: 'player', label: '選手' },
          { value: 'scout', label: 'スカウト' },
          { value: 'coach', label: 'コーチ' },
          { value: 'manager', label: 'マネージャー' },
        ]}
        style={styles.roleSelector}
      />

      <Button mode="contained" onPress={handleSave} loading={loading} disabled={loading || uploadingPhoto} style={styles.saveButton} buttonColor={Colors.primary}>
        変更を保存
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, alignItems: 'center' },
  title: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg, alignSelf: 'flex-start' },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
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
  input: { marginBottom: Spacing.md, backgroundColor: Colors.card, width: '100%' },
  label: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm, alignSelf: 'flex-start' },
  roleSelector: { marginBottom: Spacing.lg, width: '100%' },
  saveButton: { borderRadius: BorderRadius.lg, paddingVertical: 4, width: '100%' },
});
