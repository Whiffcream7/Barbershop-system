const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./config/db');
const { requireLogin } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session: dito naka-store kung sino ang naka-login
app.use(session({
  secret: 'barbershop-secret-key',            // pang-sign ng session cookie
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }      // mag-e-expire pagkatapos ng 2 hours
}));

// Para magamit ng lahat ng .ejs pages ang naka-login na user bilang "currentUser"
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

pool.query('SELECT 1')
  .then(() => console.log('Database connected'))
  .catch(err => console.error('Database error:', err.message));

app.use('/', require('./routes/auth'));                       // /login at /logout
app.get('/', requireLogin, (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', requireLogin, (req, res) => res.render('dashboard'));

// Protected na ang customers: kailangan naka-login
app.use('/customers', requireLogin, require('./routes/customers'));

app.listen(3000, () => console.log('Server running at http://localhost:3000'));