const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const publicDir = __dirname;
const PORT = 18181;
let lastHeartbeat = Date.now() + 10000; // 10 seconds grace period on startup

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Handle heartbeat ping
  if (req.url === '/ping') {
    lastHeartbeat = Date.now();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
    return;
  }

  // Decode URL in case of encoded Korean filenames (e.g. 화상회의기록V1.0.html)
  let decodedUrl = '';
  try {
    decodedUrl = decodeURIComponent(req.url);
  } catch (e) {
    decodedUrl = req.url;
  }

  // Set file to serve
  const targetPath = decodedUrl === '/' ? 'index.html' : decodedUrl;
  let filePath = path.join(publicDir, targetPath);

  // Simple directory traversal protection
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end('Access Denied');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('File Not Found');
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Single-instance handling: check if port is already in use
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. App server is running. Launching Chrome...`);
    launchChrome();
    // Exit this process shortly since another process is already serving the files
    setTimeout(() => process.exit(0), 1000);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Start the server
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  launchChrome();

  // Monitor client heartbeat to shut down when all app windows are closed
  setInterval(() => {
    if (Date.now() - lastHeartbeat > 6000) {
      console.log('No heartbeat detected for 6 seconds. Shutting down server...');
      server.close();
      process.exit(0);
    }
  }, 2000);
});

// Launch Chrome in App Mode
function launchChrome() {
  const chromePaths = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['LocalAppData'] || 'C:\\Users\\Default\\AppData\\Local', 'Google/Chrome/Application/chrome.exe')
  ];

  let chromePath = null;
  for (const p of chromePaths) {
    if (fs.existsSync(p)) {
      chromePath = p;
      break;
    }
  }

  if (!chromePath) {
    chromePath = 'chrome'; // Rely on system PATH
  }

  const chromeArgs = [
    `--app=http://localhost:${PORT}/index.html`,
    `--window-size=800,800`,
    `--user-data-dir=${path.join(publicDir, '.chrome_profile')}`
  ];

  spawn(chromePath, chromeArgs, {
    detached: true,
    stdio: 'ignore'
  });
}

// Shut down server on process termination
process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
