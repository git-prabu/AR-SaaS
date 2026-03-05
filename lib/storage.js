// lib/storage.js
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Upload a file with progress callback.
 * @param {File} file
 * @param {string} path - Storage path, e.g. restaurants/{id}/images/{name}
 * @param {function} onProgress - called with 0-100
 * @returns {Promise<string>} Download URL
 */
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

/** Returns file size in MB */
export function fileSizeMB(file) {
  return file.size / (1024 * 1024);
}

export function buildImagePath(restaurantId, filename) {
  return `restaurants/${restaurantId}/images/${Date.now()}_${filename}`;
}

export function buildModelPath(restaurantId, filename) {
  return `restaurants/${restaurantId}/models/${Date.now()}_${filename}`;
}
