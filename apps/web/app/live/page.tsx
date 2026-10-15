'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import styles from './live.module.css';

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
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topline}>
          <a href="/" className={styles.back}>← Quay lại Campaign Hub</a>
          <span className={styles.brandChip}><i className={styles.brandDot} /> AutoSpace · Facebook Provider</span>
        </div>

        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FACEBOOK PAGE PROVIDER · LIVE</p>
            <h1>Đăng bài thật, nhưng vẫn kiểm soát từng bước.</h1>
            <p>Kiểm tra Page access token trước khi publish. AutoSpace chỉ đăng lên Page bạn đã kết nối và luôn yêu cầu xác nhận cuối cùng.</p>
          </div>
          <span className={styles.liveBadge}>LIVE MODE</span>
        </header>

        <section className={styles.workspace}>
          <aside className={styles.providerCard}>
            <div className={styles.providerTop}>
              <div>
                <span className={styles.providerLabel}>Connection</span>
                <h2>Facebook Page</h2>
              </div>
            </div>

            <label className={styles.selectLabel}>
              Tài khoản sử dụng
              <select
                className={styles.select}
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
                disabled={loading}
              >
                {facebookConnections.map((item) => (
                  <option value={item.id} key={item.id}>{item.name} · {statusLabel(item.status)}</option>
                ))}
              </select>
            </label>

            {selected ? (
              <div className={styles.account}>
                <div className={styles.accountHead}>
                  <span className={styles.avatar}>f</span>
                  <div>
                    <strong>{selected.name}</strong>
                    <small>Facebook Page</small>
                  </div>
                </div>
                <div className={styles.accountMeta}>
                  <div className={styles.metaRow}><span>Page ID</span><b>{selected.externalAccountId ?? 'Chưa có'}</b></div>
                  <div className={styles.metaRow}><span>Trạng thái</span><b>{statusLabel(selected.status)}</b></div>
                </div>
              </div>
            ) : (
              <div className={styles.emptyAccount}>Chưa có Facebook Page connection. Hãy quay lại mục Kết nối tài khoản để thêm Page.</div>
            )}

            <button
              className={styles.testButton}
              onClick={() => void testConnection()}
              disabled={!selected || testing}
            >
              {testing ? 'ĐANG KIỂM TRA META…' : '✓ TEST META THẬT'}
            </button>

            <div className={styles.securityNote}>
              <span className={styles.securityIcon}>⌁</span>
              <span>Token được đọc ở backend và không hiển thị lại trên trình duyệt.</span>
            </div>
          </aside>

          <form onSubmit={publish} className={styles.composer}>
            <div className={styles.composerTop}>
              <div>
                <h2>Bài viết mới</h2>
                <p>Soạn nội dung rồi xác nhận trước khi gửi sang Meta.</p>
              </div>
              <span className={styles.count}>{message.length} ký tự</span>
            </div>

            <div className={styles.warning}>
              <span className={styles.warningIcon}>!</span>
              <span>Đây là chế độ đăng thật. Sau khi xác nhận, bài viết sẽ xuất hiện công khai trên Facebook Page đã chọn.</span>
            </div>

            <label className={styles.field}>
              Nội dung bài viết
              <textarea
                className={styles.textarea}
                rows={9}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Nhập nội dung muốn đăng lên Page…"
                required
              />
            </label>

            <label className={`${styles.field} ${styles.inputWrap}`}>
              Link đính kèm <span style={{ fontWeight: 500, color: '#8a958e' }}>(tùy chọn)</span>
              <input
                className={styles.input}
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://holahalo.vn"
              />
            </label>

            <button
              className={styles.publishButton}
              disabled={!selected || publishing || !message.trim()}
            >
              {publishing ? 'ĐANG GỬI LÊN META…' : 'ĐĂNG THẬT LÊN FACEBOOK  →'}
            </button>

            {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}
            {success && <div className={`${styles.alert} ${styles.success}`}>{success}</div>}

            {result && (
              <div className={styles.resultCard}>
                <b>Đã publish thành công</b>
                <span>Post ID: {result.postId} · Graph API {result.graphVersion}</span>
                {result.permalinkUrl && (
                  <a href={result.permalinkUrl} target="_blank" rel="noreferrer" className={styles.postLink}>
                    Mở bài viết trên Facebook ↗
                  </a>
                )}
              </div>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
