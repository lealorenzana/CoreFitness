import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Send, Users, User, Dumbbell, Plus, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { showSuccessToast, showErrorToast } from '../utils/toast';

type RecipientType = 'all_members' | 'all_trainers' | 'specific_user';
type NotificationType = 'info' | 'event' | 'system' | 'payment' | 'achievement';

interface NotificationForm {
  recipientType: RecipientType;
  specificUsers: string[];
  notificationType: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
}

export default function Notifications() {
  const [showSendModal, setShowSendModal] = useState(false);
  const [form, setForm] = useState<NotificationForm>({
    recipientType: 'all_members',
    specificUsers: [],
    notificationType: 'info',
    title: '',
    message: '',
    actionUrl: '',
  });

  const [recentNotifications] = useState([
    {
      id: '1',
      title: 'Gym Schedule Update',
      message: 'G-Fitness will open 1 hour early on weekends starting next month.',
      recipients: 'All Members',
      sentAt: '2 hours ago',
      type: 'info',
    },
    {
      id: '2',
      title: 'New Event: Yoga Class',
      message: 'Join our special yoga session this Saturday at 9 AM.',
      recipients: 'All Members',
      sentAt: '1 day ago',
      type: 'event',
    },
    {
      id: '3',
      title: 'Schedule Reminder',
      message: 'You have sessions scheduled for tomorrow.',
      recipients: 'All Trainers',
      sentAt: '2 days ago',
      type: 'info',
    },
  ]);

  const handleSendNotification = () => {
    if (!form.title || !form.message) {
      showErrorToast('Please fill in all required fields');
      return;
    }

    // In a real app, this would call an API
    console.log('Sending notification:', form);
    
    showSuccessToast('Notification sent successfully!');
    setShowSendModal(false);
    setForm({
      recipientType: 'all_members',
      specificUsers: [],
      notificationType: 'info',
      title: '',
      message: '',
      actionUrl: '',
    });
  };

  const getRecipientLabel = (type: RecipientType) => {
    switch (type) {
      case 'all_members':
        return 'All Members';
      case 'all_trainers':
        return 'All Trainers';
      case 'specific_user':
        return 'Specific Users';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Send notifications to members and trainers
          </p>
        </div>
        <Button onClick={() => setShowSendModal(true)}>
          <Plus size={18} />
          Send Notification
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-primary-light)' }}
            >
              <Send size={20} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">156</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Total Sent
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--color-secondary-light)' }}
            >
              <Users size={20} style={{ color: 'var(--color-secondary)' }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">342</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Total Recipients
              </p>
            </div>
          </div>
        </Card>

        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: '#10b98120' }}
            >
              <Bell size={20} style={{ color: '#10b981' }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">89%</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Read Rate
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Notifications */}
      <Card title="Recent Notifications">
        <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {recentNotifications.map((notif) => (
            <div key={notif.id} className="p-4 hover:bg-white/5 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-white font-semibold">{notif.title}</h4>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                      style={{
                        background: 'var(--color-primary-light)',
                        color: 'var(--color-primary)',
                      }}
                    >
                      {notif.type}
                    </span>
                  </div>
                  <p className="text-sm mb-2" style={{ color: 'var(--color-text-muted)' }}>
                    {notif.message}
                  </p>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span>📤 {notif.recipients}</span>
                    <span>•</span>
                    <span>{notif.sentAt}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Send Notification Modal */}
      <Modal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        title="Send Notification"
        maxWidth="600px"
      >
        <div className="space-y-4">
          {/* Recipient Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Recipients</label>
            <div className="grid grid-cols-3 gap-2">
              {(['all_members', 'all_trainers', 'specific_user'] as RecipientType[]).map((type) => {
                const isActive = form.recipientType === type;
                const Icon = type === 'all_members' ? Users : type === 'all_trainers' ? Dumbbell : User;
                
                return (
                  <button
                    key={type}
                    onClick={() => setForm({ ...form, recipientType: type })}
                    className="p-3 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: isActive ? 'var(--color-primary)' : 'var(--color-surface-raised)',
                      border: `1px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      color: isActive ? '#fff' : 'var(--color-text-secondary)',
                    }}
                  >
                    <Icon size={16} className="mx-auto mb-1" />
                    {getRecipientLabel(type)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Type</label>
            <select
              value={form.notificationType}
              onChange={(e) => setForm({ ...form, notificationType: e.target.value as NotificationType })}
              className="w-full px-3 py-2 rounded-xl text-white"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
              }}
            >
              <option value="info">Info</option>
              <option value="event">Event</option>
              <option value="system">System</option>
              <option value="payment">Payment</option>
              <option value="achievement">Achievement</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Enter notification title"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="Enter notification message"
              rows={4}
              className="w-full px-3 py-2 rounded-xl text-white resize-none"
              style={{
                background: 'var(--color-surface-raised)',
                border: '1px solid var(--color-border)',
              }}
            />
          </div>

          {/* Action URL (Optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Action URL (Optional)</label>
            <Input
              value={form.actionUrl}
              onChange={(e) => setForm({ ...form, actionUrl: e.target.value })}
              placeholder="/member/events"
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Where users will be redirected when they tap the notification
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowSendModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSendNotification} className="flex-1">
              <Send size={16} />
              Send Notification
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
