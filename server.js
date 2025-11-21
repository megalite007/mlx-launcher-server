/**
 * MLX Launcher Backend Server - COMPLET
 * Gestion réelle des téléchargements, installation de jeux, authentification
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const http = require('http');
const unzipper = require('unzipper');

const app = express();
const server = http.createServer(app);
const PORT = 3001;
const JWT_SECRET = 'mlx-launcher-secret-key-2024';

// ===== CONFIGURATION DOSSIERS =====
const GAMES_STORAGE = path.join(__dirname, 'games-storage');
const DATA_DIR = path.join(__dirname, 'data');

// Créer les dossiers
[GAMES_STORAGE, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Fichiers de données
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const DOWNLOADS_FILE = path.join(DATA_DIR, 'downloads.json');

// ===== CONFIGURATION MULTER =====
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, GAMES_STORAGE),
    filename: (req, file, cb) => cb(null, file.originalname)
  }),
  limits: { fileSize: 50 * 1024 * 1024 * 1024 } // 50GB max
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Servir les fichiers de jeux en téléchargement
app.use('/games-files', express.static(GAMES_STORAGE, {
  setHeaders: (res, path) => {
    res.setHeader('Content-Disposition', `attachment; filename="${path.split('\\').pop()}"`);
  }
}));

// ===== INITIALISATION DONNÉES =====
function initializeData() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(GAMES_FILE)) {
    const defaultGames = [
     {
  id: 1,
  name: 'my summer car',
  emoji: '💻',
  description: 'test',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=1kHwV-CIXxmYIhI6YVofFA4X83bzhdzDl',
  executable: 'setup.exe'
}
    ];
    fs.writeFileSync(GAMES_FILE, JSON.stringify(defaultGames, null, 2));
  }

  if (!fs.existsSync(DOWNLOADS_FILE)) {
    fs.writeFileSync(DOWNLOADS_FILE, JSON.stringify([], null, 2));
  }
}

initializeData();

// ===== HELPER FUNCTIONS =====
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ===== MIDDLEWARE AUTH =====
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.userId = decoded.userId;
  next();
}

// ===== ROUTES AUTHENTIFICATION =====

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Fields manquants' });
    }

    const users = readJSON(USERS_FILE);

    if (users.some(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Utilisateur déjà existant' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: Date.now().toString(),
      username,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      library: [],
      installPath: path.join(process.env.APPDATA || process.env.HOME, 'MLXGames')
    };

    users.push(newUser);
    writeJSON(USERS_FILE, users);

    // Créer le dossier d'installation
    if (!fs.existsSync(newUser.installPath)) {
      fs.mkdirSync(newUser.installPath, { recursive: true });
    }

    res.status(201).json({
      message: 'Inscription réussie',
      user: { id: newUser.id, username: newUser.username, email: newUser.email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Identifiants manquants' });
    }

    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username || u.email === username);

    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const token = generateToken(user.id);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        library: user.library || [],
        installPath: user.installPath
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROUTES JEUX =====

app.get('/api/games', (req, res) => {
  try {
    const games = readJSON(GAMES_FILE);
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/games/:id', (req, res) => {
  try {
    const games = readJSON(GAMES_FILE);
    const game = games.find(g => g.id === parseInt(req.params.id));
    if (!game) {
      return res.status(404).json({ error: 'Jeu non trouvé' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload d'un jeu (admin)
app.post('/api/games/upload', upload.single('game'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileSize = fs.statSync(req.file.path).size;
    
    res.json({
      message: 'Game file uploaded',
      file: req.file.originalname,
      size: formatBytes(fileSize)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ajouter un jeu à la liste
app.post('/api/games/add', (req, res) => {
  try {
    const { name, emoji, description, fileName, executable } = req.body;

    const games = readJSON(GAMES_FILE);
    
    // Vérifier que le fichier existe
    const filePath = path.join(GAMES_STORAGE, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Fichier du jeu non trouvé' });
    }

    const fileSize = fs.statSync(filePath).size;

    const newGame = {
      id: Math.max(...games.map(g => g.id), 0) + 1,
      name,
      emoji,
      description,
      size: formatBytes(fileSize),
      downloads: 0,
      rating: 0,
      fileName,
      executable,
      createdAt: new Date().toISOString()
    };

    games.push(newGame);
    writeJSON(GAMES_FILE, games);

    res.status(201).json({
      message: 'Jeu ajouté avec succès',
      game: newGame
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROUTES BIBLIOTHÈQUE =====

app.get('/api/library', authMiddleware, (req, res) => {
  try {
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const games = readJSON(GAMES_FILE);
    const library = games.filter(g => user.library.includes(g.id));

    res.json(library);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/library/add', authMiddleware, (req, res) => {
  try {
    const { gameId } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.userId);

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    if (user.library.includes(gameId)) {
      return res.status(400).json({ error: 'Jeu déjà dans la bibliothèque' });
    }

    user.library.push(gameId);
    writeJSON(USERS_FILE, users);

    res.json({ message: 'Jeu ajouté', library: user.library });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROUTES TÉLÉCHARGEMENTS =====

app.get('/api/downloads', authMiddleware, (req, res) => {
  try {
    const downloads = readJSON(DOWNLOADS_FILE);
    const userDownloads = downloads.filter(d => d.userId === req.userId);
    res.json(userDownloads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Créer un lien de téléchargement
app.post('/api/downloads/create', authMiddleware, (req, res) => {
  try {
    const { gameId } = req.body;
    const games = readJSON(GAMES_FILE);
    const users = readJSON(USERS_FILE);
    
    const game = games.find(g => g.id === gameId);
    const user = users.find(u => u.id === req.userId);

    if (!game) return res.status(404).json({ error: 'Jeu non trouvé' });
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const downloadLink = `http://localhost:${PORT}/games-files/${game.fileName}`;

    const download = {
      id: Date.now().toString(),
      userId: req.userId,
      gameId,
      gameName: game.name,
      fileName: game.fileName,
      executable: game.executable,
      downloadLink,
      status: 'ready',
      createdAt: new Date().toISOString()
    };

    const downloads = readJSON(DOWNLOADS_FILE);
    downloads.push(download);
    writeJSON(DOWNLOADS_FILE, downloads);

    res.json(download);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Marquer une installation comme complète
app.post('/api/downloads/complete', authMiddleware, (req, res) => {
  try {
    const { downloadId, installPath } = req.body;
    const downloads = readJSON(DOWNLOADS_FILE);
    const download = downloads.find(d => d.id === downloadId);

    if (!download) {
      return res.status(404).json({ error: 'Download not found' });
    }

    if (download.userId !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    download.status = 'installed';
    download.installPath = installPath;
    download.installedAt = new Date().toISOString();

    writeJSON(DOWNLOADS_FILE, downloads);

    // Ajouter à la bibliothèque
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.userId);
    if (!user.library.includes(download.gameId)) {
      user.library.push(download.gameId);
      writeJSON(USERS_FILE, users);
    }

    res.json({ message: 'Installation complétée', download });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== HEALTH CHECK =====

app.get('/api/health', (req, res) => {
  res.json({
    status: 'Server is running',
    port: PORT,
    gamesAvailable: readJSON(GAMES_FILE).length,
    timestamp: new Date().toISOString()
  });
});

// ===== START SERVER =====

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 MLX Launcher Server running on http://localhost:${PORT}`);
  console.log(`📂 Games storage: ${GAMES_STORAGE}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health\n`);
});
