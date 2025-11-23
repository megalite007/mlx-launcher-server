const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Auth routes (stub)
app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    token: 'test-token',
    user: {
      id: 1,
      username: 'Admin',
      email: 'admin@mlxstudio.com',
      isAdmin: true
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  res.json({
    success: true,
    message: 'User created'
  });
});

// Games route
app.get('/api/games', (req, res) => {
  res.json([
    {
      id: 1,
      name: 'Cyber City 2077',
      emoji: '💻',
      description: 'RPG futuriste',
      downloadUrl: 'https://drive.google.com/uc?export=download&id=1kHwV-CIXxmYIhI6YVofFA4X83bzhdzDl',
      executable: 'setup.exe'
    }
  ]);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MLX Launcher Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
