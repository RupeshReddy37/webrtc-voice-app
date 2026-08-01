/**
 * Simple Toast Notification Manager
 */
const toastContainer = document.getElementById('toast-container');

/**
 * Shows a toast notification.
 * @param {string} message The message to display.
 * @param {'info' | 'success' | 'error'} type The type of toast.
 * @param {number} duration Duration in ms to show the toast.
 */
export function showToast(message, type = 'info', duration = 3000) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duration);
}