// mysql2 with promises so we can use async/await
const mysql = require('mysql2/promise');

// pool of database connections
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',          // XAMPP default
  password: '',          // XAMPP default is empty
  database: 'barbershop_db',
  waitForConnections: true,
  connectionLimit: 10
});

// used by the other files to run queries
module.exports = pool;