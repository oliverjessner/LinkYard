import { toast as ojToast } from '../vendor/oj-designsystem/index.js';

export function createToast(root = document.body) {
  const notifications = new Set();

  function showToast(message, typeOrOptions = {}) {
    const options = typeof typeOrOptions === 'string' ? { type: typeOrOptions } : typeOrOptions;
    const notification = ojToast(message, {
      root,
      duration: 3200,
      dismissLabel: 'Dismiss notification',
      ...options,
    });
    notifications.add(notification);
    notification.element.addEventListener('oj:close', () => notifications.delete(notification), { once: true });
    return notification;
  }

  showToast.destroy = () => {
    for (const notification of notifications) notification.dismiss();
    notifications.clear();
  };
  return showToast;
}
