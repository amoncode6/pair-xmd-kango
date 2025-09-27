const express = require('express');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;

let server = require('./qr'),
    code = require('./pair');

// Increase limit
require('events').EventEmitter.defaultMaxListeners = 500;

// Routes
app.use('/server', server);
app.use('/code', code);

app.use('/pair', (req, res) => {
    res.sendFile(__path + '/pair.html')
})

app.use('/qr', (req, res) => {
    res.sendFile(__path + '/qr.html')
})

app.use('/', (req, res) => {
    res.sendFile(__path + '/main.html')
})

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`
🚀 Server running on http://localhost:${PORT}
📱 Pair code: http://localhost:${PORT}/code?number=YOUR_NUMBER
🔗 QR code: http://localhost:${PORT}/server
    `);
})

module.exports = app