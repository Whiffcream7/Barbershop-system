const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// LIST + SEARCH: GET /customers?search=juan
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    // Prepared statement: ang ? ay pumapalit ng value, hindi sinasama sa SQL string (iwas SQL injection)
    const [rows] = await pool.execute(
      `SELECT * FROM customers
       WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
       ORDER BY last_name`,
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );
    res.render('customers/index', { customers: rows, search, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// ADD FORM: GET /customers/add
router.get('/add', (req, res) => {
  res.render('customers/form', { customer: {}, error: null, action: '/customers/add' });
});

// ADD SAVE: POST /customers/add
router.post('/add', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;

  // Server-side validation
  if (!first_name.trim() || !last_name.trim() || !phone.trim()) {
    return res.render('customers/form', {
      customer: req.body, error: 'First name, last name, and phone are required.', action: '/customers/add'
    });
  }

  try {
    await pool.execute(
      'INSERT INTO customers (first_name, last_name, phone, email) VALUES (?, ?, ?, ?)',
      [first_name.trim(), last_name.trim(), phone.trim(), email || null]
    );
    res.redirect('/customers');
  } catch (err) {
    console.error(err);
    res.render('customers/form', {
      customer: req.body, error: 'Could not save the customer.', action: '/customers/add'
    });
  }
});

// EDIT FORM: GET /customers/edit/:id
router.get('/edit/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM customers WHERE customer_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/customers');
    res.render('customers/form', {
      customer: rows[0], error: null, action: `/customers/edit/${req.params.id}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// EDIT SAVE: POST /customers/edit/:id
router.post('/edit/:id', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;

  if (!first_name.trim() || !last_name.trim() || !phone.trim()) {
    return res.render('customers/form', {
      customer: { ...req.body, customer_id: req.params.id },
      error: 'First name, last name, and phone are required.',
      action: `/customers/edit/${req.params.id}`
    });
  }

  try {
    await pool.execute(
      'UPDATE customers SET first_name = ?, last_name = ?, phone = ?, email = ? WHERE customer_id = ?',
      [first_name.trim(), last_name.trim(), phone.trim(), email || null, req.params.id]
    );
    res.redirect('/customers');
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not update the customer.');
  }
});

// DELETE: POST /customers/delete/:id
router.post('/delete/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    res.redirect('/customers');
  } catch (err) {
    // Business rule #8: kapag linked sa appointments, friendly error lang, hindi crash
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      const [rows] = await pool.execute('SELECT * FROM customers ORDER BY last_name');
      return res.render('customers/index', {
        customers: rows, search: '',
        error: 'Cannot delete: this customer has appointments on record.'
      });
    }
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;