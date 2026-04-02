// lib/saStorage.js — Firebase Storage helpers for Super Admin pages only.
//
// Uses superAdminStorage (tied to superAdminApp) so Storage security rules
// see request.auth = superadmin's token. Using storage (adminApp) from a
// superadmin session → request.auth = null → upload denied.

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { superAdminStorage as storage } from './firebase';

export function uploadFile(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

export async function deleteFile(path) {
  const storageRef = ref(storage, path);
  return deleteObject(storageRef);
}

export function fileSizeMB(file) {
  return file.size / (1024 * 1024);
}

export function buildImagePath(restaurantId, filename) {
  return `restaurants/${restaurantId}/images/${Date.now()}_${filename}`;
}

export function buildModelPath(restaurantId, filename) {
  return `restaurants/${restaurantId}/models/${Date.now()}_${filename}`;
}
