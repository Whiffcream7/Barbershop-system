const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// checks the form input, returns an error message or null if it's okay
function validateService(body) {
  const { service_name, price, duration_minutes } = body;
  if (!service_name.trim()) return 'Service name is required.';
  if (price === '' || isNaN(price) || Number(price) < 0) return 'Price must be a number, 0 or higher.';
  if (duration_minutes === '' || !Number.isInteger(Number(duration_minutes)) || Number(duration_minutes) <= 0) {
    return 'Duration must be a whole number of minutes, greater than 0.';
  }
  return null;
}

// LIST + SEARCH: GET /services?search=fade
router.get('/', async (req, res) => {
  try {
    const search = req.query.search || '';
    const [rows] = await pool.execute(
      `SELECT * FROM services
       WHERE service_name LIKE ? OR description LIKE ?
       ORDER BY service_name`,
      [`%${search}%`, `%${search}%`]
    );
    res.render('services/index', { services: rows, search, error: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// ADD FORM
router.get('/add', (req, res) => {
  res.render('services/form', { service: { is_active: 1 }, error: null, action: '/services/add' });
});

// ADD SAVE
router.post('/add', async (req, res) => {
  const error = validateService(req.body);
  if (error) {
    return res.render('services/form', { service: req.body, error, action: '/services/add' });
  }

  const { service_name, description, price, duration_minutes, is_active } = req.body;
  try {
    await pool.execute(
      'INSERT INTO services (service_name, description, price, duration_minutes, is_active) VALUES (?, ?, ?, ?, ?)',
      [service_name.trim(), description || null, price, duration_minutes, is_active === '1' ? 1 : 0]
    );
    res.redirect('/services');
  } catch (err) {
    console.error(err);
    res.render('services/form', {
      service: req.body, error: 'Could not save the service.', action: '/services/add'
    });
  }
});

// EDIT FORM
router.get('/edit/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM services WHERE service_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/services');
    res.render('services/form', {
      service: rows[0], error: null, action: `/services/edit/${req.params.id}`
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

// EDIT SAVE
router.post('/edit/:id', async (req, res) => {
  const error = validateService(req.body);
  if (error) {
    return res.render('services/form', {
      service: { ...req.body, service_id: req.params.id },
      error, action: `/services/edit/${req.params.id}`
    });
  }

  const { service_name, description, price, duration_minutes, is_active } = req.body;
  try {
    await pool.execute(
      `UPDATE services
       SET service_name = ?, description = ?, price = ?, duration_minutes = ?, is_active = ?
       WHERE service_id = ?`,
      [service_name.trim(), description || null, price, duration_minutes, is_active === '1' ? 1 : 0, req.params.id]
    );
    res.redirect('/services');
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not update the service.');
  }
});

// DELETE
router.post('/delete/:id', async (req, res) => {
  try {
    await pool.execute('DELETE FROM services WHERE service_id = ?', [req.params.id]);
    res.redirect('/services');
  } catch (err) {
    // Business rule #8: service is already used in appointments, so show a friendly error
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      const [rows] = await pool.execute('SELECT * FROM services ORDER BY service_name');
      return res.render('services/index', {
        services: rows, search: '',
        error: 'Cannot delete: this service is used in appointments. Set it to inactive instead.'
      });
    }
    console.error(err);
    res.status(500).send('Something went wrong.');
  }
});

module.exports = router;