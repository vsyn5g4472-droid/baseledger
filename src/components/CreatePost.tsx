import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { CreatePostInput } from '../models/types';

interface CreatePostProps {
  onSubmit: (input: CreatePostInput) => Promise<void>;
  onCancel: () => void;
}

export default function CreatePost({ onSubmit, onCancel }: CreatePostProps) {
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [externalVideoUrl, setExternalVideoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限エラー', 'カメラロールへのアクセスを許可してください。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const removeImage = () => setImageUri(null);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('入力エラー', '本文を入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      const type = externalVideoUrl.trim()
        ? 'video'
        : imageUri
        ? 'highlight'
        : 'text';

      await onSubmit({
        type,
        content: content.trim(),
        mediaURIs: imageUri ? [imageUri] : [],
        externalVideoUrl: externalVideoUrl.trim() || null,
        statsData: null,
        visibility: 'public',
        teamId: null,
      });
    } catch (e) {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = content.trim().length > 0 && !submitting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.title}>新しい投稿</Text>
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={styles.postBtn}
            labelStyle={styles.postBtnLabel}
            compact
          >
            投稿
          </Button>
        </View>

        {/* Content input */}
        <TextInput
          placeholder="今日の練習や試合について投稿しよう！"
          value={content}
          onChangeText={setContent}
          multiline
          style={styles.contentInput}
          mode="flat"
          underlineColor="transparent"
          activeUnderlineColor="transparent"
          maxLength={500}
        />
        <Text style={styles.charCount}>{content.length}/500</Text>

        {/* Image preview */}
        {imageUri && (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} />
            <TouchableOpacity style={styles.removeImageBtn} onPress={removeImage}>
              <MaterialCommunityIcons name="close-circle" size={28} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Image picker button */}
        <TouchableOpacity style={styles.mediaRow} onPress={pickImage}>
          <MaterialCommunityIcons name="image-plus" size={24} color={Colors.primary} />
          <Text style={styles.mediaLabel}>写真を追加</Text>
        </TouchableOpacity>

        {/* External video URL */}
        <View style={styles.videoSection}>
          <View style={styles.videoLabelRow}>
            <MaterialCommunityIcons name="youtube" size={22} color={Colors.secondary} />
            <Text style={styles.videoSectionLabel}>動画URL（YouTube / TikTok など）</Text>
          </View>
          <TextInput
            placeholder="https://www.youtube.com/watch?v=..."
            value={externalVideoUrl}
            onChangeText={setExternalVideoUrl}
            style={styles.videoInput}
            mode="outlined"
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            keyboardType="url"
            autoCapitalize="none"
            dense
          />
        </View>
      </ScrollView>

      {submitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>投稿中...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  cancelBtn: { padding: Spacing.xs },
  cancelText: { fontSize: Typography.body, color: Colors.textSecondary },
  title: { fontSize: Typography.h4, fontWeight: '700', color: Colors.text },
  postBtn: { backgroundColor: Colors.primary },
  postBtnLabel: { fontSize: Typography.bodySmall, fontWeight: '700' },
  contentInput: {
    backgroundColor: Colors.card,
    fontSize: Typography.body,
    lineHeight: 24,
    minHeight: 140,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  charCount: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
    paddingRight: Spacing.md,
    marginBottom: Spacing.sm,
  },
  imagePreviewWrap: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 220,
    resizeMode: 'cover',
  },
  removeImageBtn: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.overlay,
    borderRadius: BorderRadius.full,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  mediaLabel: {
    fontSize: Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
  videoSection: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  videoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  videoSectionLabel: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  videoInput: {
    backgroundColor: Colors.card,
    fontSize: Typography.bodySmall,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.white,
    fontSize: Typography.body,
    fontWeight: '600',
  },
});
