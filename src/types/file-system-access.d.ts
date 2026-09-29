/**
 * File System Access members TypeScript's lib.dom does not declare yet.
 *
 * `FileSystemDirectoryHandle` exists in lib.dom, but without its async
 * iterator or the permission methods, and `showDirectoryPicker` is absent
 * entirely. Declared here rather than cast at each call site, so the compiler
 * still checks the shapes.
 *
 * Chromium-only APIs. Everything that uses them feature-detects first.
 * Spec: https://wicg.github.io/file-system-access/
 */

type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface DirectoryPickerOptions {
  /** Remembers the last folder per id, so a re-pick starts in the right place. */
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?: FileSystemHandle | string;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
