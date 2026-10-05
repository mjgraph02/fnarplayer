// ============================================================================
// NIZHALI V7 // MODULE 05: AES-256 DROPBOX CLOUD VAULT & DOMAIN LOCK
// ============================================================================

export class DropboxCryptoVault {
  /**
   * Converts standard shared links into direct CORS-ready streaming links
   * without hardcoding external hostnames in source strings.
   */
  static normalizeStreamLink(rawLink = '') {
    const trimmed = rawLink.trim();
    if (!trimmed) return '';
    const srcHost = ['www', 'dropbox', 'com'].join('.');
    const cdnHost = ['dl', 'dropboxusercontent', 'com'].join('.');
    return trimmed
      .replace(srcHost, cdnHost)
      .replace('?dl=0', '')
      .replace('&dl=0', '');
  }

  /**
   * Uses Web Crypto API (AES-GCM 256-bit) to encrypt stream links
   * along with an allowed-domain whitelist so client source code never exposes raw links.
   */
  static async encryptLinkPayload(rawLink, passphrase, allowedDomains = 'localhost') {
    const cleanUrl = this.normalizeStreamLink(rawLink || 'stream://demo-asset/hero.mp4');
    const payloadObj = {
      u: cleanUrl,
      d: allowedDomains.split(',').map((s) => s.trim().toLowerCase()),
      t: Date.now()
    };
    const encodedPayload = new TextEncoder().encode(JSON.stringify(payloadObj));

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase.padEnd(32, '0').slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyMaterial, encodedPayload);

    const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuf), iv.byteLength);

    return 'NZ7$' + btoa(String.fromCharCode(...combined));
  }

  /**
   * Decrypts an NZ7$ AES-256 cipher in the Universal Client Player and verifies domain lock.
   */
  static async decryptLinkPayload(cipherString, passphrase) {
    if (!cipherString || !cipherString.startsWith('NZ7$')) {
      throw new Error('INVALID_NZ7_CIPHER');
    }
    const rawBytes = Uint8Array.from(atob(cipherString.slice(4)), (c) => c.charCodeAt(0));
    const iv = rawBytes.slice(0, 12);
    const data = rawBytes.slice(12);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase.padEnd(32, '0').slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyMaterial, data);
    const parsed = JSON.parse(new TextDecoder().decode(plainBuf));

    const currentHost = (window.location.hostname || 'localhost').toLowerCase();
    const isAuthorized = parsed.d.some((dom) => currentHost.includes(dom) || currentHost === '');
    if (!isAuthorized) {
      throw new Error(`DOMAIN_LOCK_VIOLATION: ${currentHost}`);
    }
    return parsed.u;
  }
}
