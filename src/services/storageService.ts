import {
  ref,
  uploadBytes,
  getDownloadURL as fbGetDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';
import { AppError } from '../models/types';

/** ローカルURI（file:// 等）を Blob に変換 */
async function uriToBlob(uri: string): Promise<Blob> {
  try {
    const response = await fetch(uri);
    if (response.ok) {
      return await response.blob();
    }
  } catch {
    // fetch が失敗する環境向けフォールバック
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.response) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error('画像データの読み込みに失敗しました'));
      }
    };
    xhr.onerror = () => reject(new Error('画像データの読み込みに失敗しました'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri);
    xhr.send();
  });
}

/** プロフィール画像を users/{uid}/avatar.jpg にアップロード */
export async function uploadUserAvatar(uid: string, uri: string): Promise<string> {
  return uploadImage(uri, `users/${uid}/avatar.jpg`);
}

/**
 * Upload an image to Firebase Storage and return its download URL.
 * @param uri - Local file URI
 * @param path - Storage path (e.g. "users/abc/profile.jpg")
 */
function imageContentType(blob: Blob, uri: string): string {
  if (blob.type && blob.type.startsWith('image/')) return blob.type;
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export async function uploadImage(uri: string, path: string): Promise<string> {
  try {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, path);
    const contentType = imageContentType(blob, uri);
    await uploadBytes(storageRef, blob, { contentType });
    return await fbGetDownloadURL(storageRef);
  } catch (e: any) {
    console.error('uploadImage error:', e);
    throw new Error(`画像アップロード失敗: ${e?.message ?? e}`);
  }
}

/**
 * Upload a video to Firebase Storage and return its download URL.
 * @param uri - Local file URI
 * @param path - Storage path (e.g. "scores/abc/video.mp4")
 */
export async function uploadVideo(uri: string, path: string): Promise<string> {
  try {
    const blob = await uriToBlob(uri);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: 'video/mp4' });
    return fbGetDownloadURL(storageRef);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to upload video: ${(error as Error).message}`);
  }
}

/**
 * Delete a file from Firebase Storage.
 * @param path - Storage path to delete
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to delete file: ${(error as Error).message}`);
  }
}

/**
 * Get the download URL for a file in Firebase Storage.
 * @param path - Storage path
 */
export async function getDownloadURL(path: string): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    return fbGetDownloadURL(storageRef);
  } catch (error) {
    throw new AppError('NOT_FOUND', `File not found: ${path}`);
  }
}
