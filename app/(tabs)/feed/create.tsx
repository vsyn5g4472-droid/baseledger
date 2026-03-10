import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import CreatePost from '../../../src/components/CreatePost';
import { usePostActions } from '../../../src/hooks/usePosts';
import { useAuthGuard } from '../../../src/hooks/useAuthGuard';
import { Colors } from '../../../src/constants/theme';
import { CreatePostInput } from '../../../src/models/types';

export default function CreatePostScreen() {
  const { isAuthenticated } = useAuthGuard();
  const { createPost } = usePostActions();

  if (!isAuthenticated) return null;

  const handleSubmit = useCallback(
    async (input: CreatePostInput) => {
      await createPost(input);
      router.back();
    },
    [createPost],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, []);

  return (
    <View style={styles.container}>
      <CreatePost onSubmit={handleSubmit} onCancel={handleCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
