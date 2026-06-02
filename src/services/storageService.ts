import {
  ref,
  uploadBytes,
  getDownloadURL as fbGetDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './firebase';
import { AppError } from '../models/types';

/**
 * Convert a local file URI to a Blob for upload.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Upload an image to Firebase Storage and return its download URL.
 * @param uri - Local file URI
 * @param path - Storage path (e.g. "users/abc/profile.jpg")
 */
export async function uploadImage(uri: string, path: string): Promise<string> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    const metadata = { contentType: 'image/jpeg' };
    await uploadBytes(storageRef, blob, metadata);
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
