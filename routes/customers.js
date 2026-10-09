const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getOrder } = require('../utils/sort');

// Mga pwedeng ayos ng listahan: A to Z, Z to A, newest, oldest
const ORDER_OPTIONS = {
  id: 'customer_id',
  name: 'last_name, first_name',
  phone: 'phone',
  email: 'email'
};

// Duplicate kung pareho ang pangalan at phone. excludeId ay para sa edit (hindi mabangga sa sarili)
async function isDuplicate(first, last, phone, excludeId) {
  const [rows] = await pool.execute(
    'SELECT customer_id FROM customers WHERE first_name = ? AND last_name = ? AND phone = ? AND customer_id <> ?',
    [first, last, phone, excludeId || 0]
  );
  return rows.length > 0;
}

// LIST + SEARCH + SORT: GET /customers?search=juan&order=newest
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
   const o = getOrder(req.query, ORDER_OPTIONS, 'name');
    const [rows] = await pool.execute(
      `SELECT * FROM customers
       WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?
       ORDER BY ${o.sql}`,
      [`%${search}%`, `%${search}%`, `%${search}%`]
    );
    res.render('customers/index', { customers: rows, search, error: null, order: o.key });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// ADD FORM
router.get('/add', (req, res) => {
  res.render('customers/form', { customer: {}, error: null, action: '/customers/add' });
});

// ADD SAVE
router.post('/add', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;

  if (!first_name.trim() || !last_name.trim() || !phone.trim()) {
    return res.render('customers/form', {
      customer: req.body, error: 'First name, last name, and phone are required.', action: '/customers/add'
    });
  }

  try {
    if (await isDuplicate(first_name.trim(), last_name.trim(), phone.trim())) {
      return res.render('customers/form', {
        customer: req.body, error: 'This customer already exists.', action: '/customers/add'
      });
    }
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

// EDIT FORM
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

// EDIT SAVE
router.post('/edit/:id', async (req, res) => {
  const { first_name, last_name, phone, email } = req.body;
  const formData = { ...req.body, customer_id: req.params.id };

  if (!first_name.trim() || !last_name.trim() || !phone.trim()) {
    return res.render('customers/form', {
      customer: formData, error: 'First name, last name, and phone are required.',
      action: `/customers/edit/${req.params.id}`
    });
  }

  try {
    if (await isDuplicate(first_name.trim(), last_name.trim(), phone.trim(), req.params.id)) {
      return res.render('customers/form', {
        customer: formData, error: 'This customer already exists.',
        action: `/customers/edit/${req.params.id}`
      });
    }
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

// DELETE
router.post('/delete/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM customers WHERE customer_id = ?', [req.params.id]);
    res.redirect('/customers');
  } catch (err) {
    // Business rule #8: kapag linked sa appointments, friendly error lang, hindi crash
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      const [rows] = await pool.execute('SELECT * FROM customers ORDER BY last_name, first_name');
      return res.render('customers/index', {
        customers: rows, search: '', order: 'az',
        error: 'Cannot delete: this customer has appointments on record.'
      });
    }
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;