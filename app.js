const express = require('express');
const path = require('path');
const pool = require('./config/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

pool.query('SELECT 1')
  .then(() => console.log('Database connected'))
  .catch(err => console.error('Database error:', err.message));

app.use('/customers', require('./routes/customers'));

app.listen(3000, () => console.log('Server running at http://localhost:3000'));