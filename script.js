class WhatsAppBotDashboard {
    constructor() {
        this.socket = io();
        this.qrInterval = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSocketListeners();
        this.checkStatus();
        this.loadContacts();
    }

    bindEvents() {
        // Modal events
        document.getElementById('sendMessageBtn').addEventListener('click', () => {
            this.openSendMessageModal();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeSendMessageModal();
        });

        document.getElementById('cancelSend').addEventListener('click', () => {
            this.closeSendMessageModal();
        });

        document.getElementById('sendMessage').addEventListener('click', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // QR refresh
        document.getElementById('refreshQr')?.addEventListener('click', () => {
            this.refreshQR();
        });

        // Form submit
        const sendForm = document.getElementById('sendMessageModal');
        if (sendForm) {
            sendForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }

        // Close modal on outside click
        document.addEventListener('click', (e) => {
            const modal = document.getElementById('sendMessageModal');
            const modalContent = document.querySelector('.modal-content');
            if (modal.classList.contains('show') && 
                !modalContent.contains(e.target) && 
                !e.target.closest('#sendMessageBtn')) {
                this.closeSendMessageModal();
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('qr', (qr) => {
            this.showQR(qr);
        });

        this.socket.on('status', (status) => {
            this.updateStatus(status);
        });

        this.socket.on('new_message', (message) => {
            this.addMessage(message);
        });

        this.socket.on('command_executed', (data) => {
            this.showNotification(`Command executed for ${data.phoneNumber}`, 'success');
        });

        this.socket.on('message_ack', (data) => {
            this.updateMessageStatus(data.id, data.ack);
        });
    }

    checkStatus() {
        fetch('/api/status')
            .then(response => response.json())
            .then(data => {
                this.updateStatus({
                    ready: data.ready,
                    message: data.ready ? 'WhatsApp connected!' : 'Connecting to WhatsApp...'
                });
            })
            .catch(error => {
                console.error('Error checking status:', error);
                this.updateStatus({ ready: false, message: 'Server error' });
            });
    }

    updateStatus(status) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const qrSection = document.getElementById('qrSection');
        const dashboard = document.getElementById('dashboard');

        statusText.textContent = status.message;
        
        if (status.ready) {
            statusIndicator.classList.remove('connecting');
            statusIndicator.classList.add('connected');
            statusIndicator.style.background = '#2ed573';
            
            if (qrSection) qrSection.classList.add('hidden');
            if (dashboard) dashboard.classList.add('show');
            
            this.loadContacts();
            this.showNotification('WhatsApp connected successfully!', 'success');
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('connecting');
            statusIndicator.style.background = '#ff4757';
            
            if (qrSection) qrSection.classList.remove('hidden');
            if (dashboard) dashboard.classList.remove('show');
        }
    }

    showQR(qr) {
        const qrElement = document.getElementById('qrCode');
        if (qrElement) {
            qrElement.innerHTML = `
                <canvas id="qrCanvas"></canvas>
                <div class="qr-overlay">
                    <i class="fas fa-qrcode"></i>
                    <p>Scan with WhatsApp</p>
                </div>
            `;
            
            // Generate QR code canvas
            const canvas = document.getElementById('qrCanvas');
            if (canvas) {
                QRCode.toCanvas(canvas, qr, {
                    width: 200,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                }, (error) => {
                    if (error) console.error('Error generating QR:', error);
                });
            }
        }
        
        this.startQRRefreshTimer();
    }

    startQRRefreshTimer() {
        if (this.qrInterval) clearInterval(this.qrInterval);
        
        this.qrInterval = setInterval(() => {
            if (document.getElementById('qrSection') && 
                !document.getElementById('qrSection').classList.contains('hidden')) {
                this.refreshQR();
            }
        }, 30000); // Refresh every 30 seconds
    }

    refreshQR() {
        // Trigger client reinitialization
        fetch('/api/status', { method: 'POST' });
        this.showNotification('Refreshing QR code...', 'info');
    }

    addMessage(message) {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        // Remove placeholder if exists
        const placeholder = messagesContainer.querySelector('.message-placeholder');
        if (placeholder) placeholder.remove();

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.type}`;
        messageElement.innerHTML = `
            <div class="message-avatar">
                ${message.from.substring(message.from.length - 2) || '?'}
            </div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-sender">${message.from}</span>
                    <span class="message-time">${this.formatTime(message.timestamp)}</span>
                </div>
                <div class="message-text">${this.escapeHtml(message.message)}</div>
                <span class="message-type ${message.type}">${message.type === 'incoming' ? 'Incoming' : 'Outgoing'}</span>
                ${message.id ? `<div class="message-id" data-id="${message.id}">ID: ${message.id}</div>` : ''}
            </div>
        `;

        messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
        
        // Auto scroll to top (newest messages)
        messagesContainer.scrollTop = 0;

        // Show notification for incoming messages
        if (message.type === 'incoming') {
            this.showNotification(`New message from ${message.from}`, 'info');
        }
    }

    updateMessageStatus(messageId, ack) {
        const messageElements = document.querySelectorAll(`[data-id="${messageId}"]`);
        messageElements.forEach(element => {
            const parent = element.closest('.message');
            let statusIcon = '';
            
            switch (ack) {
                case 1: // Sent
                    statusIcon = '📤';
                    break;
                case 2: // Delivered
                    statusIcon = '📨';
                    break;
                case 3: // Read
                    statusIcon = '📖';
                    break;
                default:
                    statusIcon = '⏳';
            }
            
            const statusElement = parent.querySelector('.message-time');
            if (statusElement) {
                statusElement.innerHTML += ` <span class="status-icon">${statusIcon}</span>`;
            }
        });
    }

    loadContacts() {
        fetch('/api/contacts')
            .then(response => response.json())
            .then(contacts => {
                this.displayContacts(contacts);
            })
            .catch(error => {
                console.error('Error loading contacts:', error);
                this.showNotification('Failed to load contacts', 'error');
            });
    }

    displayContacts(contacts) {
        const container = document.getElementById('contactsContainer');
        if (!container) return;

        // Remove placeholder
        const placeholder = container.querySelector('.contact-placeholder');
        if (placeholder) placeholder.remove();

        container.innerHTML = contacts.map(contact => `
            <div class="contact-card" data-contact="${contact.id}">
                <div class="contact-avatar">
                    ${contact.name.charAt(0).toUpperCase() || '?'}
                </div>
                <div class="contact-info">
                    <h4>${this.escapeHtml(contact.name)}</h4>
                    <div class="contact-number">${contact.id.replace('@c.us', '')}</div>
                    ${contact.unreadCount > 0 ? `
                        <div class="contact-unread">${contact.unreadCount}</div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.contact-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const contactId = card.dataset.contact.replace('@c.us', '');
                this.fillSendMessageForm(contactId);
                this.openSendMessageModal();
            });
        });
    }

    openSendMessageModal() {
        document.getElementById('sendMessageModal').classList.remove('hidden');
        document.getElementById('sendMessageModal').classList.add('show');
        document.getElementById('phoneNumber').focus();
    }

    closeSendMessageModal() {
        document.getElementById('sendMessageModal').classList.add('hidden');
        document.getElementById('sendMessageModal').classList.remove('show');
        document.getElementById('sendMessageForm').reset();
    }

    fillSendMessageForm(phoneNumber) {
        document.getElementById('phoneNumber').value = phoneNumber;
    }

    sendMessage() {
        const phoneNumber = document.getElementById('phoneNumber').value.trim();
        const messageText = document.getElementById('messageText').value.trim();

        if (!phoneNumber || !messageText) {
            this.showNotification('Please fill in all fields', 'error');
            return;
        }

        // Format phone number
        const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

        const messageData = {
            phoneNumber: formattedNumber,
            message: messageText
        };

        fetch('/api/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.closeSendMessageModal();
                this.showNotification('Message sent successfully!', 'success');
            } else {
                this.showNotification(data.error || 'Failed to send message', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        });
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
            <button class="notification-close">&times;</button>
        `;

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#2ed573' : type === 'error' ? '#ff4757' : '#3498db'};
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;

        // Add close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);

        document.body.appendChild(notification);

        // Add animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 18px;
                cursor: pointer;
                padding: 0;
                margin-left: auto;
                opacity: 0.8;
            }
            .notification-close:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load QRCode library dynamically
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    script.onload = () => {
        new WhatsAppBotDashboard();
    };
    document.head.appendChild(script);
});

// Global error handler
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
    // You can add global error notifications here
});
