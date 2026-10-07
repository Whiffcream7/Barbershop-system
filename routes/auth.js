const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const pool = require('../config/db');

// LOGIN FORM: GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

// LOGIN SUBMIT: POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username.trim() || !password) {
    return res.render('login', { error: 'Username and password are required.' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT user_id, username, password_hash, full_name, role FROM users WHERE username = ?',
      [username.trim()]
    );

    // one generic message so nobody can tell if the username or password was wrong
    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid username or password.' });
    }

    const user = rows[0];

    // bcrypt compares the typed password with the hash in the database
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('login', { error: 'Invalid username or password.' });
    }

    // only save what we need in the session (NOT the password_hash)
    req.session.user = {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
});

// LOGOUT: GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;