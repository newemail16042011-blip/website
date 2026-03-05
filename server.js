// Simple Backend Server for Eid Mubarak Website
// This is a simple server that stores chat messages and file tracking data

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Simple JSON file-based database
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize database if not exists
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            messages: [],
            fileViews: [],
            userPermissions: {
                albumAccess: false,
                voiceAccess: false,
                albumAccessGrantedAt: null,
                voiceAccessGrantedAt: null
            },
            userAlbums: [],
            voiceRecordings: [],
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
}

// Read database
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { messages: [], fileViews: [], userPermissions: { albumAccess: false, voiceAccess: false }, userAlbums: [], voiceRecordings: [], lastUpdated: new Date().toISOString() };
    }
}

// Write database
function writeDB(data) {
    data.lastUpdated = new Date().toISOString();
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing to database:', err);
    }
}

// Get request body
function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            // Limit body size to 10MB for images/voice
            if (body.length > 10 * 1024 * 1024) {
                resolve({ error: 'Payload too large' });
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

// Serve static files from frontend folder
function serveStaticFile(res, filePath, contentType) {
    const frontendPath = path.join(__dirname, '..', 'frontend', filePath);
    fs.readFile(frontendPath, (err, data) => {
        if (!err) {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
            return;
        }
        // Fallback to root
        fs.readFile(path.join(__dirname, filePath), (err2, data2) => {
            if (err2) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data2);
        });
    });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = req.url.split('?')[0];

    // API Routes
    
    // Get all messages
    if (req.method === 'GET' && url === '/api/messages') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.messages));
        return;
    }

    // Send a message
    if (req.method === 'POST' && url === '/api/messages') {
        const body = await getRequestBody(req);
        
        if (body.error) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Message too large' }));
            return;
        }
        
        const db = readDB();
        
        const newMessage = {
            id: Date.now(),
            text: body.text || '',
            type: body.type || 'user',
            sender: body.sender || 'User',
            image: body.image || null,  // Base64 image
            voice: body.voice || null, // Base64 audio
            time: new Date().toISOString(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            seen: false
        };
        
        db.messages.push(newMessage);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newMessage));
        return;
    }

    // Mark messages as seen
    if (req.method === 'PUT' && url === '/api/messages/seen') {
        const db = readDB();
        
        db.messages.forEach(msg => {
            msg.seen = true;
        });
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Get file views tracking
    if (req.method === 'GET' && url === '/api/fileviews') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.fileViews));
        return;
    }

    // Track file view
    if (req.method === 'POST' && url === '/api/fileviews') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        const newView = {
            id: Date.now(),
            filename: body.filename || 'unknown',
            enteredAt: new Date().toISOString(),
            timeSpent: 0,
            userAgent: req.headers['user-agent'] || 'Unknown'
        };
        
        db.fileViews.push(newView);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newView));
        return;
    }

    // Update time spent on file
    if (req.method === 'PUT' && url === '/api/fileviews') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        const views = db.fileViews.filter(v => v.filename === body.filename);
        if (views.length > 0) {
            const lastView = views[views.length - 1];
            lastView.timeSpent = body.timeSpent || 0;
            lastView.leftAt = new Date().toISOString();
            writeDB(db);
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Delete message by ID
    if (req.method === 'DELETE' && url.startsWith('/api/messages/')) {
        const id = parseInt(url.split('/').pop());
        const db = readDB();
        
        db.messages = db.messages.filter(msg => msg.id !== id);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Clear all messages (admin action)
    if (req.method === 'DELETE' && url === '/api/messages') {
        const db = readDB();
        db.messages = [];
        writeDB(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Get user permissions
    if (req.method === 'GET' && url === '/api/permissions') {
        const db = readDB();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(db.userPermissions || { albumAccess: false, voiceAccess: false }));
        return;
    }

    // Grant album access to admin
    if (req.method === 'POST' && url === '/api/permissions/album') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        if (!db.userPermissions) {
            db.userPermissions = {};
        }
        
        db.userPermissions.albumAccess = body.grant || false;
        db.userPermissions.albumAccessGrantedAt = body.grant ? new Date().toISOString() : null;
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, permissions: db.userPermissions }));
        return;
    }

    // Grant voice access to admin
    if (req.method === 'POST' && url === '/api/permissions/voice') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        if (!db.userPermissions) {
            db.userPermissions = {};
        }
        
        db.userPermissions.voiceAccess = body.grant || false;
        db.userPermissions.voiceAccessGrantedAt = body.grant ? new Date().toISOString() : null;
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, permissions: db.userPermissions }));
        return;
    }

    // Get user albums (requires permission)
    if (req.method === 'GET' && url === '/api/albums') {
        const db = readDB();
        
        if (db.userPermissions && db.userPermissions.albumAccess) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(db.userAlbums || []));
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Album access not granted' }));
        }
        return;
    }

    // Add image/video to user album
    if (req.method === 'POST' && url === '/api/albums') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        const newAlbum = {
            id: Date.now(),
            type: body.type || 'image', // 'image' or 'video'
            media: body.media || null, // Base64 media data
            thumbnail: body.thumbnail || null,
            description: body.description || '',
            addedAt: new Date().toISOString()
        };
        
        if (!db.userAlbums) {
            db.userAlbums = [];
        }
        
        db.userAlbums.push(newAlbum);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newAlbum));
        return;
    }

    // Get voice recordings (requires permission)
    if (req.method === 'GET' && url === '/api/voice') {
        const db = readDB();
        
        if (db.userPermissions && db.userPermissions.voiceAccess) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(db.voiceRecordings || []));
        } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Voice access not granted' }));
        }
        return;
    }

    // Add voice recording
    if (req.method === 'POST' && url === '/api/voice') {
        const body = await getRequestBody(req);
        const db = readDB();
        
        const newVoice = {
            id: Date.now(),
            audio: body.audio || null,
            duration: body.duration || 0,
            recordedAt: new Date().toISOString()
        };
        
        if (!db.voiceRecordings) {
            db.voiceRecordings = [];
        }
        
        db.voiceRecordings.push(newVoice);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(newVoice));
        return;
    }

    // Delete voice recording
    if (req.method === 'DELETE' && url.startsWith('/api/voice/')) {
        const id = parseInt(url.split('/').pop());
        const db = readDB();
        
        if (!db.voiceRecordings) {
            db.voiceRecordings = [];
        }
        
        db.voiceRecordings = db.voiceRecordings.filter(rec => rec.id !== id);
        writeDB(db);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }

    // Serve static files from root directory
    const staticExtensions = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.mp4': 'video/mp4'
    };

    const ext = path.extname(url);
    if (staticExtensions[ext]) {
        serveStaticFile(res, url, staticExtensions[ext]);
        return;
    }

    // Serve admin folder files
    if (url.startsWith('/admin/')) {
        const filePath = url.replace('/admin/', '');
        serveStaticFile(res, 'admin/' + filePath, staticExtensions[path.extname(filePath)] || 'text/html');
        return;
    }

    // Default: serve index.html
    if (url === '/' || url === '/index.html') {
        serveStaticFile(res, 'index.html', 'text/html');
        return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

// Initialize database and start server
initDB();
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log('\nAPI Endpoints:');
    console.log('  GET    /api/messages     - Get all chat messages');
    console.log('  POST   /api/messages     - Send a message (supports text, image, voice)');
    console.log('  PUT    /api/messages/seen - Mark all messages as seen');
    console.log('  DELETE /api/messages     - Clear all messages');
    console.log('  GET    /api/fileviews    - Get file view tracking data');
    console.log('  POST   /api/fileviews    - Track file view');
    console.log('  PUT    /api/fileviews    - Update time spent on file');
    console.log('  GET    /api/permissions - Get user permissions');
    console.log('  POST   /api/permissions/album - Grant/revoke album access');
    console.log('  POST   /api/permissions/voice - Grant/revoke voice access');
    console.log('  GET    /api/albums      - Get user album (requires permission)');
    console.log('  POST   /api/albums      - Add image to album');
    console.log('  GET    /api/voice       - Get voice recordings (requires permission)');
    console.log('  POST   /api/voice       - Add voice recording');
    console.log('  DELETE /api/voice/:id   - Delete voice recording');
});
