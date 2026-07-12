import { describe, expect, it } from 'vitest';

import { decodeWindowMenuPayload, validateWindowMenuPayload } from './windowMenuPayload';

function encodePayload(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

describe('window menu payload validation', () => {
  it('accepts a well-formed payload', () => {
    const payload = {
      appId: 'running:vlc',
      sessionId: 'session-1',
      label: 'VLC',
      windows: [
        { id: '0x100', title: 'Playlist' },
        { id: '0x101', title: 'Video', isActive: true }
      ]
    };

    expect(validateWindowMenuPayload(payload)).toEqual(payload);
    expect(decodeWindowMenuPayload(encodePayload(payload))).toEqual(payload);
  });

  it('rejects malformed payloads', () => {
    expect(validateWindowMenuPayload(null)).toBeNull();
    expect(validateWindowMenuPayload({ appId: 1, label: 'VLC', windows: [] })).toBeNull();
    expect(validateWindowMenuPayload({ appId: 'vlc', label: 'VLC', windows: [] })).toBeNull();
    expect(validateWindowMenuPayload({ appId: 'vlc', label: 'VLC' })).toBeNull();
    expect(validateWindowMenuPayload({ appId: 'vlc', sessionId: 'session-1', label: 'VLC', windows: [{ id: '0x1' }] })).toBeNull();
    expect(validateWindowMenuPayload({ appId: 'vlc', sessionId: 'session-1', label: 'VLC', windows: [{ id: '0x1', title: 'VLC', isActive: 'yes' }] })).toBeNull();
    expect(decodeWindowMenuPayload('not valid base64')).toBeNull();
  });
});
