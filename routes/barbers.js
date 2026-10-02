const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// LIST + SEARCH: GET /barbers?search=rico
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    const [rows] = await pool.execute(
      `SELECT * FROM barbers
       WHERE first_name LIKE ? OR last_name LIKE ? OR specialty LIKE ?
       ORDER BY last_name`,
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );
    res.render('barbers/index', { barbers: rows, search, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// ADD FORM
router.get('/add', (req, res) => {
  res.render('barbers/form', { barber: { status: 'active' }, error: null, action: '/barbers/add' });
});

// ADD SAVE
router.post('/add', async (req, res) => {
  const { first_name, last_name, specialty, phone, status } = req.body;

  if (!first_name.trim() || !last_name.trim()) {
    return res.render('barbers/form', {
      barber: req.body, error: 'First name and last name are required.', action: '/barbers/add'
    });
  }
  // Status ay dapat 'active' o 'inactive' lang
  if (!['active', 'inactive'].includes(status)) {
    return res.render('barbers/form', {
      barber: req.body, error: 'Invalid status.', action: '/barbers/add'
    });
  }

  try {
    await pool.execute(
      'INSERT INTO barbers (first_name, last_name, specialty, phone, status) VALUES (?, ?, ?, ?, ?)',
      [first_name.trim(), last_name.trim(), specialty || null, phone || null, status]
    );
    res.redirect('/barbers');
  } catch (err) {
    console.error(err);
    res.render('barbers/form', {
      barber: req.body, error: 'Could not save the barber.', action: '/barbers/add'
    });
  }
});

// EDIT FORM
router.get('/edit/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM barbers WHERE barber_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/barbers');
    res.render('barbers/form', {
      barber: rows[0], error: null, action: `/barbers/edit/${req.params.id}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// EDIT SAVE
router.post('/edit/:id', async (req, res) => {
  const { first_name, last_name, specialty, phone, status } = req.body;

  if (!first_name.trim() || !last_name.trim() || !['active', 'inactive'].includes(status)) {
    return res.render('barbers/form', {
      barber: { ...req.body, barber_id: req.params.id },
      error: 'First name, last name, and a valid status are required.',
      action: `/barbers/edit/${req.params.id}`
    });
  }

  try {
    await pool.execute(
      'UPDATE barbers SET first_name = ?, last_name = ?, specialty = ?, phone = ?, status = ? WHERE barber_id = ?',
      [first_name.trim(), last_name.trim(), specialty || null, phone || null, status, req.params.id]
    );
    res.redirect('/barbers');
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not update the barber.');
  }
});

// DELETE
router.post('/delete/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM barbers WHERE barber_id = ?', [req.params.id]);
    res.redirect('/barbers');
  } catch (err) {
    // Business rule #8: may appointments na ang barber, friendly error lang
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      const [rows] = await pool.execute('SELECT * FROM barbers ORDER BY last_name');
      return res.render('barbers/index', {
        barbers: rows, search: '',
        error: 'Cannot delete: this barber has appointments on record. Set the status to inactive instead.'
      });
    }
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;