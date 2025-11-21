const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3001;
const GAMES_FILE = path.join(__dirname, 'data', 'games.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const DOWNLOADS_FILE = path.join(__dirname, 'data', 'downloads.json');
const GAMES_STORAGE = path.join(__dirname, 'games-storage');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Create necessary directories
[path.join(__dirname, 'data'), GAMES_STORAGE].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize JSON files
async function initializeFiles() {
  if (!fs.existsSync(GAMES_FILE)) {
    const defaultGames = [
      {
        id: 1,
        name: 'Cyber City 2077',
        emoji: '💻',
        description: 'RPG futuriste immersif',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=1kHwV-CIXxmYIhI6YVofFA4X83bzhdzDl',
        executable: 'setup.exe'
      },
      {
        id: 2,
        name: 'Dead Zone',
        emoji: '🧟',
        description: 'Survival zombie épique',
        downloadUrl: '',
        executable: 'setup.exe'
      },
      {
        id: 3,
        name: 'Lost Signal',
        emoji: '👻',
        description: 'Horror game terrifiant',
        downloadUrl: '',
        executable: 'setup.exe'
      },
      {
        id: 4,
        name: 'Shadow Quest',
        emoji: '⚔️',
        description: 'Action-Adventure intense',
        downloadUrl: '',
        executable: 'setup.exe'
      },
      {
        id: 5,
        name: 'Neon Nights',
        emoji: '🌃',
        description: 'Puzzle Platformer futuriste',
        downloadUrl: '',
        executable: 'setup.exe'
      },
      {
        id: 6,
        name: 'Space Escape',
        emoji: '🚀',
        description: 'Sci-Fi Adventure galactique',
        downloadUrl: '',
        executable: 'setup.exe'
      }
    ];
    fs.writeFileSync(GAMES_FILE, JSON.stringify(defaultGames, null, 2));
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(DOWNLOADS_FILE)) {
    fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify([], null, 2));
  }

  // Créer le compte admin
  const users = readJSON(USERS_FILE);
  if (!users.some(u => u.username === 'Admin')) {
    const adminPassword = await bcrypt.hash('MLXSTUDIO', 10);
    const adminUser = {
      id: 1,
      username: 'Admin',
      email: 'admin@mlxstudio.com',
      password: adminPassword,
      isAdmin: true,
      library: []
    };
    users.push(adminUser);
    writeJSON(USERS_FILE, users);
    console.log('✅ Compte admin créé: Admin / MLXSTUDIO');
  }
}

initializeFiles();

// Helper functions
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Middleware pour vérifier admin
function verifyAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === decoded.userId);

    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Accès admin requis' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide' });
  }
}

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  const games = readJSON(GAMES_FILE);
  res.json({
    status: 'Server is running',
    port: PORT,
    gamesAvailable: games.length,
    timestamp: new Date().toISOString()
  });
});

// ===== AUTH ROUTES =====

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

    const users = readJSON(USERS_FILE);
    
    if (users.some(u => u.email === email || u.username === username)) {
      return res.status(400).json({ error: 'Utilisateur déjà existant' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: Date.now(),
      username,
      email,
      password: hashedPassword,
      isAdmin: false,
      library: [],
      installPath: null
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    res.json({ success: true, message: 'Utilisateur créé avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username || u.email === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        installPath: user.installPath
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== GAMES ROUTES =====

app.get('/api/games', (req, res) => {
  try {
    const games = readJSON(GAMES_FILE);
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ADMIN ROUTES =====

app.post('/api/admin/add-game', verifyAdmin, async (req, res) => {
  try {
    const { name, emoji, description, downloadUrl, executable } = req.body;

    if (!name || !emoji || !downloadUrl) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const games = readJSON(GAMES_FILE);
    
    const newGame = {
      id: Math.max(...games.map(g => g.id), 0) + 1,
      name,
      emoji,
      description,
      downloadUrl,
      executable: executable || 'setup.exe'
    };

    games.push(newGame);
    writeJSON(GAMES_FILE, games);

    res.json({ success: true, game: newGame });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/update-game/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, emoji, description, downloadUrl, executable } = req.body;

    const games = readJSON(GAMES_FILE);
    const gameIndex = games.findIndex(g => g.id === parseInt(id));

    if (gameIndex === -1) {
      return res.status(404).json({ error: 'Jeu non trouvé' });
    }

    games[gameIndex] = {
      ...games[gameIndex],
      name: name || games[gameIndex].name,
      emoji: emoji || games[gameIndex].emoji,
      description: description || games[gameIndex].description,
      downloadUrl: downloadUrl || games[gameIndex].downloadUrl,
      executable: executable || games[gameIndex].executable
    };

    writeJSON(GAMES_FILE, games);
    res.json({ success: true, game: games[gameIndex] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/delete-game/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const games = readJSON(GAMES_FILE);
    const filteredGames = games.filter(g => g.id !== parseInt(id));

    if (filteredGames.length === games.length) {
      return res.status(404).json({ error: 'Jeu non trouvé' });
    }

    writeJSON(GAMES_FILE, filteredGames);
    res.json({ success: true, message: 'Jeu supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== DOWNLOADS ROUTES =====

app.post('/api/downloads/create', (req, res) => {
  try {
    const { gameId } = req.body;
    const games = readJSON(GAMES_FILE);
    const game = games.find(g => g.id === gameId);

    if (!game) {
      return res.status(404).json({ error: 'Jeu non trouvé' });
    }

    const downloads = readJSON(DOWNLOADS_FILE);

    const download = {
      id: Date.now(),
      gameId,
      gameName: game.name,
      downloadUrl: game.downloadUrl,
      executable: game.executable,
      progress: 0,
      status: 'downloading',
      createdAt: new Date().toISOString()
    };

    downloads.push(download);
    writeJSON(DOWNLOADS_FILE, downloads);

    res.json(download);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/downloads/complete', (req, res) => {
  try {
    const { downloadId, installPath } = req.body;
    const downloads = readJSON(DOWNLOADS_FILE);
    const download = downloads.find(d => d.id === downloadId);

    if (!download) {
      return res.status(404).json({ error: 'Téléchargement non trouvé' });
    }

    download.status = 'installed';
    download.installPath = installPath;
    writeJSON(DOWNLOADS_FILE, downloads);

    res.json({ success: true, message: 'Téléchargement complété' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/downloads', (req, res) => {
  try {
    const downloads = readJSON(DOWNLOADS_FILE);
    res.json(downloads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== LIBRARY ROUTES =====

app.get('/api/library', (req, res) => {
  try {
    const games = readJSON(GAMES_FILE);
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== START SERVER =====

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MLX Launcher Server running on http://localhost:${PORT}`);
  console.log(`📂 Games storage: ${GAMES_STORAGE}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
