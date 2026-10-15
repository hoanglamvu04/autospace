'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ProviderConnection = {
  id: string;
  name: string;
  provider: 'FACEBOOK_PAGE' | 'WEBSITE';
  status: string;
  externalAccountId: string | null;
  lastError: string | null;
};

type PublishResult = {
  published: boolean;
  page: { id: string; name: string };
  postId: string;
  permalinkUrl: string | null;
  graphVersion: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `API trả về ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CONNECTED: 'Đã kết nối',
    DISCONNECTED: 'Chưa kiểm tra',
    EXPIRED: 'Token hết hạn',
    MISSING_PERMISSION: 'Thiếu quyền',
    ERROR: 'Lỗi',
  };
  return labels[status] ?? status;
}

export default function LivePublishPage() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [result, setResult] = useState<PublishResult | null>(null);

  const facebookConnections = useMemo(
    () => connections.filter((item) => item.provider === 'FACEBOOK_PAGE'),
    [connections],
  );

  const selected = facebookConnections.find((item) => item.id === connectionId) ?? null;

  async function loadConnections(preferred?: string) {
    const list = await request<ProviderConnection[]>('/connections');
    setConnections(list);
    const fb = list.filter((item) => item.provider === 'FACEBOOK_PAGE');
    const next = preferred && fb.some((item) => item.id === preferred) ? preferred : fb[0]?.id ?? '';
    setConnectionId(next);
  }

  useEffect(() => {
    loadConnections()
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được connections'))
      .finally(() => setLoading(false));
  }, []);

  async function testConnection() {
    if (!selected) return;
    setTesting(true);
    setError('');
    setSuccess('');
    setResult(null);
    try {
      const tested = await request<ProviderConnection & { message?: string }>(`/connections/${selected.id}/test`, {
        method: 'POST',
      });
      await loadConnections(selected.id);
      if (tested.status !== 'CONNECTED') {
        throw new Error(tested.message || tested.lastError || 'Meta chưa xác nhận connection');
      }
      setSuccess(tested.message || 'Meta xác nhận Page access token hợp lệ.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể test Meta');
    } finally {
      setTesting(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const text = message.trim();
    if (!text) return;

    const approved = window.confirm(
      `ĐĂNG THẬT lên Facebook Page “${selected.name}”?\n\nNội dung:\n${text.slice(0, 500)}${text.length > 500 ? '…' : ''}`,
    );
    if (!approved) return;

    setPublishing(true);
    setError('');
    setSuccess('');
    setResult(null);
    try {
      const published = await request<PublishResult>(`/connections/${selected.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ message: text, link: link.trim() || null }),
      });
      setResult(published);
      setSuccess(`Đã đăng thật lên ${published.page.name}. Post ID: ${published.postId}`);
      await loadConnections(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng lên Facebook Page');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f3f5ef', padding: '32px 20px 64px', color: '#11281d' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <a href="/" style={{ color: '#466954', textDecoration: 'none', fontWeight: 700 }}>← AutoSpace Dashboard</a>

        <header style={{ margin: '28px 0 24px' }}>
          <p style={{ letterSpacing: 2, fontSize: 12, fontWeight: 800, color: '#758173', marginBottom: 8 }}>FACEBOOK PAGE PROVIDER V1</p>
          <h1 style={{ fontSize: 42, lineHeight: 1.05, margin: 0 }}>Đăng bài thật lên Facebook Page</h1>
          <p style={{ maxWidth: 760, fontSize: 17, lineHeight: 1.6, color: '#647268' }}>
            Trang này gọi Meta Graph API thật. “Test Meta thật” chỉ kiểm tra Page ID + token. “Đăng thật” sẽ tạo bài viết công khai trên Page đã chọn.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .85fr) minmax(0, 1.15fr)', gap: 22 }}>
          <article style={{ background: '#10271d', color: 'white', padding: 28, borderRadius: 24, alignSelf: 'start' }}>
            <p style={{ marginTop: 0, color: '#bcd5c0', fontWeight: 800, fontSize: 12, letterSpacing: 1.5 }}>CONNECTION</p>
            <label style={{ display: 'grid', gap: 8, fontWeight: 700 }}>
              Facebook Page
              <select
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                disabled={loading}
                style={{ padding: 14, borderRadius: 12, border: 0, fontSize: 16 }}
              >
                {facebookConnections.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} · {statusLabel(item.status)}</option>
                ))}
              </select>
            </label>

            {selected ? (
              <div style={{ marginTop: 20, padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.08)' }}>
                <strong style={{ display: 'block', fontSize: 20 }}>{selected.name}</strong>
                <span style={{ display: 'block', color: '#bdd0c3', marginTop: 5 }}>Page ID: {selected.externalAccountId ?? 'chưa có'}</span>
                <span style={{ display: 'block', color: '#bdd0c3', marginTop: 5 }}>Trạng thái: {statusLabel(selected.status)}</span>
                {selected.lastError && <p style={{ color: '#ffd0c8' }}>{selected.lastError}</p>}
              </div>
            ) : (
              <p>Chưa có Facebook Page connection.</p>
            )}

            <button
              onClick={() => void testConnection()}
              disabled={!selected || testing}
              style={{ width: '100%', marginTop: 18, padding: '14px 16px', borderRadius: 13, border: 0, fontWeight: 900, cursor: 'pointer' }}
            >
              {testing ? 'ĐANG GỌI META…' : '✓ TEST META THẬT'}
            </button>
          </article>

          <form onSubmit={publish} style={{ background: 'white', padding: 28, borderRadius: 24, border: '1px solid #dfe4db' }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fff1e8', color: '#9a3e1c', fontWeight: 800, marginBottom: 20 }}>
              ⚠ Đây là LIVE MODE. Nút cuối cùng sẽ đăng bài thật lên Facebook.
            </div>

            <label style={{ display: 'grid', gap: 8, fontWeight: 800 }}>
              Nội dung bài viết
              <textarea
                rows={10}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Nhập nội dung muốn đăng thật…"
                required
                style={{ resize: 'vertical', padding: 15, borderRadius: 13, border: '1px solid #cad3c8', font: 'inherit', lineHeight: 1.55 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 8, fontWeight: 800, marginTop: 16 }}>
              Link đính kèm (tùy chọn)
              <input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://holahalo.vn"
                style={{ padding: 14, borderRadius: 13, border: '1px solid #cad3c8', font: 'inherit' }}
              />
            </label>

            <button
              disabled={!selected || publishing || !message.trim()}
              style={{ width: '100%', marginTop: 22, padding: '17px 18px', borderRadius: 14, border: 0, background: '#d6f0ad', color: '#113220', fontWeight: 950, fontSize: 17, cursor: 'pointer' }}
            >
              {publishing ? 'ĐANG ĐĂNG LÊN META…' : '🚀 ĐĂNG THẬT LÊN FACEBOOK'}
            </button>

            {error && <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: '#ffe7e3', color: '#9c3026' }}>{error}</div>}
            {success && <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: '#e7f5df', color: '#315f31' }}>{success}</div>}
            {result?.permalinkUrl && (
              <a href={result.permalinkUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 14, color: '#1b5d38', fontWeight: 800 }}>
                Mở bài viết trên Facebook ↗
              </a>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
