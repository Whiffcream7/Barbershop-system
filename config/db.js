// Kinukuha ang mysql2 na may promise support para magamit ang async/await
const mysql = require('mysql2/promise');

// Pool = grupo ng connections na pwedeng gamitin ulit
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',          // default ng XAMPP
  password: '',          // default ng XAMPP ay walang password
  database: 'barbershop_db',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;