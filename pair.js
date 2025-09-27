const { makeid } = require('./gen-id');
const express = require('express');
let router = express.Router();
const pino = require("pino");
const { default: makeWASocket, useSingleFileAuthState, delay, Browsers, makeCacheableSignalKeyStore, DisconnectReason } = require('@whiskeysockets/baileys')

// In-memory storage for sessions (for serverless)
const sessions = new Map();

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).send({ error: "Phone number is required" });
    }

    // Set timeout for Vercel (they have 10s timeout on free tier)
    res.setTimeout(25000, () => {
        if (!res.headersSent) {
            res.status(500).send({ error: "Request timeout" });
        }
    });

    async function KANGO_PAIR_CODE() {
        try {
            // Use in-memory auth state for serverless
            const { state, saveState } = useSingleFileAuthState(Buffer.from([]));
            
            var items = ["Safari", "Chrome", "Firefox"];
            function selectRandomItem(array) {
                var randomIndex = Math.floor(Math.random() * array.length);
                return array[randomIndex];
            }
            var randomItem = selectRandomItem(items);

            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.macOS(randomItem),
                version: [2, 2413, 1],
                // Serverless optimizations
                markOnlineOnConnect: false,
                syncFullHistory: false,
                transactionOpts: { maxCommitRetries: 1, delay: 100 }
            });

            if (!sock.authState.creds.registered) {
                await delay(1000);
                num = num.replace(/[^0-9]/g, '');
                
                try {
                    const code = await sock.requestPairingCode(num);
                    if (!res.headersSent) {
                        await res.send({ 
                            success: true, 
                            code: code,
                            instructions: "Go to WhatsApp → Linked Devices → Link a Device → Link with phone number",
                            note: "You have 30 seconds to enter the code"
                        });
                    }

                    // Store session in memory
                    sessions.set(id, { sock, saveState });

                    // Auto-cleanup after 30 seconds
                    setTimeout(() => {
                        if (sessions.has(id)) {
                            try {
                                sessions.get(id).sock.ws.close();
                                sessions.delete(id);
                            } catch (e) {}
                        }
                    }, 30000);

                } catch (pairError) {
                    console.error("Pairing error:", pairError);
                    if (!res.headersSent) {
                        await res.send({ 
                            success: false, 
                            error: "Failed to generate pairing code. Try again." 
                        });
                    }
                    return;
                }
            }

            sock.ev.on('creds.update', saveState);
            
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    if (!res.headersSent) {
                        await res.send({ 
                            success: true, 
                            connected: true,
                            message: "Successfully connected! Check your WhatsApp for session details."
                        });
                    }

                    await delay(2000);
                    try {
                        // Convert credentials to base64 for serverless
                        const credsBase64 = Buffer.from(JSON.stringify(sock.authState.creds)).toString('base64');
                        let sessionData = "KANGO~" + credsBase64;
                        
                        await sock.sendMessage(sock.user.id, { text: sessionData });
                        
                        let desc = `*Hello there KANGO-XMD User! 👋🏻* 

> Session generated successfully!

*Thanks for using KANGO-XMD 🚩* 

> Join WhatsApp Channel: 
https://whatsapp.com/channel/0029Va8YUl50bIdtVMYnYd0E

> *© Powered BY Hector Manuel 🖤*`; 

                        await sock.sendMessage(sock.user.id, { text: desc });

                    } catch (e) {
                        console.error("Message error:", e);
                    }
                    
                    // Close connection after sending session
                    await delay(1000);
                    try {
                        await sock.ws.close();
                        sessions.delete(id);
                    } catch (e) {}
                    
                } else if (connection === "close" && lastDisconnect) {
                    const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                    
                    if (!shouldReconnect && sessions.has(id)) {
                        sessions.delete(id);
                    }
                }
            });
            
        } catch (err) {
            console.log("Service error:", err);
            if (!res.headersSent) {
                await res.send({ success: false, error: "Service temporarily unavailable" });
            }
        }
    }
    
    return await KANGO_PAIR_CODE();
});

module.exports = router;