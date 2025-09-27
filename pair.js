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
        return res.status(400).send({ error: "Phone number is required" });
    }

    // Set timeout for Vercel
    res.setTimeout(30000, () => {
        if (!res.headersSent) {
            res.status(500).send({ error: "Request timeout" });
        }
    });

    async function KANGO_PAIR_CODE() {
        try {
            // Use in-memory auth state
            const { state, saveState } = useSingleFileAuthState();

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Safari"),
                // Remove version if causing issues
                markOnlineOnConnect: false,
                syncFullHistory: false,
                transactionOpts: { maxCommitRetries: 1, delay: 100 }
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');

                try {
                    const code = await sock.requestPairingCode(num);
                    console.log('Pairing code generated:', code);
                    
                    if (!res.headersSent) {
                        res.send({ 
                            success: true, 
                            code: code,
                            instructions: "Go to WhatsApp → Linked Devices → Link a Device → Link with phone number"
                        });
                    }

                    // Store session in memory
                    sessions.set(id, { sock, saveState });

                    // Auto-cleanup after 45 seconds
                    setTimeout(() => {
                        if (sessions.has(id)) {
                            try {
                                sessions.get(id).sock.ws.close();
                                sessions.delete(id);
                            } catch (e) {}
                        }
                    }, 45000);

                } catch (pairError) {
                    console.error("Pairing error:", pairError);
                    if (!res.headersSent) {
                        res.send({ 
                            success: false, 
                            error: "Failed to generate pairing code. Make sure the number is correct." 
                        });
                    }
                    return;
                }
            }

            sock.ev.on('creds.update', saveState);

            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;
                console.log('Connection update:', connection);

                if (connection === "open") {
                    console.log('Connected successfully');
                    
                    await delay(3000);
                    try {
                        // Send simple session data
                        const sessionData = "KANGO~" + Buffer.from(JSON.stringify(sock.authState.creds)).toString('base64');
                        
                        await sock.sendMessage(sock.user.id, { 
                            text: `Session ID: ${sessionData.substring(0, 50)}...\n\nCheck your messages for full session data.`
                        });

                        let desc = `*Hello there KANGO-XMD User! 👋🏻* 

✅ Session generated successfully!

*Thanks for using KANGO-XMD 🚩* 

> Join WhatsApp Channel: 
https://whatsapp.com/channel/0029Va8YUl50bIdtVMYnYd0E

> *© Powered BY Hector Manuel 🖤*`; 

                        await sock.sendMessage(sock.user.id, { text: desc });

                    } catch (e) {
                        console.error("Message error:", e);
                    }

                    // Close connection after sending session
                    await delay(2000);
                    try {
                        await sock.ws.close();
                        sessions.delete(id);
                    } catch (e) {}

                } else if (connection === "close" && lastDisconnect) {
                    console.log('Connection closed:', lastDisconnect.error);
                    const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (!shouldReconnect && sessions.has(id)) {
                        sessions.delete(id);
                    }
                }
            });

        } catch (err) {
            console.log("Service error:", err);
            if (!res.headersSent) {
                res.send({ 
                    success: false, 
                    error: "Service temporarily unavailable. Please try again in a moment." 
                });
            }
        }
    }

    // Start the pairing process
    KANGO_PAIR_CODE().catch(error => {
        console.error('Unhandled error:', error);
        if (!res.headersSent) {
            res.status(500).send({ 
                success: false, 
                error: "Internal server error" 
            });
        }
    });
});

module.exports = router;