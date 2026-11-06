import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/notifications.js';
import { EmptyState } from './ui.jsx';

const typeTone = {
  SUBMITTED: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  INFO_REQUESTED: 'info',
  INFO_PROVIDED: 'info',
  UPDATED: 'pending',
  CANCELLED: 'cancelled',
  DOCUMENTS_ADDED: 'info',
};

function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });

  async function refresh() {
    try {
      setData(await notificationsApi.list());
    } catch {
      // Notifications are supplementary; the rest of the app remains usable.
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [location.pathname]);

  useEffect(() => {
    function closeOnOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  async function openNotification(notification) {
    if (!notification.isRead) {
      await notificationsApi.markRead(notification.id).catch(() => {});
      setData((current) => ({
        ...current,
        unread: Math.max(0, current.unread - 1),
        items: current.items.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      }));
    }
    setOpen(false);
    if (notification.leaveId) navigate(`/leaves/${notification.leaveId}`);
  }

  async function markAllRead() {
    await notificationsApi.markAllRead().catch(() => {});
    setData((current) => ({ unread: 0, items: current.items.map((item) => ({ ...item, isRead: true })) }));
  }

  return (
    <div className="notification-wrap" ref={rootRef}>
      <button
        className="notification-button"
        type="button"
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {data.unread > 0 && <span className="notification-count">{data.unread > 99 ? '99+' : data.unread}</span>}
      </button>
      {open && (
        <section className="notification-panel" aria-label="Notifications">
          <div className="notification-header">
            <h2>Notifications</h2>
            <button className="btn btn-sm btn-ghost" type="button" onClick={markAllRead} disabled={!data.unread}>
              Mark all as read
            </button>
          </div>
          {data.items.length ? (
            <div className="notification-list">
              {data.items.map((notification) => (
                <button
                  className={`notification-item ${notification.isRead ? '' : 'unread'}`}
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                >
                  <span className={`notification-dot notification-dot-${typeTone[notification.type] || 'neutral'}`} aria-hidden="true" />
                  <span className="notification-content">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <time dateTime={notification.createdAt}>{relativeTime(notification.createdAt)}</time>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon="🔔" title="You're all caught up" />
          )}
        </section>
      )}
    </div>
  );
}
