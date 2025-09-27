const { makeid } = require('./gen-id');
const express = require('express');
let router = express.Router();
const pino = require("pino");
const { 
    default: makeWASocket, 
    useSingleFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore, 
    DisconnectReason 
} = require('@whiskeysockets/baileys')

router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).json({ 
            success: false, 
            error: "Phone number is required. Use: /code?number=1234567890" 
        });
    }

    console.log('🔧 Starting pair process for number:', num);

    // Set timeout
    res.setTimeout(45000, () => {
        if (!res.headersSent) {
            res.json({ 
                success: false, 
                error: "Request timeout. Please try again." 
            });
        }
    });

    let sock = null;

    try {
        // Use in-memory auth state
        const { state, saveState } = useSingleFileAuthState();
        
        // Clean the number
        num = num.replace(/[^0-9]/g, '');
        
        if (num.length < 8) {
            return res.json({ 
                success: false, 
                error: "Invalid phone number format. Use country code + number" 
            });
        }

        console.log('📱 Cleaned number:', num);

        // Create socket connection
        sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino()),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'error' }),
            browser: Browsers.macOS("Safari"),
            markOnlineOnConnect: false,
            syncFullHistory: false,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 15000
        });

        console.log('✅ Socket created successfully');

        // Handle credentials update
        sock.ev.on('creds.update', saveState);

        // Handle connection updates
        sock.ev.on("connection.update", (update) => {
            console.log('🔄 Connection update:', update.connection);
            
            const { connection, lastDisconnect } = update;
            
            if (connection === "open") {
                console.log('✅ Connected to WhatsApp!');
                
                // Send success message and close connection
                setTimeout(async () => {
                    try {
                        await sock.sendMessage(sock.user.id, { 
                            text: `✅ KANGO-XMD Connected!\n\nSession generated successfully!\n\nThank you for using KANGO-XMD! 🚩` 
                        });
                        
                        await delay(1000);
                        if (sock.ws) {
                            sock.ws.close();
                        }
                    } catch (e) {
                        console.log('Message send error:', e);
                    }
                }, 2000);
            }
            
            if (connection === "close") {
                console.log('❌ Connection closed');
                const error = lastDisconnect?.error;
                if (error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log('Reconnecting...');
                }
            }
        });

        // Wait a bit for socket to initialize
        await delay(2000);

        console.log('🔄 Checking if registered...');
        
        if (!sock.authState.creds.registered) {
            console.log('📞 Requesting pairing code...');
            
            try {
                const pairingCode = await sock.requestPairingCode(num);
                console.log('✅ Pairing code generated:', pairingCode);
                
                return res.json({ 
                    success: true, 
                    code: pairingCode,
                    instructions: [
                        "1. Open WhatsApp on your phone",
                        "2. Go to Settings → Linked Devices", 
                        "3. Tap 'Link a Device' → 'Link with phone number'",
                        `4. Enter this code: ${pairingCode}`,
                        "5. Wait for confirmation"
                    ]
                });
                
            } catch (pairError) {
                console.error('❌ Pairing code error:', pairError);
                
                let errorMessage = "Failed to generate pairing code";
                if (pairError.message?.includes("rate limit")) {
                    errorMessage = "Rate limit exceeded. Please wait a few minutes.";
                } else if (pairError.message?.includes("invalid")) {
                    errorMessage = "Invalid phone number format. Use country code + number";
                } else if (pairError.message?.includes("timeout")) {
                    errorMessage = "Request timeout. Please try again.";
                }
                
                return res.json({ 
                    success: false, 
                    error: errorMessage 
                });
            }
        } else {
            return res.json({ 
                success: false, 
                error: "Already registered. Please use a new number or clear sessions." 
            });
        }

    } catch (error) {
        console.error('💥 Main error:', error);
        
        if (!res.headersSent) {
            return res.json({ 
                success: false, 
                error: "Service error: " + (error.message || "Unknown error occurred") 
            });
        }
    } finally {
        // Cleanup after 40 seconds
        setTimeout(() => {
            if (sock && sock.ws) {
                try {
                    sock.ws.close();
                    console.log('🧹 Connection cleaned up');
                } catch (e) {}
            }
        }, 40000);
    }
});

module.exports = router;