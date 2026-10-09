const { getOrder } = require('../utils/sort');
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const pool = require('../config/db');

const SALT_ROUNDS = 10;   // how hard the hash is to crack

// LIST + SEARCH: GET /users?search=staff
// password_hash is not in the SELECT so it never shows on the page
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    const o = getOrder(req.query, {
        id: 'user_id',
        username: 'username',
        name: 'full_name',
        role: 'role',
        created: 'created_at'
      }, 'name');
    // HINDI isinasama ang password_hash sa SELECT
    const [rows] = await pool.execute(
      `SELECT user_id, username, full_name, role, created_at FROM users
       WHERE username LIKE ? OR full_name LIKE ?
       ORDER BY ${o.sql}`,
      [`%${search}%`, `%${search}%`]
    );
    res.render('users/index', { users: rows, search, error: null, order: o.key });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// ADD FORM
router.get('/add', (req, res) => {
  res.render('users/form', { user: { role: 'staff' }, error: null, action: '/users/add' });
});

// ADD SAVE
router.post('/add', async (req, res) => {
  const { username, full_name, password, role } = req.body;

  if (!username.trim() || !full_name.trim() || !password) {
    return res.render('users/form', {
      user: req.body, error: 'Username, full name, and password are required.', action: '/users/add'
    });
  }
  if (!['admin', 'staff'].includes(role)) {
    return res.render('users/form', { user: req.body, error: 'Invalid role.', action: '/users/add' });
  }

  try {
    // hash the password before saving, the plain password is never saved
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.execute(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username.trim(), hash, full_name.trim(), role]
    );
    res.redirect('/users');
  } catch (err) {
    // username is UNIQUE in the database
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('users/form', {
        user: req.body, error: 'That username is already taken.', action: '/users/add'
      });
    }
    console.error(err);
    res.render('users/form', { user: req.body, error: 'Could not save the user.', action: '/users/add' });
  }
});

// EDIT FORM
router.get('/edit/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT user_id, username, full_name, role FROM users WHERE user_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.redirect('/users');
    res.render('users/form', { user: rows[0], error: null, action: `/users/edit/${req.params.id}` });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// EDIT SAVE (if the password is blank, it is not changed)
router.post('/edit/:id', async (req, res) => {
  const { username, full_name, password, role } = req.body;
  const editingSelf = Number(req.params.id) === req.session.user.user_id;
  const formData = { ...req.body, user_id: req.params.id };

  if (!username.trim() || !full_name.trim() || !['admin', 'staff'].includes(role)) {
    return res.render('users/form', {
      user: formData, error: 'Username, full name, and a valid role are required.',
      action: `/users/edit/${req.params.id}`
    });
  }
  // so the admin can't lock themselves out
  if (editingSelf && role !== 'admin') {
    return res.render('users/form', {
      user: formData, error: 'You cannot remove your own admin role.',
      action: `/users/edit/${req.params.id}`
    });
  }

  try {
    if (password) {
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      await pool.execute(
        'UPDATE users SET username = ?, full_name = ?, role = ?, password_hash = ? WHERE user_id = ?',
        [username.trim(), full_name.trim(), role, hash, req.params.id]
      );
    } else {
      await pool.execute(
        'UPDATE users SET username = ?, full_name = ?, role = ? WHERE user_id = ?',
        [username.trim(), full_name.trim(), role, req.params.id]
      );
    }
    if (editingSelf) {
      req.session.user.username = username.trim();
      req.session.user.full_name = full_name.trim();
    }
    res.redirect('/users');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.render('users/form', {
        user: formData, error: 'That username is already taken.', action: `/users/edit/${req.params.id}`
      });
    }
    console.error(err);
    res.status(500).send('Could not update the user.');
  }
});

// DELETE
router.post('/delete/:id', async (req, res) => {
  // you can't delete your own account while logged in
  if (Number(req.params.id) === req.session.user.user_id) {
    const [rows] = await pool.execute(
      'SELECT user_id, username, full_name, role, created_at FROM users ORDER BY username'
    );
    return res.render('users/index', {
      users: rows, search: '', error: 'You cannot delete your own account while logged in.'
    });
  }

  try {
    await pool.execute('DELETE FROM users WHERE user_id = ?', [req.params.id]);
    res.redirect('/users');
  } catch (err) {
    // Business rule #8: the user already has appointments or payments, so show a friendly error
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      const [rows] = await pool.execute(
        'SELECT user_id, username, full_name, role, created_at FROM users ORDER BY username'
      );
      return res.render('users/index', {
        users: rows, search: '',
        error: 'Cannot delete: this user has appointments or payments on record.'
      });
    }
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;