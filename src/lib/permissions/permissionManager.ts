// ============================================================
// FieldSync Permission Manager
//
// Handles Camera, Microphone, and Geolocation permissions
// uniformly for Android TWA / PWA APK environments.
//
// Android TWA specifics:
//   - Permissions must be granted via navigator.permissions.query()
//   - getUserMedia() triggers the native Android permission dialog
//   - Geolocation triggers the native Android location dialog
//   - All permission states: 'granted' | 'denied' | 'prompt'
// ============================================================

export type PermissionType = 'camera' | 'microphone' | 'geolocation';

export interface PermissionStatus {
  camera: PermissionState | 'unknown';
  microphone: PermissionState | 'unknown';
  geolocation: PermissionState | 'unknown';
}

class PermissionManager {
  private _cache: Partial<PermissionStatus> = {};

  /**
   * Query the current state of a permission without triggering a prompt.
   */
  async query(type: PermissionType): Promise<PermissionState | 'unknown'> {
    try {
      const name = type === 'camera'
        ? ('camera' as PermissionName)
        : type === 'microphone'
        ? ('microphone' as PermissionName)
        : ('geolocation' as PermissionName);

      const result = await navigator.permissions.query({ name });
      this._cache[type] = result.state;
      return result.state;
    } catch {
      // Firefox/older Android WebView may not support permissions.query
      return 'unknown';
    }
  }

  /**
   * Query all permissions at once.
   */
  async queryAll(): Promise<PermissionStatus> {
    const [camera, microphone, geolocation] = await Promise.all([
      this.query('camera'),
      this.query('microphone'),
      this.query('geolocation'),
    ]);
    return { camera, microphone, geolocation };
  }

  /**
   * Request camera permission by attempting a brief getUserMedia call.
   * This triggers the native Android camera permission dialog.
   * Returns true if granted, false if denied.
   */
  async requestCamera(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Immediately stop — we only needed the grant
      stream.getTracks().forEach((t) => t.stop());
      this._cache.camera = 'granted';
      return true;
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        this._cache.camera = 'denied';
        return false;
      }
      // NotFoundError = no camera hardware (not a permission issue)
      this._cache.camera = 'denied';
      return false;
    }
  }

  /**
   * Request microphone permission by attempting a brief getUserMedia call.
   * Returns true if granted, false if denied.
   */
  async requestMicrophone(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this._cache.microphone = 'granted';
      return true;
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        this._cache.microphone = 'denied';
        return false;
      }
      this._cache.microphone = 'denied';
      return false;
    }
  }

  /**
   * Request geolocation permission by attempting getCurrentPosition.
   * Returns the position if granted, null if denied.
   */
  async requestGeolocation(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        resolve(null);
        return;
      }
      // 1. Try High Accuracy (GPS Satellites)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this._cache.geolocation = 'granted';
          resolve(pos);
        },
        (err) => {
          if (err.code === 1) {
            // Permission Denied
            this._cache.geolocation = 'denied';
            resolve(null);
            return;
          }
          // 2. Fallback to network / Wi-Fi geolocation if satellite GPS times out
          navigator.geolocation.getCurrentPosition(
            (posFallback) => {
              this._cache.geolocation = 'granted';
              resolve(posFallback);
            },
            () => {
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 5000 }
      );
    });
  }

  /**
   * Get the last cached state (no network call).
   */
  getCached(type: PermissionType): PermissionState | 'unknown' {
    return this._cache[type] ?? 'unknown';
  }
}

export const permissionManager = new PermissionManager();
