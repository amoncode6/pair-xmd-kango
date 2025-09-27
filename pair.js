const { makeid } = require('./gen-id');
const express = require('express');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useSingleFileAuthState, delay, Browsers, makeCacheableSignalKeyStore, DisconnectReason } = require('@whiskeysockets/baileys')

// In-memory storage for sessions
const sessions = new Map();

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ error: "Phone number is required" });
    }

    console.log('Received request for number:', num);

    // Set timeout for Vercel
    res.setTimeout(30000, () => {
        if (!res.headersSent) {
            res.status(500).json({ error: "Request timeout" });
        }
    });

    try {
        // Use in-memory auth state - FIXED: No parameters needed
        const { state, saveState } = useSingleFileAuthState();

        let sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            markOnlineOnConnect: false,
            syncFullHistory: false
        });

        console.log('Socket created, checking registration...');

        if (!sock.authState.creds.registered) {
            await delay(2000);
            // Clean the number
            num = num.replace(/[^0-9]/g, '');
            
            if (num.length < 10) {
                return res.status(400).json({ error: "Invalid phone number" });
            }

            console.log('Requesting pairing code for:', num);

            try {
                const code = await sock.requestPairingCode(num);
                console.log('Pairing code generated:', code);
                
                if (!res.headersSent) {
                    return res.json({ 
                        success: true, 
                        code: code,
                        instructions: [
                            "1. Open WhatsApp → Settings → Linked Devices",
                            "2. Tap on 'Link a Device'", 
                            "3. Tap on 'Link with phone number'",
                            `4. Enter this code: ${code}`,
                            "5. Wait for confirmation"
                        ]
                    });
                }

            } catch (pairError) {
                console.error("Pairing code error:", pairError);
                if (!res.headersSent) {
                    return res.json({ 
                        success: false, 
                        error: "Failed to generate pairing code. Please check the phone number format." 
                    });
                }
            }
        }

        sock.ev.on('creds.update', saveState);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            console.log('Connection update:', connection);

            if (connection === "open") {
                console.log('✅ Connected to WhatsApp successfully!');
                
                await delay(2000);
                try {
                    // Send success message
                    await sock.sendMessage(sock.user.id, { 
                        text: `✅ KANGO-XMD Session Connected!\n\nYour session has been successfully generated.\n\nThank you for using KANGO-XMD! 🚩`
                    });

                    // Close connection after success
                    await delay(1000);
                    await sock.ws.close();
                    console.log('Connection closed after success');

                } catch (e) {
                    console.error("Message error:", e);
                }

            } else if (connection === "close" && lastDisconnect) {
                console.log('Connection closed');
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                
                if (!shouldReconnect) {
                    console.log('Logged out, not reconnecting');
                }
            }
        });

        // Store session
        sessions.set(id, { sock, saveState });

        // Auto-cleanup after 60 seconds
        setTimeout(() => {
            if (sessions.has(id)) {
                try {
                    sessions.get(id).sock.ws.close();
                    sessions.delete(id);
                    console.log('Session cleaned up');
                } catch (e) {}
            }
        }, 60000);

    } catch (err) {
        console.error("Service error:", err);
        if (!res.headersSent) {
            return res.status(500).json({ 
                success: false, 
                error: "Service temporarily unavailable. Please try again." 
            });
        }
    }
});

module.exports = router;