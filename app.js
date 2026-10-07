const express = require('express');
const session = require('express-session');
const path = require('path');
const pool = require('./config/db');
const { requireLogin, requireRole } = require('./middleware/auth');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session: stores who is logged in
app.use(session({
  secret: 'barbershop-secret-key',            // used to sign the session cookie
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 }      // expires after 2 hours
}));

// so every .ejs page can use the logged-in user as "currentUser"
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

pool.query('SELECT 1')
  .then(() => console.log('Database connected'))
  .catch(err => console.error('Database error:', err.message));

app.use('/', require('./routes/auth'));                       // /login and /logout
app.get('/', requireLogin, (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', requireLogin, (req, res) => res.render('dashboard'));

// Protected: must be logged in
app.use('/customers', requireLogin, require('./routes/customers'));

// Protected: admin and staff only
app.use('/appointments', requireRole('admin', 'staff'), require('./routes/appointments'));
app.use('/queue', requireRole('admin', 'staff'), require('./routes/queue'));
app.use('/payments', requireRole('admin', 'staff'), require('./routes/payments'));
app.use('/reports', requireRole('admin'), require('./routes/reports'));

// Admin only: barbers
app.use('/barbers', requireRole('admin'), require('./routes/barbers'));
app.use('/services', requireRole('admin'), require('./routes/services'));
// Admin only: user accounts
app.use('/users', requireRole('admin'), require('./routes/users'));

app.listen(3000, () => console.log('Server running at http://localhost:3000'));